/**
 * TutorAI — AI Tutor (pages/student/ai-tutor.html)
 * ------------------------------------------------------------------
 * One view: a row of compact course cards, and the selected course's
 * space below (components/course-chat.js — the same component as the
 * course workspace's AI Tutor tab).
 *
 * Cards come from TutorAI.api.tutor.spaces(): one per existing course,
 * computed live. Selecting a card swaps the space without a reload and
 * pushes ?course=… so back/forward and reload keep the selection.
 *   ?course=crs_…   selected course (default: most recently used)
 *   &lecture=lec_…  lecture scope for a new chat
 *   &c=conv_…       open this conversation (?c= alone selects its course)
 *   &ask=…          send this prompt once
 *   &q=… / &topic=… prefill the composer
 * Keyboard: ←/→ (and Home/End) move between cards; Enter/Space selects.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const UI = T.components.CourseUI;
  const { escape, url } = T.utils;

  const root = document.querySelector('[data-tutor-root]');
  const tutorUrl = (q = {}) => url(`pages/student/ai-tutor.html${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let spaces = [];
  let selectedId = null;
  let chat = null;
  let switching = 0;   // guards against overlapping switches

  /* ---- Load ---------------------------------------------------------------- */
  try {
    spaces = await T.api.tutor.spaces();
  } catch (err) {
    root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your courses', text: err.message })}</div>`;
    T.ui.icons(root);
    return;
  }

  const header = `
    <header class="tutor-head">
      <h1 class="tai-page-header__title mb-1">AI Tutor</h1>
      <p class="tai-page-header__subtitle">Pick a course — each space only reads that course’s lectures and your results in it.</p>
    </header>`;

  if (!spaces.length) {
    root.innerHTML = `${header}<div class="tai-card">${T.ui.emptyState({
      icon: 'sparkles', title: 'Add a course to use the AI Tutor',
      text: 'Each course gets its own AI Tutor space that answers from that course’s lectures and your results. Add your first course to get started.',
      actions: [{ label: 'Go to My Courses', icon: 'book-open', href: url('pages/student/courses.html?new=1') }]
    })}</div>`;
    T.ui.icons(root);
    return;
  }

  /** Most recently used: the course of the latest conversation, else the most recently opened course. */
  function defaultCourse() {
    const withChats = spaces.filter(s => s.lastConversation).sort((a, b) => b.lastConversation.updatedAt.localeCompare(a.lastConversation.updatedAt));
    return (withChats[0] || spaces.find(s => s.course.status !== 'archived') || spaces[0]).course.id;
  }

  /* ---- Cards ----------------------------------------------------------------- */
  function cardHtml(s) {
    const c = s.course;
    const on = c.id === selectedId;
    return `
      <button type="button" class="tutor-card${c.status === 'archived' ? ' is-archived' : ''}" style="${UI.coverStyle(c.color)}"
              data-course="${escape(c.id)}" aria-pressed="${on}" tabindex="${on ? 0 : -1}" aria-controls="tutor-stage"
              aria-label="${escape(`${c.code}: ${c.title}. ${c.mastery == null ? 'No mastery yet' : `Mastery ${c.mastery}%`}. ${s.conversationCount} chat${s.conversationCount === 1 ? '' : 's'}${c.status === 'archived' ? '. Archived' : ''}`)}">
        <span class="tutor-card__code">${escape(c.code)}</span>
        <span class="tutor-card__title">${escape(c.title)}</span>
        <span class="tutor-card__meta" aria-hidden="true">
          <span class="tutor-card__chip">${c.mastery == null ? 'Mastery —' : `Mastery ${c.mastery}%`}</span>
          <span class="tutor-card__chip">${T.ui.icon('messages-square')}${s.conversationCount}</span>
        </span>
      </button>`;
  }

  root.innerHTML = `
    ${header}
    <div class="tutor-cards" data-cards>
      <div class="tutor-cards__scroll" role="group" aria-label="Courses" data-cards-scroll>
        ${spaces.map(cardHtml).join('')}
      </div>
    </div>
    <div class="tutor-stage" id="tutor-stage" aria-live="off" data-stage></div>`;
  T.ui.icons(root);

  const row = root.querySelector('[data-cards-scroll]');
  const stage = root.querySelector('[data-stage]');
  const cards = () => Array.from(row.querySelectorAll('[data-course]'));

  /** Fade edges only where cards are cut off. */
  function updateFades() {
    const wrap = root.querySelector('[data-cards]');
    wrap.classList.toggle('has-left', row.scrollLeft > 4);
    wrap.classList.toggle('has-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  }
  row.addEventListener('scroll', updateFades, { passive: true });
  window.addEventListener('resize', T.utils.debounce(updateFades, 100));

  function markSelected() {
    cards().forEach(b => {
      const on = b.dataset.course === selectedId;
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  /** Refresh mastery / chat counts on the cards (after a chat is created or deleted). */
  async function refreshCards() {
    try {
      spaces = await T.api.tutor.spaces();
      const focusedId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.course : null;
      row.innerHTML = spaces.map(cardHtml).join('');
      T.ui.icons(row);
      if (focusedId) { const b = row.querySelector(`[data-course="${CSS.escape(focusedId)}"]`); if (b) b.focus({ preventScroll: true }); }
      updateFades();
    } catch (e) { /* keep the old cards */ }
  }

  /* ---- Space ----------------------------------------------------------------- */
  function writeUrl({ conversationId = null, lectureId = null } = {}, push = false) {
    const p = new URLSearchParams({ course: selectedId });
    if (lectureId) p.set('lecture', lectureId);
    if (conversationId) p.set('c', conversationId);
    const next = `${window.location.pathname}?${p}`;
    if (push) history.pushState({ course: selectedId }, '', next);
    else history.replaceState({ course: selectedId }, '', next);
  }

  async function select(courseId, { push = true, conversationId = null, lectureId = null, ask = null, prefill = '' } = {}) {
    const space = spaces.find(s => s.course.id === courseId);
    if (!space) return;
    if (courseId === selectedId && !conversationId && chat) return;
    const run = ++switching;
    const first = !chat;
    selectedId = courseId;
    markSelected();
    const btn = row.querySelector(`[data-course="${CSS.escape(courseId)}"]`);
    if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion || first ? 'auto' : 'smooth' });
    T.shell.setCrumbs([{ label: 'AI Tutor', href: tutorUrl() }, { label: space.course.code }]);
    if (push) writeUrl({ conversationId, lectureId }, true);

    if (!first && !reduceMotion) { stage.classList.add('is-leaving'); await sleep(120); }
    if (run !== switching) return;   // another card was picked meanwhile
    if (chat) { chat.destroy(); chat = null; }
    stage.innerHTML = '<div data-space></div>';
    stage.classList.remove('is-leaving');
    stage.classList.toggle('is-entering', !first && !reduceMotion);

    let lastConv = conversationId;
    chat = T.components.CourseChat.mount(stage.querySelector('[data-space]'), {
      courseId,
      variant: 'full',
      conversationId,
      lectureId,
      ask,
      prefill,
      autofocus: first,   // switching cards keeps keyboard focus in the card row
      onStateChange: (state) => {
        if (selectedId !== courseId) return;
        writeUrl(state);   // replaceState: drops ?ask= so a reload doesn't resend
        if (state.conversationId !== lastConv) {
          lastConv = state.conversationId;
          refreshCards();   // chat counts
        }
      }
    });
    chat.ready.then(() => stage.classList.remove('is-entering')).catch(() => {});
  }

  /* ---- Events -------------------------------------------------------------- */
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-course]');
    if (b) select(b.dataset.course);
  });

  row.addEventListener('keydown', (e) => {
    const list = cards();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = list[Math.min(list.length - 1, i + 1)];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = list[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (!next) return;
    e.preventDefault();
    list.forEach(b => { b.tabIndex = b === next ? 0 : -1; });
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  // Leaving the row puts the roving tab stop back on the selected card
  row.addEventListener('focusout', (e) => {
    if (row.contains(e.relatedTarget)) return;
    markSelected();
  });

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('course') && spaces.some(s => s.course.id === p.get('course')) ? p.get('course') : defaultCourse();
    if (id !== selectedId) select(id, { push: false, conversationId: p.get('c'), lectureId: p.get('lecture') });
  });

  /* ---- Boot ---------------------------------------------------------------- */
  const params = new URLSearchParams(window.location.search);
  let courseId = params.get('course');
  const convId = params.get('c');
  if (convId) {
    // A conversation always opens in its own course
    try { courseId = (await T.api.conversations.get(convId)).courseId; }
    catch (e) { T.ui.toast({ title: 'Conversation not found', message: 'It may have been deleted.', variant: 'warning' }); }
  }
  if (courseId && !spaces.some(s => s.course.id === courseId)) {
    T.ui.toast({ title: 'Course not found', message: 'It may have been deleted. Showing your most recent course instead.', variant: 'warning' });
    courseId = null;
  }
  await select(courseId || defaultCourse(), {
    push: false,
    conversationId: convId,
    lectureId: params.get('lecture'),
    ask: params.get('ask'),
    prefill: params.get('q') || (params.get('topic') ? `Explain ${params.get('topic')} simply` : '')
  });
  writeUrl({ conversationId: convId, lectureId: params.get('lecture') });
  updateFades();
});
