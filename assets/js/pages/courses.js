/**
 * TutorAI — My Courses (pages/student/courses.html)
 * ------------------------------------------------------------------
 * Search / filter / sort live in the URL (?q=&term=&status=&sort=)
 * so a refresh or a shared link keeps the view.
 * One modal adds and edits courses:
 *   create → TutorAI.api.courses.create   (POST /api/courses)
 *   edit   → TutorAI.api.courses.update   (PATCH /api/courses/{id})
 *   delete → TutorAI.api.courses.remove   (DELETE /api/courses/{id})
 * Deep links: ?new=1 opens the Add modal, ?edit=crs_2001 opens Edit.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;
  const UI = T.components.CourseUI;
  const { $, $$, escape, debounce } = T.utils;

  const page = document.getElementById('page-content');
  const grid = $('[data-course-grid]', page);
  const countEl = $('[data-course-count]', page);
  const filtersEl = $('[data-course-filters]', page);
  const searchEl = filtersEl.elements.q;
  const termEl = filtersEl.elements.term;
  const statusEl = filtersEl.elements.status;
  const sortGroup = $('[data-segmented]', filtersEl);

  const modalEl = document.getElementById('course-modal');
  const formEl = document.getElementById('course-form');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  const submitBtn = $('[type="submit"]', formEl);
  const descEl = formEl.elements.description;
  const descCount = document.getElementById('course-description-count');

  const SORTS = ['recent', 'name', 'progress'];
  let courses = [];
  let editingId = null;
  let highlightId = null;

  /* ---- URL state ---------------------------------------------------------- */
  const params = new URLSearchParams(window.location.search);
  const state = {
    q: params.get('q') || '',
    term: params.get('term') || '',
    status: ['active', 'archived'].includes(params.get('status')) ? params.get('status') : '',
    sort: SORTS.includes(params.get('sort')) ? params.get('sort') : 'recent'
  };

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.term) p.set('term', state.term);
    if (state.status) p.set('status', state.status);
    if (state.sort !== 'recent') p.set('sort', state.sort);
    const qs = p.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }

  /* ---- Terms --------------------------------------------------------------- */
  /** Previous three terms, the current one and the next two, newest first. */
  function termOptions(extra = []) {
    const seasons = ['Winter', 'Summer', 'Fall'];   // Jan–Apr, May–Aug, Sep–Dec
    const now = new Date();
    let year = now.getFullYear();
    let idx = Math.floor(now.getMonth() / 4);
    const list = [];
    // start two terms ahead
    for (let i = 0; i < 2; i++) { idx++; if (idx > 2) { idx = 0; year++; } }
    for (let i = 0; i < 6; i++) {
      list.push(`${seasons[idx]} ${year}`);
      idx--; if (idx < 0) { idx = 2; year--; }
    }
    extra.filter(t => t && !list.includes(t)).forEach(t => list.push(t));
    return list;
  }
  const currentTerm = () => {
    const now = new Date();
    return `${['Winter', 'Summer', 'Fall'][Math.floor(now.getMonth() / 4)]} ${now.getFullYear()}`;
  };

  /* ---- Render -------------------------------------------------------------- */
  function filtered() {
    const q = state.q.trim().toLowerCase();
    const list = courses.filter(c =>
      (!q || `${c.title} ${c.code}`.toLowerCase().includes(q)) &&
      (!state.term || c.term === state.term) &&
      (!state.status || c.status === state.status));
    const sorters = {
      recent: (a, b) => String(b.lastAccessedAt || '').localeCompare(String(a.lastAccessedAt || '')),
      name: (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }),
      progress: (a, b) => b.progress - a.progress || (b.mastery ?? -1) - (a.mastery ?? -1) || a.title.localeCompare(b.title)
    };
    return list.sort(sorters[state.sort]);
  }

  function renderTermFilter() {
    const terms = [...new Set(courses.map(c => c.term).filter(Boolean))]
      .sort((a, b) => termSortKey(b) - termSortKey(a));
    if (state.term && !terms.includes(state.term)) terms.unshift(state.term);
    termEl.innerHTML = `<option value="">All terms</option>${terms.map(t => `<option${t === state.term ? ' selected' : ''}>${escape(t)}</option>`).join('')}`;
  }
  function termSortKey(term) {
    const [season, year] = String(term).split(' ');
    return (parseInt(year, 10) || 0) * 10 + (['Winter', 'Summer', 'Fall'].indexOf(season) + 1);
  }

  function render() {
    const list = filtered();
    const filtering = state.q || state.term || state.status;

    if (!courses.length) {
      countEl.textContent = '';
      grid.innerHTML = `<div class="col-12"><div class="tai-card">${T.ui.emptyState({
        icon: 'book-open', title: 'No courses yet',
        text: 'Add your first course, then upload lecture PDFs to study with the AI Tutor and practice quizzes.',
        actions: [{ label: 'Add your first course', icon: 'plus', attrs: 'data-action="add-course"' }]
      })}</div></div>`;
    } else if (!list.length) {
      countEl.textContent = `No courses match your filters (${courses.length} in total).`;
      grid.innerHTML = `<div class="col-12"><div class="tai-card">${T.ui.emptyState({
        icon: 'search-x', tone: 'butter', title: 'No courses match',
        text: state.q ? `Nothing matches “${state.q}” with the current filters.` : 'No courses match the current filters.',
        actions: [{ label: 'Clear filters', icon: 'x', variant: 'secondary', attrs: 'data-action="clear-filters"' }]
      })}</div></div>`;
    } else {
      countEl.textContent = filtering
        ? `Showing ${list.length} of ${courses.length} course${courses.length === 1 ? '' : 's'}`
        : `${courses.length} course${courses.length === 1 ? '' : 's'}`;
      grid.innerHTML = list.map(c => `<div class="col-md-6 col-xl-4">${T.components.CourseCard.render(c, { menu: true, headingLevel: 2 })}</div>`).join('');
    }
    T.ui.enhance(grid);

    if (highlightId) {
      const card = grid.querySelector(`[data-course-id="${CSS.escape(highlightId)}"]`);
      if (card) {
        card.classList.add('is-new');
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      highlightId = null;
    }
  }

  async function load() {
    try {
      courses = await T.api.courses.list();
      renderTermFilter();
      render();
    } catch (err) {
      grid.innerHTML = `<div class="col-12"><div class="tai-card">${T.ui.emptyState({
        icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your courses', text: err.message,
        actions: [{ label: 'Try again', icon: 'refresh-cw', attrs: 'data-action="reload"' }]
      })}</div></div>`;
      T.ui.icons(grid);
    }
  }

  /* ---- Filters ------------------------------------------------------------- */
  searchEl.value = state.q;
  statusEl.value = state.status;
  filtersEl.addEventListener('submit', (e) => e.preventDefault());
  searchEl.addEventListener('input', debounce(() => { state.q = searchEl.value; syncUrl(); render(); }, 180));
  termEl.addEventListener('change', () => { state.term = termEl.value; syncUrl(); render(); });
  statusEl.addEventListener('change', () => { state.status = statusEl.value; syncUrl(); render(); });

  function setSortButtons() {
    $$('.tai-segmented__item', sortGroup).forEach(b => {
      const on = b.dataset.value === state.sort;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      b.removeAttribute('aria-selected');
    });
  }
  sortGroup.addEventListener('tai:segment', (e) => {
    state.sort = SORTS.includes(e.detail.value) ? e.detail.value : 'recent';
    setSortButtons();
    syncUrl();
    render();
  });
  // Move the sliding indicator to the sort from the URL
  const initialSort = $(`.tai-segmented__item[data-value="${state.sort}"]`, sortGroup);
  if (initialSort && state.sort !== 'recent') initialSort.click(); else setSortButtons();

  function clearFilters() {
    state.q = ''; state.term = ''; state.status = '';
    searchEl.value = ''; termEl.value = ''; statusEl.value = '';
    syncUrl();
    render();
    searchEl.focus();
  }

  /* ---- Modal --------------------------------------------------------------- */
  $('[data-swatches]', formEl).innerHTML = UI.COLORS.map((c, i) => `
    <label class="tai-swatch-option" style="--swatch:var(--tai-${c});--swatch-ink:var(--tai-${c}-ink)" title="${escape(UI.COLOR_LABELS[c])}">
      <input type="radio" name="color" value="${c}"${i === 0 ? ' checked' : ''}>
      <span class="tai-swatch-option__dot">${T.ui.icon('check')}</span>
      <span class="visually-hidden">${escape(UI.COLOR_LABELS[c])}</span>
    </label>`).join('');
  T.ui.icons(formEl);

  const updateCount = () => {
    const n = descEl.value.length;
    descCount.textContent = `${n} / 1000`;
    descCount.classList.toggle('text-pink-ink', n >= 950);
  };
  descEl.addEventListener('input', updateCount);

  const courseForm = V.bind(formEl, {
    code: [V.required('Enter a course code, like COMP 3610.'), V.maxLength(20)],
    term: [V.required('Choose a term.')],
    title: [V.required('Enter the course title.'), V.maxLength(120)],
    instructor: [V.maxLength(80)],
    description: [V.maxLength(1000)]
  }, {
    onSubmit: async (values, form) => {
      const payload = {
        code: values.code, title: values.title, instructor: values.instructor,
        term: values.term, color: values.color || 'lavender', description: values.description
      };
      if (editingId) payload.status = values.status ? 'archived' : 'active';
      T.ui.setButtonLoading(submitBtn, true);
      try {
        const saved = editingId
          ? await T.api.courses.update(editingId, payload)
          : await T.api.courses.create(payload);
        highlightId = saved.id;
        modal.hide();
        T.ui.toast({
          title: editingId ? 'Course updated' : 'Course added',
          message: editingId ? `${saved.code} has been saved.` : `${saved.code} — ${saved.title} is ready. Upload a lecture to get started.`,
          variant: 'success'
        });
        // Make sure a new or edited course isn't hidden by the current filters
        if (state.q || state.term || state.status) {
          const visible = (!state.term || saved.term === state.term) && (!state.status || saved.status === state.status) &&
            (!state.q || `${saved.title} ${saved.code}`.toLowerCase().includes(state.q.toLowerCase()));
          if (!visible) { state.q = ''; state.term = ''; state.status = ''; searchEl.value = ''; statusEl.value = ''; syncUrl(); }
        }
        await load();
      } catch (err) {
        if (!form.showServerErrors(err)) V.formAlert(formEl, { title: 'Couldn’t save the course', message: err.message });
      } finally {
        T.ui.setButtonLoading(submitBtn, false);
      }
    }
  });

  function openModal(course = null) {
    editingId = course ? course.id : null;
    courseForm.reset();
    const terms = termOptions(course ? [course.term] : []);
    formEl.elements.term.innerHTML = `<option value="">Choose a term</option>${terms.map(t => `<option>${escape(t)}</option>`).join('')}`;

    const f = formEl.elements;
    f.code.value = course ? course.code : '';
    f.title.value = course ? course.title : '';
    f.instructor.value = course ? course.instructor || '' : '';
    f.term.value = course ? course.term : currentTerm();
    f.description.value = course ? course.description || '' : '';
    const color = course ? course.color : UI.COLORS[courses.length % UI.COLORS.length];
    $$('input[name="color"]', formEl).forEach(r => { r.checked = r.value === color; });
    f.status.checked = !!course && course.status === 'archived';
    $$('[data-edit-only]', formEl).forEach(el => { el.hidden = !course; });
    updateCount();

    $('#course-modal-title').textContent = course ? `Edit ${course.code}` : 'Add a course';
    $('[data-modal-subtitle]', formEl).textContent = course
      ? 'Changes apply everywhere this course appears.'
      : 'Create a space for a course’s lectures, quizzes and progress.';
    $('[data-submit-label]', formEl).textContent = course ? 'Save changes' : 'Add course';
    modal.show();
  }
  modalEl.addEventListener('shown.bs.modal', () => formEl.elements.code.focus());

  /* ---- Delete -------------------------------------------------------------- */
  async function deleteCourse(course) {
    const extras = [
      course.lectureCount ? `${course.lectureCount} lecture${course.lectureCount === 1 ? '' : 's'}` : '',
      course.quizCount ? `${course.quizCount} quiz${course.quizCount === 1 ? '' : 'zes'}` : ''
    ].filter(Boolean).join(' and ');
    const ok = await T.ui.confirm({
      title: `Delete ${course.code} — ${course.title}?`,
      message: `${extras ? `This also deletes its ${extras}. ` : ''}This can’t be undone.`,
      confirmLabel: 'Delete course',
      danger: true
    });
    if (!ok) return;
    try {
      await T.api.courses.remove(course.id);
      T.ui.toast({ title: 'Course deleted', message: `${course.code} — ${course.title} was removed.`, variant: 'success' });
      await load();
      searchEl.focus();
    } catch (err) {
      T.ui.toast({ title: 'Couldn’t delete the course', message: err.message, variant: 'danger' });
    }
  }

  /* ---- Events -------------------------------------------------------------- */
  page.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'add-course') openModal();
      else if (action.dataset.action === 'clear-filters') clearFilters();
      else if (action.dataset.action === 'reload') load();
      return;
    }
    const btn = e.target.closest('[data-course-action]');
    if (!btn) return;
    const course = courses.find(c => c.id === btn.dataset.id);
    if (!course) return;
    if (btn.dataset.courseAction === 'edit') openModal(course);
    else if (btn.dataset.courseAction === 'delete') deleteCourse(course);
  });

  /* ---- Boot ---------------------------------------------------------------- */
  await load();
  const deep = new URLSearchParams(window.location.search);
  if (deep.get('new') === '1') {
    openModal();
  } else if (deep.get('edit')) {
    const c = courses.find(x => x.id === deep.get('edit'));
    if (c) openModal(c);
    else T.ui.toast({ title: 'Course not found', message: 'That course may have been deleted.', variant: 'warning' });
  }
  if (deep.has('new') || deep.has('edit')) syncUrl();
});
