/**
 * TutorAI — Command palette (Ctrl/⌘ + K)
 * ------------------------------------------------------------------
 * Quick jump to any page, course or action. Opened from the topbar
 * search button or the keyboard shortcut. Results come from the
 * navigation config + TutorAI.api, so it grows with the app.
 */
(function (T) {
  'use strict';

  const { escape, url } = T.utils;
  T.components = T.components || {};

  const TONES = ['lavender', 'powder', 'sage', 'butter', 'pink', 'peach'];

  let el, input, list, items = [], filtered = [], active = 0, role, lastFocus;

  function baseItems() {
    const nav = T.navigation[role];
    const pages = nav.sections.flatMap(s => s.items).map((i, n) => ({
      group: 'Pages', label: i.label, icon: i.icon, tone: TONES[n % TONES.length], href: url(i.href), hint: 'Page'
    }));
    const actions = role === 'admin'
      ? [
          { group: 'Actions', label: 'Invite a user', icon: 'user-plus', tone: 'butter', hint: 'Action', run: () => T.ui.toast({ title: 'Invite a user', message: 'User invites arrive with the User Management stage.' }) },
          { group: 'Actions', label: 'Open student app', icon: 'graduation-cap', tone: 'lavender', href: url('pages/student/dashboard.html'), hint: 'Switch' }
        ]
      : [
          { group: 'Actions', label: 'Add a course', icon: 'plus', tone: 'butter', href: url('pages/student/courses.html?new=1'), hint: 'Action' },
          { group: 'Actions', label: 'Upload a lecture', icon: 'upload', tone: 'powder', href: url('pages/student/course-upload.html'), hint: 'Action' },
          { group: 'Actions', label: 'Ask the AI Tutor', icon: 'sparkles', tone: 'lavender', href: url('pages/student/ai-tutor.html'), hint: 'AI' },
          { group: 'Actions', label: 'Create a quiz', icon: 'wand-sparkles', tone: 'sage', href: url('pages/student/quiz-create.html'), hint: 'Action' },
          { group: 'Actions', label: 'See my progress', icon: 'chart-line', tone: 'peach', href: url('pages/student/progress.html'), hint: 'Page' }
        ];
    return [...actions, ...pages, { group: 'Help', label: 'Open the design system', icon: 'palette', tone: 'peach', href: url('pages/styleguide.html'), hint: 'Docs' }];
  }

  function render() {
    if (!filtered.length) {
      list.innerHTML = `<div class="tai-palette__empty">No matches. Try a page name or course code.</div>`;
      return;
    }
    let html = '', group = '';
    filtered.forEach((it, i) => {
      if (it.group !== group) { group = it.group; html += `<div class="tai-palette__group">${escape(group)}</div>`; }
      html += `
        <button type="button" class="tai-palette__item${i === active ? ' is-active' : ''}" data-index="${i}" role="option" aria-selected="${i === active}">
          <span class="tai-icon-tile tai-icon-tile--${it.tone}">${T.ui.icon(it.icon)}</span>
          <span>${escape(it.label)}</span>
          <small>${escape(it.hint || '')}</small>
        </button>`;
    });
    list.innerHTML = html;
    T.ui.icons(list);
    const cur = list.querySelector('.is-active');
    cur && cur.scrollIntoView({ block: 'nearest' });
  }

  function filter() {
    const q = input.value.trim().toLowerCase();
    filtered = q ? items.filter(i => (i.label + ' ' + (i.keywords || '')).toLowerCase().includes(q)) : items;
    active = 0;
    render();
  }

  function choose(i) {
    const it = filtered[i];
    if (!it) return;
    close();
    if (it.run) it.run();
    else if (it.href) window.location.href = it.href;
  }

  function open() {
    if (!el) return;
    lastFocus = document.activeElement;
    input.value = '';
    filter();
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tai-lock-scroll');
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    if (!el || !el.classList.contains('is-open')) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tai-lock-scroll');
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }

  async function init(r) {
    role = r;
    el = T.utils.toElement(`
      <div class="tai-palette" aria-hidden="true">
        <div class="tai-palette__panel" role="dialog" aria-modal="true" aria-label="Command palette">
          <div class="tai-palette__search">
            ${T.ui.icon('search')}
            <input class="tai-palette__input" type="text" placeholder="Search pages, courses and actions…" aria-label="Search" role="combobox" aria-expanded="true" autocomplete="off">
          </div>
          <div class="tai-palette__list" role="listbox"></div>
          <div class="tai-palette__foot"><span>↑ ↓ to move</span><span>↵ to open</span><span>Esc to close</span></div>
        </div>
      </div>`);
    document.body.appendChild(el);
    input = el.querySelector('input');
    list = el.querySelector('.tai-palette__list');
    items = baseItems();

    // Courses from the API (student only)
    if (role === 'student') {
      T.api.courses.list().then(courses => {
        items = items.concat(courses.map(c => ({
          group: 'Courses', label: c.title, keywords: c.code, icon: 'book-open',
          tone: c.color || 'lavender', hint: c.code, href: url(`pages/student/course.html?id=${encodeURIComponent(c.id)}`)
        })));
        if (el.classList.contains('is-open')) filter();
      }).catch(() => {});
    }

    T.ui.icons(el);
    input.addEventListener('input', filter);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index]');
      if (btn) choose(+btn.dataset.index);
    });
    list.addEventListener('mousemove', (e) => {
      const btn = e.target.closest('[data-index]');
      if (btn && +btn.dataset.index !== active) {
        active = +btn.dataset.index;
        list.querySelectorAll('.tai-palette__item').forEach(b => b.classList.toggle('is-active', b === btn));
      }
    });
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        el.classList.contains('is-open') ? close() : open();
      }
    });
  }

  T.components.Palette = { init, open, close };
})(window.TutorAI);
