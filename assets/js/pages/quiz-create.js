/**
 * TutorAI — Quiz setup (pages/student/quiz-create.html)
 * ------------------------------------------------------------------
 *   ?course=crs_…&lecture=lec_…   preselect in the builder
 *   ?draft=qz_…                   open the preview of a generated draft
 *                                 (lecture workspace / AI Tutor / weak topics)
 * Two ways in, one generator (TutorAI.api.quizzes.generate):
 *   a) Describe it → quizzes.parse → fills the builder → generate
 *   b) Build it    → validated form → generate
 * The draft lives on the server; the preview gets questions WITHOUT answers.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;
  const UI = T.components.CourseUI;
  const E = T.quizEngine;
  const MD = T.markdown;
  const { $, $$, escape, url } = T.utils;

  const root = document.querySelector('[data-create-root]');
  const live = document.querySelector('[data-live]');
  const announce = (m) => { live.textContent = ''; setTimeout(() => { live.textContent = m; }, 40); };
  const params = new URLSearchParams(window.location.search);
  const TYPE_LABELS = { mcq: 'Multiple choice', multi: 'Multiple select', true_false: 'True / false', short: 'Short answer' };
  const LIMITS = [5, 10, 15, 20, 30, 45, 60];

  let courses = [];
  let lectures = [];       // all lectures of the selected course
  let draft = null;
  let focusTerms = [];     // from "Describe it"
  let builder = null;

  T.shell.setCrumbs([{ label: 'Quizzes', href: url('pages/student/quizzes.html') }, { label: 'Create a quiz' }]);

  function empty(o) {
    root.innerHTML = `${T.ui.pageHeader({ eyebrow: 'Practice', title: 'Create a quiz' })}<div class="tai-card">${T.ui.emptyState(o)}</div>`;
    T.ui.icons(root);
  }

  /* ====================================================================== */
  /* Setup view                                                              */
  /* ====================================================================== */
  function setupHtml() {
    return `
      ${T.ui.pageHeader({ eyebrow: 'Practice', title: 'Create a quiz', subtitle: 'Questions come only from the course and lectures you choose, each tagged with its lecture, page and topic.' })}
      <div class="row g-4">
        <div class="col-lg-8 d-flex flex-column gap-4">
          <section class="tai-card qc-describe" aria-labelledby="describe-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="describe-title">${T.ui.icon('sparkles', 'icon-sm')} Describe it</h2><p class="tai-card__subtitle">Say what you want — TutorAI fills in the settings below</p></div></div>
            <form id="describe-form" action="/quizzes/parse" method="post" novalidate>
              <div data-form-status></div>
              <div class="tai-field mb-3">
                <label class="visually-hidden" for="describe-text">Describe your quiz</label>
                <textarea id="describe-text" name="text" class="form-control" rows="2" maxlength="300" placeholder="Quiz me on joins and indexing, 10 hard questions" required></textarea>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-2">
                <button type="submit" class="btn btn-soft">${T.ui.icon('wand-sparkles')}<span>Create from description</span></button>
                <div class="qc-understood" data-understood aria-live="polite"></div>
              </div>
            </form>
          </section>

          <section class="tai-card" aria-labelledby="build-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="build-title">${T.ui.icon('sliders-horizontal', 'icon-sm')} Build it</h2><p class="tai-card__subtitle">One course per quiz · pick lectures, length and question types</p></div></div>
            <form id="build-form" action="/quizzes/generate" method="post" novalidate>
              <div data-form-status></div>
              <div class="row gx-3">
                <div class="col-md-7 tai-field">
                  <label class="form-label" for="qc-course">Course</label>
                  <select id="qc-course" name="course_id" class="form-select" required>
                    <option value="">Choose a course</option>
                    ${courses.map(c => `<option value="${escape(c.id)}">${escape(c.code)} — ${escape(c.title)}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-5 tai-field">
                  <label class="form-label" for="qc-difficulty">Difficulty</label>
                  <select id="qc-difficulty" name="difficulty" class="form-select">
                    <option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option><option value="mixed">Mixed</option>
                  </select>
                </div>
              </div>

              <fieldset class="tai-field" data-lectures-field>
                <legend class="form-label">Lectures</legend>
                <div data-lectures><p class="tai-meta mb-0">Choose a course to see its lectures.</p></div>
                <input type="hidden" name="lectures_check" id="qc-lectures">
              </fieldset>

              <div class="row gx-3">
                <fieldset class="col-md-6 tai-field">
                  <legend class="form-label">Number of questions</legend>
                  <div class="qc-choice" role="radiogroup" aria-label="Number of questions">
                    ${[5, 10, 15, 20].map(n => `<label><input type="radio" name="count" value="${n}"${n === 10 ? ' checked' : ''}><span>${n}</span></label>`).join('')}
                  </div>
                </fieldset>
                <div class="col-md-6 tai-field">
                  <label class="form-label" for="qc-limit">Time limit <span class="tai-muted fw-normal">(optional)</span></label>
                  <select id="qc-limit" name="time_limit" class="form-select">
                    <option value="">No time limit</option>${LIMITS.map(m => `<option value="${m}">${m} minutes</option>`).join('')}
                  </select>
                </div>
              </div>

              <fieldset class="tai-field">
                <legend class="form-label">Question types</legend>
                <div class="qc-types">
                  ${Object.entries(TYPE_LABELS).map(([v, l], i) => `
                    <div class="form-check"><input class="form-check-input" type="checkbox" name="types" value="${v}" id="qc-type-${v}"${i < 3 ? ' checked' : ''}><label class="form-check-label" for="qc-type-${v}">${l}</label></div>`).join('')}
                </div>
                <input type="hidden" name="types_check" id="qc-types">
              </fieldset>

              <div class="tai-field mb-0">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" role="switch" id="qc-explanations" name="explanations" checked>
                  <label class="form-check-label" for="qc-explanations">Show explanations in the results</label>
                </div>
              </div>
            </form>
          </section>
        </div>

        <div class="col-lg-4">
          <aside class="tai-card qc-summary" aria-labelledby="summary-title">
            <h2 class="tai-card__title mb-3" id="summary-title">Summary</h2>
            <dl class="qc-summary__list" data-summary></dl>
            <button type="submit" form="build-form" class="btn btn-primary w-100 mt-3">${T.ui.icon('wand-sparkles')}<span>Generate quiz</span></button>
            <p class="tai-small tai-muted mt-2 mb-0">You’ll see the questions before you start. Answers stay hidden until you submit.</p>
          </aside>
        </div>
      </div>`;
  }

  const form = () => document.getElementById('build-form');
  const checkedTypes = () => $$('input[name="types"]:checked', form()).map(i => i.value);
  const checkedLectures = () => $$('input[name="lecture_ids"]:checked', form()).map(i => i.value);
  const ready = () => lectures.filter(l => l.status === 'ready');

  async function loadLectures(courseId, preselect = null) {
    const box = $('[data-lectures]', root);
    if (!courseId) { lectures = []; box.innerHTML = '<p class="tai-meta mb-0">Choose a course to see its lectures.</p>'; return; }
    box.innerHTML = T.ui.skeleton('text', 2);
    lectures = (await T.api.lectures.list(courseId)).sort((a, b) => (a.lectureNumber || 999) - (b.lectureNumber || 999));
    if (!ready().length) {
      box.innerHTML = T.ui.emptyState({ icon: 'file-up', tone: 'butter', compact: true, title: 'No ready lectures in this course', text: 'Quizzes are written from lecture pages. Upload a lecture PDF first.', actions: [{ label: 'Upload a lecture', icon: 'upload', href: UI.uploadUrl(courseId) }] });
      T.ui.icons(box);
      return;
    }
    const pre = preselect ? new Set(preselect) : null;
    box.innerHTML = `
      <div class="form-check qc-all"><input class="form-check-input" type="checkbox" id="qc-all" data-all${!pre ? ' checked' : ''}><label class="form-check-label fw-semibold" for="qc-all">All ready lectures (${ready().length})</label></div>
      <div class="qc-lectures">${lectures.map(l => {
        const ok = l.status === 'ready';
        return `<div class="form-check"><input class="form-check-input" type="checkbox" name="lecture_ids" value="${escape(l.id)}" id="qc-l-${escape(l.id)}"${ok && (!pre || pre.has(l.id)) ? ' checked' : ''}${ok ? '' : ' disabled'}>
          <label class="form-check-label" for="qc-l-${escape(l.id)}">${escape(UI.lectureLabel(l))}: ${escape(l.title)}${ok ? '' : ` <span class="tai-muted">(${escape((UI.LECTURE_STATUS[l.status] || {}).label || l.status)})</span>`}</label></div>`;
      }).join('')}</div>`;
    syncAll();
  }

  function syncAll() {
    const all = $('[data-all]', root);
    if (!all) return;
    const n = checkedLectures().length;
    all.checked = n === ready().length;
    all.indeterminate = n > 0 && n < ready().length;
  }

  function renderSummary() {
    const f = form();
    const course = courses.find(c => c.id === f.elements.course_id.value);
    const lecs = checkedLectures().map(id => lectures.find(l => l.id === id)).filter(Boolean);
    const count = Number((f.querySelector('input[name="count"]:checked') || {}).value || 10);
    const types = checkedTypes();
    const limit = f.elements.time_limit.value;
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    $('[data-summary]', root).innerHTML = [
      row('Course', course ? `<span class="tai-badge tai-badge--${escape(course.color)}">${escape(course.code)}</span> ${escape(course.title)}` : '<span class="tai-muted">Not chosen</span>'),
      row('Lectures', lecs.length ? (lecs.length === ready().length && lecs.length > 1 ? `All ${lecs.length} ready lectures` : lecs.map(l => escape(UI.lectureLabel(l))).join(', ')) : '<span class="tai-muted">None</span>'),
      row('Questions', `${count} · ${escape(f.elements.difficulty.value)}`),
      row('Types', types.length ? types.map(t => escape(TYPE_LABELS[t])).join(', ') : '<span class="tai-muted">None</span>'),
      row('Focus', focusTerms.length ? escape(focusTerms.join(', ')) : '<span class="tai-muted">Whole lectures</span>'),
      row('Estimated time', `${E.estimateMinutes(count, types)} min${limit ? ` · limit ${escape(limit)} min` : ''}`)
    ].join('');
  }

  function bindBuilder() {
    const f = form();
    builder = V.bind(f, {
      course_id: [V.required('Choose a course.')],
      lectures_check: [() => (!ready().length && f.elements.course_id.value ? 'This course has no ready lectures yet.' : checkedLectures().length ? null : 'Choose at least one lecture.')],
      types_check: [() => (checkedTypes().length ? null : 'Choose at least one question type.')]
    }, {
      fieldMap: { courseId: 'course_id', lectureIds: 'lectures_check', types: 'types_check' },
      onSubmit: async (values, b) => {
        const btn = $('.qc-summary [type="submit"]', root);
        T.ui.setButtonLoading(btn, true);
        await generate({
          courseId: values.course_id, lectureIds: checkedLectures(),
          count: Number(f.querySelector('input[name="count"]:checked').value), difficulty: values.difficulty,
          types: checkedTypes(), explanations: f.elements.explanations.checked,
          timeLimitMin: values.time_limit ? Number(values.time_limit) : null,
          source: focusTerms.length ? 'ai' : 'lecture', focusTerms
        }, b, f);
        T.ui.setButtonLoading(btn, false);
      }
    });
    f.addEventListener('change', async (e) => {
      if (e.target.name === 'course_id') {
        focusTerms = [];
        $('[data-understood]', root).innerHTML = '';
        await loadLectures(e.target.value);
      }
      if (e.target.matches('[data-all]')) $$('input[name="lecture_ids"]:not(:disabled)', f).forEach(i => { i.checked = e.target.checked; });
      if (e.target.name === 'lecture_ids') syncAll();
      if (e.target.name === 'lecture_ids' || e.target.matches('[data-all]')) { V.clearError(f.elements.lectures_check); focusTerms = []; }
      if (e.target.name === 'types') V.clearError(f.elements.types_check);
      renderSummary();
    });
  }

  function bindDescribe() {
    const df = document.getElementById('describe-form');
    V.bind(df, { text: [V.required('Describe the quiz you want.'), V.maxLength(300)] }, {
      onSubmit: async (values, b) => {
        const btn = $('[type="submit"]', df);
        T.ui.setButtonLoading(btn, true);
        try {
          const r = await T.api.quizzes.parse({ text: values.text, courseId: form().elements.course_id.value || null });
          const f = form();
          f.elements.course_id.value = r.courseId;
          await loadLectures(r.courseId, r.lectureIds);
          f.elements.difficulty.value = r.difficulty;
          const count = f.querySelector(`input[name="count"][value="${r.count}"]`); if (count) count.checked = true;
          $$('input[name="types"]', f).forEach(i => { i.checked = r.types.includes(i.value); });
          focusTerms = r.focusTerms || [];
          $('[data-understood]', root).innerHTML = `<span class="tai-small tai-muted">Understood:</span>${r.understood.map(u => `<span class="tai-badge tai-badge--lavender">${escape(u)}</span>`).join('')}`;
          renderSummary();
          announce(`Settings filled in: ${r.understood.join(', ')}. Generating…`);
          await generate({
            courseId: r.courseId, lectureIds: checkedLectures(), count: r.count, difficulty: r.difficulty, types: r.types,
            explanations: f.elements.explanations.checked, timeLimitMin: f.elements.time_limit.value ? Number(f.elements.time_limit.value) : null,
            source: 'ai', focusTerms, title: r.label ? `${r.courseCode}: ${r.label}` : ''
          }, b, df);
        } catch (err) {
          if (!b.showServerErrors(err)) V.formAlert(df, { title: 'Couldn’t read that request', message: err.message });
        } finally {
          T.ui.setButtonLoading(btn, false);
        }
      }
    });
  }

  async function generate(opts, binder, formEl) {
    const course = courses.find(c => c.id === opts.courseId);
    showLoading(opts, course);
    try {
      draft = await T.api.quizzes.generate(opts);
      showPreview();
    } catch (err) {
      renderSetup(opts);
      const b = binder && formEl === form() ? builder : binder;
      if (!(b && b.showServerErrors(err))) V.formAlert(formEl && document.body.contains(formEl) ? formEl : form(), { title: 'Couldn’t generate the quiz', message: err.message });
    }
  }

  function showLoading(opts, course) {
    root.innerHTML = `
      ${T.ui.pageHeader({ eyebrow: 'Practice', title: 'Writing your quiz…', subtitle: `${opts.count} ${opts.difficulty} questions from ${opts.lectureIds.length} lecture${opts.lectureIds.length === 1 ? '' : 's'} in ${course ? course.code : 'your course'}.` })}
      <div class="tai-card" aria-busy="true">${T.ui.spinner({ label: 'Reading lecture pages and writing questions…' })}${T.ui.skeleton('list', 4)}</div>`;
    announce('Generating your quiz…');
  }

  /** Back to the form, keeping the last settings. */
  async function renderSetup(opts = null) {
    draft = null;
    root.innerHTML = setupHtml();
    T.ui.icons(root);
    bindBuilder();
    bindDescribe();
    const f = form();
    const courseId = (opts && opts.courseId) || params.get('course') || (courses.find(c => c.status !== 'archived') || {}).id || '';
    f.elements.course_id.value = courses.some(c => c.id === courseId) ? courseId : '';
    await loadLectures(f.elements.course_id.value, opts ? opts.lectureIds : params.get('lecture') ? [params.get('lecture')] : null);
    if (opts) {
      f.elements.difficulty.value = opts.difficulty;
      const c = f.querySelector(`input[name="count"][value="${opts.count}"]`); if (c) c.checked = true;
      $$('input[name="types"]', f).forEach(i => { i.checked = opts.types.includes(i.value); });
      f.elements.explanations.checked = opts.explanations !== false;
      f.elements.time_limit.value = opts.timeLimitMin ? String(opts.timeLimitMin) : '';
    }
    renderSummary();
    history.replaceState(null, '', window.location.pathname + (f.elements.course_id.value ? `?course=${encodeURIComponent(f.elements.course_id.value)}` : ''));
  }

  /* ====================================================================== */
  /* Preview view                                                            */
  /* ====================================================================== */
  function questionCard(q, i) {
    const lec = (draft.lectures || []).find(l => l.id === q.lectureId);
    return `
      <li class="qc-q" data-qid="${escape(q.id)}">
        <div class="qc-q__head">
          <span class="qc-q__num">${i + 1}</span>
          <span class="tai-badge tai-badge--outline tai-badge--sm">${escape(TYPE_LABELS[q.type])}</span>
          <span class="tai-badge tai-badge--sm tai-badge--${q.difficulty === 'hard' ? 'pink' : q.difficulty === 'easy' ? 'sage' : 'butter'}">${escape(q.difficulty)}</span>
          <button type="button" class="btn btn-ghost btn-sm ms-auto" data-swap="${escape(q.id)}" aria-label="Swap question ${i + 1}">${T.ui.icon('shuffle')}<span>Swap</span></button>
        </div>
        <div class="tai-prose qc-q__prompt">${MD.renderMarkdown(q.prompt)}</div>
        ${q.type === 'short'
          ? `<p class="qc-q__short">${T.ui.icon('pen-line', 'icon-xs')} Short written answer (up to ${q.maxLength} characters)</p>`
          : `<ul class="qc-q__options">${q.options.map(o => `<li>${escape(o.text)}</li>`).join('')}</ul>`}
        <p class="qc-q__source">${T.ui.icon('file-text', 'icon-xs')} ${escape(lec ? `${UI.lectureLabel(lec)}: ${lec.title}` : 'Lecture')} · p. ${q.page} · ${escape(q.topic || '')}</p>
      </li>`;
  }

  function showPreview() {
    const s = draft.settings;
    history.replaceState(null, '', `${window.location.pathname}?draft=${encodeURIComponent(draft.id)}`);
    T.shell.setCrumbs([{ label: 'Quizzes', href: url('pages/student/quizzes.html') }, { label: 'Create a quiz', href: url('pages/student/quiz-create.html') }, { label: 'Preview' }]);
    root.innerHTML = `
      ${T.ui.pageHeader({
        eyebrow: `Preview · ${draft.course.code}`, title: draft.title,
        subtitle: `${draft.questionCount} questions · ${s.types.map(t => TYPE_LABELS[t]).join(', ')} · ${draft.difficulty} · about ${E.estimateMinutes(draft.questionCount, s.types)} min${s.timeLimitMin ? ` · ${s.timeLimitMin} min limit` : ''}`,
        actions: `
          <button type="button" class="btn btn-ghost" data-action="settings">${T.ui.icon('arrow-left')}<span>Settings</span></button>
          <button type="button" class="btn btn-secondary" data-action="regenerate">${T.ui.icon('refresh-cw')}<span>Regenerate all</span></button>
          <button type="button" class="btn btn-secondary" data-action="save">${T.ui.icon('bookmark')}<span>Save for later</span></button>
          <button type="button" class="btn btn-primary" data-action="start">${T.ui.icon('play')}<span>Start quiz</span></button>`
      })}
      ${draft.notice ? `<div class="alert alert-warning" role="status">${T.ui.icon('triangle-alert')}<div class="alert-body"><p>${escape(draft.notice)}</p></div></div>` : ''}
      <div class="alert alert-ai" role="note">${T.ui.icon('eye-off')}<div class="alert-body"><p class="alert-title">Answers are hidden</p><p>This preview never includes the answers — you’ll see them, with explanations and page references, after you submit.</p></div></div>
      <section class="tai-card" aria-label="Questions">
        <ol class="qc-questions" data-questions>${draft.questions.map(questionCard).join('')}</ol>
      </section>`;
    T.ui.icons(root);
    announce(`Preview ready: ${draft.questionCount} questions.`);
    if (draft.status === 'ready' && $('[data-action="save"]', root)) {
      const b = $('[data-action="save"]', root);
      b.disabled = true; b.querySelector('span').textContent = 'Saved';
    }
  }

  async function onPreviewClick(e) {
    const swap = e.target.closest('[data-swap]');
    if (swap) {
      T.ui.setButtonLoading(swap, true);
      try {
        const q = await T.api.quizzes.swapQuestion(draft.id, swap.dataset.swap);
        const idx = draft.questions.findIndex(x => x.id === swap.dataset.swap);
        draft.questions[idx] = q;
        const li = swap.closest('.qc-q');
        li.outerHTML = questionCard(q, idx);
        const fresh = $(`[data-qid="${CSS.escape(q.id)}"]`, root);
        T.ui.icons(fresh);
        fresh.classList.add('is-highlighted');
        $('[data-swap]', fresh).focus();
        announce(`Question ${idx + 1} swapped.`);
      } catch (err) {
        T.ui.setButtonLoading(swap, false);
        T.ui.toast({ title: 'Couldn’t swap that question', message: err.message, variant: 'warning' });
      }
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'settings') {
      const s = draft.settings;
      return renderSetup({ courseId: draft.courseId, lectureIds: draft.lectureIds, count: s.count, difficulty: draft.difficulty, types: s.types, explanations: s.explanations, timeLimitMin: s.timeLimitMin });
    }
    T.ui.setButtonLoading(a, true);
    try {
      if (a.dataset.action === 'regenerate') {
        draft = await T.api.quizzes.regenerate(draft.id);
        showPreview();
      } else if (a.dataset.action === 'save') {
        await T.api.quizzes.save(draft.id);
        T.ui.toast({ title: 'Quiz saved', message: `“${draft.title}” is in your Quizzes — start it whenever you’re ready.`, variant: 'success' });
        setTimeout(() => { window.location.href = url('pages/student/quizzes.html'); }, 600);
      } else if (a.dataset.action === 'start') {
        await T.api.quizzes.save(draft.id);
        window.location.href = url(`pages/student/quiz-attempt.html?id=${encodeURIComponent(draft.id)}`);
      }
    } catch (err) {
      T.ui.setButtonLoading(a, false);
      T.ui.toast({ title: 'Something went wrong', message: err.message, variant: 'danger' });
    }
  }
  root.addEventListener('click', (e) => { if (draft) onPreviewClick(e); });

  /* ---- Boot ----------------------------------------------------------------- */
  try {
    courses = await T.api.courses.list();
  } catch (err) {
    return empty({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your courses', text: err.message });
  }
  if (!courses.length) {
    return empty({ icon: 'book-open', title: 'Add a course first', text: 'Quizzes are made from a course’s lecture PDFs.', actions: [{ label: 'Go to My Courses', icon: 'arrow-right', href: url('pages/student/courses.html?new=1') }] });
  }
  const draftId = params.get('draft');
  if (draftId) {
    try {
      draft = await T.api.quizzes.get(draftId);
      return showPreview();
    } catch (err) {
      T.ui.toast({ title: 'That quiz draft has expired', message: 'Drafts are kept for a day. Set it up again below.', variant: 'warning' });
    }
  }
  renderSetup();
});
