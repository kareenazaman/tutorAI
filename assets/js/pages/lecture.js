/**
 * TutorAI — Lecture workspace (pages/student/lecture.html?id=lec_3003&page=2)
 * ------------------------------------------------------------------
 * ≥1200px  three panels: lectures · document viewer · study tools
 * 992–1199 lectures become a dropdown; viewer + tools side by side
 * 768–991  dropdown; tools below the viewer
 * <768     viewer full width; lectures and tools open as bottom sheets
 *          (Bootstrap responsive offcanvas: offcanvas-xl / offcanvas-md)
 *
 * Data: lectures.get / lectures.pages / lectures.list (course list),
 * ai.summarize / ai.studyNotes / ai.generateQuiz. Results are saved in
 * the mock store, so they are shown again after a reload.
 * Citation links inside results (lecture.html?id=…&page=…) jump to that
 * page without reloading when they point at this lecture.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const UI = T.components.CourseUI;
  const MD = T.markdown;
  const { $, $$, escape, url, timeAgo, formatDate, formatFileSize, storage } = T.utils;

  const root = document.querySelector('[data-lecture-root]');
  const live = document.querySelector('[data-live]');
  const params = new URLSearchParams(window.location.search);
  const lectureId = params.get('id');
  const ZOOM_KEY = 'tai.viewer.zoom';
  const SHEET_W = 640;

  let lecture = null, pages = [], courseLectures = [], generated = false;
  let page = 1;
  let zoomPref = storage.get(ZOOM_KEY, 'fit');   // 'fit' or a number 0.5–2

  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
  const lectureUrl = (id, p) => url(`pages/student/lecture.html?id=${encodeURIComponent(id)}${p ? `&page=${p}` : ''}`);

  function empty({ icon, tone, title, text, actions, crumbs }) {
    if (crumbs) T.shell.setCrumbs(crumbs);
    root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon, tone, title, text, actions })}</div>`;
    T.ui.icons(root);
  }

  /* ---- Load ---------------------------------------------------------------- */
  if (!lectureId) {
    empty({ icon: 'file-search', tone: 'butter', title: 'No lecture selected', text: 'Open a lecture from one of your courses.',
      actions: [{ label: 'Go to My Courses', icon: 'arrow-left', href: url('pages/student/courses.html') }],
      crumbs: [{ label: 'My Courses', href: url('pages/student/courses.html') }, { label: 'Lecture' }] });
    return;
  }
  try {
    lecture = await T.api.lectures.get(lectureId);
  } catch (err) {
    empty({ icon: 'file-x', tone: 'butter', title: err.status === 404 ? 'Lecture not found' : 'We couldn’t load this lecture',
      text: err.status === 404 ? 'This lecture doesn’t exist, or it was deleted with its course.' : err.message,
      actions: [{ label: 'Go to My Courses', icon: 'arrow-left', href: url('pages/student/courses.html') }],
      crumbs: [{ label: 'My Courses', href: url('pages/student/courses.html') }, { label: 'Lecture not found' }] });
    return;
  }
  const course = lecture.course;
  T.shell.setCrumbs([
    { label: 'My Courses', href: url('pages/student/courses.html') },
    { label: course.code, href: UI.courseUrl(course.id) },
    { label: lecture.title }
  ]);
  document.title = `${lecture.title} · ${course.code} · TutorAI`;

  if (lecture.status !== 'ready') {
    const s = UI.LECTURE_STATUS[lecture.status] || {};
    empty({
      icon: lecture.status === 'failed' ? 'file-x' : 'loader', tone: lecture.status === 'failed' ? 'pink' : 'powder',
      title: lecture.status === 'failed' ? 'This lecture couldn’t be processed' : 'This lecture isn’t ready yet',
      text: lecture.status === 'failed'
        ? `“${lecture.title}” failed during processing, so there’s no text to show. Upload the PDF again.`
        : `“${lecture.title}” is still ${String(s.label || 'processing').toLowerCase()}. It can be opened once it’s ready.`,
      actions: [
        { label: `Back to ${course.code} lectures`, icon: 'arrow-left', variant: 'secondary', href: UI.courseUrl(course.id, 'lectures') },
        ...(lecture.status === 'failed' ? [{ label: 'Upload again', icon: 'upload', href: UI.uploadUrl(course.id) }] : [])
      ]
    });
    return;
  }

  try {
    const [content, list] = await Promise.all([T.api.lectures.pages(lectureId), T.api.lectures.list(course.id)]);
    pages = content.pages;
    generated = content.generated;
    courseLectures = list.sort((a, b) => (a.lectureNumber || 999) - (b.lectureNumber || 999) || a.uploadedAt.localeCompare(b.uploadedAt));
  } catch (err) {
    empty({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load the lecture text', text: err.message,
      actions: [{ label: 'Try again', icon: 'refresh-cw', href: lectureUrl(lectureId) }] });
    return;
  }
  T.api.courses.markAccessed(course.id).catch(() => {});
  T.api.lectures.markViewed(lecture.id).catch(() => {});   // activity log → study activity chart
  if (!pages.length) {
    empty({ icon: 'file-question', tone: 'butter', title: 'No text was extracted', text: 'This lecture has no readable pages yet.',
      actions: [{ label: `Back to ${course.code}`, href: UI.courseUrl(course.id, 'lectures') }] });
    return;
  }
  page = Math.min(pages.length, Math.max(1, parseInt(params.get('page'), 10) || 1));

  /* ---- Markup -------------------------------------------------------------- */
  const label = UI.lectureLabel(lecture);

  function lectureList() {
    return `<ul class="lw-lectures">${courseLectures.map(l => {
      const current = l.id === lecture.id;
      const inner = `<span class="lw-lectures__num">${l.lectureNumber || '–'}</span><span class="lw-lectures__title">${escape(l.title)}</span>`;
      if (l.status !== 'ready') {
        return `<li><div class="lw-lectures__item is-disabled" aria-disabled="true" title="Not ready — ${escape((UI.LECTURE_STATUS[l.status] || {}).label || l.status)}">${inner}${UI.lectureStatus(l.status)}</div></li>`;
      }
      return `<li><a class="lw-lectures__item${current ? ' is-active' : ''}" href="${escape(lectureUrl(l.id))}"${current ? ' aria-current="page"' : ''}>${inner}</a></li>`;
    }).join('')}</ul>`;
  }

  function lectureSelect() {
    return `
      <label class="visually-hidden" for="lw-select">Lecture</label>
      <select id="lw-select" class="form-select">${courseLectures.map(l =>
        `<option value="${escape(l.id)}"${l.id === lecture.id ? ' selected' : ''}${l.status !== 'ready' ? ' disabled' : ''}>${escape(UI.lectureLabel(l))}: ${escape(l.title)}${l.status !== 'ready' ? ` (${escape((UI.LECTURE_STATUS[l.status] || {}).label || l.status)})` : ''}</option>`).join('')}
      </select>`;
  }

  function toolsHtml() {
    return `
      <section class="tai-card lw-tool" aria-labelledby="tool-summary-title">
        <div class="lw-tool__head">
          <span class="tai-icon-tile tai-icon-tile--lavender">${T.ui.icon('sparkles')}</span>
          <div><h3 class="tai-card__title" id="tool-summary-title">Summary</h3><p class="tai-card__subtitle">Key points with page references</p></div>
        </div>
        <div data-tool="summary"></div>
      </section>

      <section class="tai-card lw-tool" aria-labelledby="tool-notes-title">
        <div class="lw-tool__head">
          <span class="tai-icon-tile tai-icon-tile--powder">${T.ui.icon('notebook-pen')}</span>
          <div><h3 class="tai-card__title" id="tool-notes-title">Study notes</h3><p class="tai-card__subtitle">Key terms and page-by-page notes</p></div>
        </div>
        <div data-tool="notes"></div>
      </section>

      <section class="tai-card lw-tool" aria-labelledby="tool-quiz-title">
        <div class="lw-tool__head">
          <span class="tai-icon-tile tai-icon-tile--sage">${T.ui.icon('list-checks')}</span>
          <div><h3 class="tai-card__title" id="tool-quiz-title">Practice quiz</h3><p class="tai-card__subtitle">Preview it, then take it — results count towards your mastery</p></div>
        </div>
        <form class="lw-quiz-form" id="quiz-form" action="/lectures/${escape(lecture.id)}/quiz" method="post" novalidate>
          <div data-form-status></div>
          <fieldset class="mb-3">
            <legend class="form-label">Questions</legend>
            <div class="lw-choice">
              <label><input type="radio" name="count" value="5" checked><span>5</span></label>
              <label><input type="radio" name="count" value="10"><span>10</span></label>
            </div>
          </fieldset>
          <div class="mb-3">
            <label class="form-label" for="quiz-difficulty">Difficulty</label>
            <select id="quiz-difficulty" name="difficulty" class="form-select">
              <option value="easy">Easy — match ideas to sections</option>
              <option value="medium" selected>Medium — a mix</option>
              <option value="hard">Hard — recall key terms</option>
            </select>
          </div>
          <button type="submit" class="btn btn-soft w-100">${T.ui.icon('wand-sparkles')}<span>Generate quiz</span></button>
        </form>
        <div data-tool="quiz" class="mt-3"></div>
      </section>

      <a class="tai-tile tai-tile--lavender tai-tile--interactive lw-ask" href="${escape(url(`pages/student/ai-tutor.html?course=${encodeURIComponent(course.id)}&lecture=${encodeURIComponent(lecture.id)}`))}">
        <div class="tai-tile__top"><span class="tai-tile__label">${T.ui.icon('message-circle')}AI Tutor</span><span class="tai-tile__arrow">${T.ui.icon('arrow-up-right')}</span></div>
        <h3 class="tai-tile__title">Ask AI about this lecture</h3>
        <p class="tai-tile__meta">Answers cite pages from ${escape(label)} only.</p>
        <span class="tai-tile__deco">${T.ui.icon('sparkles')}</span>
      </a>`;
  }

  root.innerHTML = `
    <div class="lw">
      <aside class="lw-left offcanvas-xl offcanvas-bottom" id="lw-lectures" tabindex="-1" aria-labelledby="lw-lectures-title">
        <div class="offcanvas-header">
          <h2 class="offcanvas-title h6 mb-0" id="lw-lectures-title">Lectures in ${escape(course.code)}</h2>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#lw-lectures" aria-label="Close"></button>
        </div>
        <div class="offcanvas-body">
          <div class="lw-panel">
            <a class="lw-course" href="${escape(UI.courseUrl(course.id, 'lectures'))}" style="${UI.coverStyle(course.color)}">
              <span class="tai-eyebrow">${escape(course.code)}</span>
              <span class="lw-course__title">${escape(course.title)}</span>
            </a>
            <nav aria-label="Lectures in ${escape(course.code)}">${lectureList()}</nav>
          </div>
        </div>
      </aside>

      <section class="lw-center" aria-labelledby="lw-title">
        <header class="lw-head">
          <span class="tai-eyebrow">${escape(course.code)} · ${escape(label)}</span>
          <h1 class="lw-head__title" id="lw-title">${escape(lecture.title)}</h1>
          ${lecture.description ? `<p class="tai-meta mb-0">${escape(lecture.description)}</p>` : ''}
          <div class="lw-head__switch d-none d-md-block d-xl-none mt-3">${lectureSelect()}</div>
          <div class="d-flex gap-2 mt-3 d-md-none">
            <button type="button" class="btn btn-secondary btn-sm flex-fill" data-bs-toggle="offcanvas" data-bs-target="#lw-lectures" aria-controls="lw-lectures">${T.ui.icon('list')}<span>Lectures</span></button>
            <button type="button" class="btn btn-soft btn-sm flex-fill" data-bs-toggle="offcanvas" data-bs-target="#lw-tools" aria-controls="lw-tools">${T.ui.icon('sparkles')}<span>Study tools</span></button>
          </div>
        </header>

        <div class="tai-card tai-card--flush lw-viewer">
          <div class="lw-viewer__bar">
            <span class="tai-badge tai-badge--butter" title="TutorAI shows the text it extracted, not the original PDF layout">${T.ui.icon('scan-text')}Preview of extracted text — demo</span>
            <div class="lw-viewer__controls">
              <div class="lw-pager" role="group" aria-label="Page navigation">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="prev" aria-label="Previous page">${T.ui.icon('chevron-left')}</button>
                <label class="lw-pager__label" for="lw-page">Page</label>
                <input id="lw-page" class="form-control form-control-sm lw-pager__input" type="number" min="1" max="${pages.length}" value="${page}" inputmode="numeric" aria-describedby="lw-page-total">
                <span id="lw-page-total" class="lw-pager__label">of ${pages.length}</span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="next" aria-label="Next page">${T.ui.icon('chevron-right')}</button>
              </div>
              <div class="lw-zoom" role="group" aria-label="Zoom">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="zoom-out" aria-label="Zoom out">${T.ui.icon('minus')}</button>
                <span class="lw-zoom__value" data-zoom-value aria-live="polite">100%</span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="zoom-in" aria-label="Zoom in">${T.ui.icon('plus')}</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="zoom-fit" aria-pressed="false">Fit</button>
              </div>
            </div>
          </div>
          <div class="lw-stage" data-stage tabindex="0" aria-label="Lecture page. Use the left and right arrow keys to change page.">
            <article class="lw-sheet" data-sheet></article>
          </div>
        </div>

        <section class="tai-card lw-info" aria-labelledby="lw-info-title">
          <h2 class="tai-card__title mb-3" id="lw-info-title">Document info</h2>
          <dl class="lw-info__grid">
            <div><dt>File name</dt><dd class="text-break">${escape(lecture.fileName)}</dd></div>
            <div><dt>Size</dt><dd>${escape(formatFileSize(lecture.fileSizeKb))}</dd></div>
            <div><dt>Pages</dt><dd>${pages.length}</dd></div>
            <div><dt>Uploaded</dt><dd>${escape(formatDate(lecture.uploadedAt))}</dd></div>
            <div><dt>Status</dt><dd>${UI.lectureStatus(lecture.status)}</dd></div>
          </dl>
          ${generated ? `<div class="alert alert-warning mt-3 mb-0" role="note">${T.ui.icon('flask-conical')}<div class="alert-body"><p class="alert-title">Demo content</p><p>This lecture was uploaded in demo mode, so its pages are generated placeholders, not text from your PDF.</p></div></div>` : ''}
        </section>
      </section>

      <aside class="lw-right offcanvas-md offcanvas-bottom" id="lw-tools" tabindex="-1" aria-labelledby="lw-tools-title">
        <div class="offcanvas-header">
          <h2 class="offcanvas-title h6 mb-0" id="lw-tools-title">Study tools</h2>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#lw-tools" aria-label="Close"></button>
        </div>
        <div class="offcanvas-body">
          <h2 class="visually-hidden d-none d-md-block">Study tools</h2>
          <div class="lw-tools">${toolsHtml()}</div>
        </div>
      </aside>
    </div>`;
  T.ui.enhance(root);

  const stage = $('[data-stage]', root);
  const sheet = $('[data-sheet]', root);
  const pageInput = document.getElementById('lw-page');

  /* ---- Viewer -------------------------------------------------------------- */
  function renderPage({ focus = false, flash = false } = {}) {
    const pg = pages[page - 1];
    sheet.innerHTML = `
      <div class="lw-sheet__meta"><span>${escape(course.code)} · ${escape(label)}</span><span>${page} / ${pages.length}</span></div>
      ${generated ? `<p class="lw-sheet__demo">${T.ui.icon('flask-conical')} Demo placeholder page</p>` : ''}
      <h2 class="lw-sheet__heading">${escape(pg.heading)}</h2>
      <div class="tai-prose lw-sheet__body">${MD.renderMarkdown(pg.text)}</div>
      <div class="lw-sheet__foot">${page}</div>`;
    T.ui.icons(sheet);
    pageInput.value = page;
    $('[data-action="prev"]', root).disabled = page <= 1;
    $('[data-action="next"]', root).disabled = page >= pages.length;
    const p = new URLSearchParams(window.location.search);
    p.set('id', lecture.id); p.set('page', page);
    history.replaceState(null, '', `${window.location.pathname}?${p}`);
    stage.scrollTop = 0;
    if (flash) { sheet.classList.remove('is-flash'); void sheet.offsetWidth; sheet.classList.add('is-flash'); }
    if (focus) stage.focus({ preventScroll: true });
  }

  function goToPage(n, opts = {}) {
    const next = Math.min(pages.length, Math.max(1, parseInt(n, 10) || 1));
    if (next === page && !opts.force) { pageInput.value = page; return; }
    page = next;
    renderPage(opts);
    announce(`Page ${page} of ${pages.length}: ${pages[page - 1].heading}`);
  }

  function applyZoom() {
    const sheetW = parseFloat(getComputedStyle(stage).getPropertyValue('--sheet-w')) || SHEET_W;
    const pad = parseFloat(getComputedStyle(stage).paddingLeft) * 2 || 32;
    const fitValue = Math.min(2, Math.max(0.5, (stage.clientWidth - pad - 2) / sheetW));
    const z = zoomPref === 'fit' ? fitValue : Math.min(2, Math.max(0.5, +zoomPref || 1));
    stage.style.setProperty('--zoom', z.toFixed(3));
    $('[data-zoom-value]', root).textContent = `${Math.round(z * 100)}%`;
    $('[data-action="zoom-fit"]', root).setAttribute('aria-pressed', String(zoomPref === 'fit'));
    $('[data-action="zoom-out"]', root).disabled = z <= 0.5;
    $('[data-action="zoom-in"]', root).disabled = z >= 2;
    return z;
  }
  function setZoom(next) {
    zoomPref = next === 'fit' ? 'fit' : Math.round(Math.min(2, Math.max(0.5, next)) * 10) / 10;
    storage.set(ZOOM_KEY, zoomPref);
    applyZoom();
  }
  const currentZoom = () => parseFloat(stage.style.getPropertyValue('--zoom')) || 1;

  pageInput.addEventListener('change', () => goToPage(pageInput.value));
  pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goToPage(pageInput.value); } });
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(page + 1, { focus: true }); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToPage(page - 1, { focus: true }); }
  });
  window.addEventListener('resize', T.utils.debounce(() => { if (zoomPref === 'fit') applyZoom(); }, 120));
  const select = document.getElementById('lw-select');
  if (select) select.addEventListener('change', () => { window.location.href = lectureUrl(select.value); });

  /* ---- Study tools --------------------------------------------------------- */
  const toolEl = (name) => $(`[data-tool="${name}"]`, root);
  const loading = (lines = 4) => `<div class="lw-tool__loading" aria-busy="true">${T.ui.skeleton('text', lines)}<p class="tai-small tai-muted mb-0 mt-2">${T.ui.icon('sparkles', 'icon-xs')} Reading ${pages.length} pages…</p></div>`;
  const errorBox = (msg, action) => `
    <div class="alert alert-danger mb-0" role="alert">${T.ui.icon('circle-alert')}<div class="alert-body"><p class="alert-title">Something went wrong</p><p>${escape(msg)}</p>
      <button type="button" class="btn btn-secondary btn-sm mt-2" data-action="${action}">${T.ui.icon('rotate-ccw')}<span>Try again</span></button></div></div>`;

  function renderSummary(s) {
    const el = toolEl('summary');
    if (!s) {
      el.innerHTML = `<button type="button" class="btn btn-soft w-100" data-action="summarize">${T.ui.icon('sparkles')}<span>Generate summary</span></button>`;
    } else {
      el.innerHTML = `
        <div class="tai-prose lw-result">${MD.renderMarkdown(s.content)}</div>
        <div class="lw-result__foot">
          <span class="tai-badge tai-badge--outline">Demo response</span>
          <span class="tai-small tai-muted">Generated ${escape(timeAgo(s.createdAt).toLowerCase())}</span>
          <button type="button" class="btn btn-ghost btn-sm ms-auto" data-action="summarize">${T.ui.icon('refresh-cw')}<span>Regenerate</span></button>
        </div>`;
    }
    T.ui.icons(el);
  }

  function renderNotes(n) {
    const el = toolEl('notes');
    if (!n) {
      el.innerHTML = `<button type="button" class="btn btn-soft w-100" data-action="notes">${T.ui.icon('notebook-pen')}<span>Create study notes</span></button>`;
    } else {
      el.innerHTML = `
        <div class="lw-notes" data-notes>
          <div class="tai-prose lw-result">${MD.renderMarkdown(n.content)}</div>
        </div>
        <button type="button" class="btn btn-link btn-sm px-0" data-action="toggle-notes" aria-expanded="false">${T.ui.icon('chevrons-down')}<span>Show all notes</span></button>
        <div class="lw-result__actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="copy-notes">${T.ui.icon('copy')}<span>Copy</span></button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="download-notes">${T.ui.icon('download')}<span>Download .md</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="notes">${T.ui.icon('refresh-cw')}<span>Regenerate</span></button>
        </div>
        <p class="tai-small tai-muted mb-0 mt-2"><span class="tai-badge tai-badge--outline me-1">Demo response</span>Created ${escape(timeAgo(n.createdAt).toLowerCase())}</p>`;
    }
    T.ui.icons(el);
  }

  function renderQuizzes(quizzes, newId = null) {
    const el = toolEl('quiz');
    if (!quizzes.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <p class="tai-eyebrow mb-2">Quizzes using this lecture</p>
      <ul class="tai-row-list">${quizzes.map(q => `
        <li class="tai-row${q.id === newId ? ' is-highlighted' : ''}">
          <div class="tai-row__main">
            <p class="tai-row__title"><a href="${escape(url(q.status === 'completed' ? `pages/student/quiz-results.html?attempt=${encodeURIComponent(q.latestAttemptId)}` : `pages/student/quiz-attempt.html?id=${encodeURIComponent(q.id)}`))}">${escape(q.title)}</a></p>
            <p class="tai-row__meta">${escape(q.questionCount)} questions · ${escape(q.difficulty)} · ${q.status === 'completed' ? `best ${q.bestScore}%` : q.status === 'in_progress' ? 'in progress' : 'not started'}</p>
          </div>
          ${q.source === 'ai' ? `<span class="tai-badge tai-badge--lavender">${T.ui.icon('sparkles')}AI</span>` : ''}
        </li>`).join('')}</ul>`;
    T.ui.icons(el);
  }

  async function runTool(name, fn, render, button) {
    const el = toolEl(name);
    if (button) T.ui.setButtonLoading(button, true);
    el.innerHTML = loading(name === 'notes' ? 6 : 4);
    try {
      const result = await fn();
      render(result);
      announce(`${name === 'summary' ? 'Summary' : 'Study notes'} ready.`);
      return result;
    } catch (err) {
      el.innerHTML = errorBox(err.message, name === 'summary' ? 'summarize' : 'notes');
      T.ui.icons(el);
      announce(err.message);
      return null;
    } finally {
      if (button && document.body.contains(button)) T.ui.setButtonLoading(button, false);
    }
  }

  // Quiz form (validation.js keeps it consistent with other forms)
  const quizForm = document.getElementById('quiz-form');
  const quizBtn = $('[type="submit"]', quizForm);
  T.validation.bind(quizForm, {
    count: [(v) => (['5', '10'].includes(String(v)) ? null : 'Choose 5 or 10 questions.')],
    difficulty: [T.validation.required('Choose a difficulty.')]
  }, {
    onSubmit: async (values) => {
      T.ui.setButtonLoading(quizBtn, true);
      try {
        // The shared quiz generator makes a draft; the preview page shows it (answers hidden)
        const draft = await T.api.ai.generateQuiz({ lectureId: lecture.id, options: { count: Number(values.count), difficulty: values.difficulty, types: ['mcq', 'multi', 'true_false'] } });
        announce(`Quiz ready with ${draft.questionCount} questions. Opening the preview…`);
        window.location.href = url(`pages/student/quiz-create.html?draft=${encodeURIComponent(draft.id)}`);
        return;
      } catch (err) {
        T.validation.formAlert(quizForm, { title: 'Couldn’t generate the quiz', message: err.message });
      } finally {
        T.ui.setButtonLoading(quizBtn, false);
      }
    }
  });

  function downloadNotes(n) {
    const blob = new Blob([n.content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${course.code.replace(/\s+/g, '')}-${lecture.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-notes.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  let notes = lecture.notes;
  root.addEventListener('click', async (e) => {
    // Citation links to this lecture → jump to the page in place
    const link = e.target.closest('a[href*="lecture.html"]');
    if (link && !e.metaKey && !e.ctrlKey) {
      const target = new URL(link.getAttribute('href'), window.location.href);
      if (target.searchParams.get('id') === lecture.id) {
        e.preventDefault();
        const tools = bootstrap.Offcanvas.getInstance(document.getElementById('lw-tools'));
        if (tools) tools.hide();
        goToPage(target.searchParams.get('page'), { flash: true, force: true });
        $('.lw-viewer', root).scrollIntoView({ block: 'start', behavior: T.utils.reducedMotion() ? 'auto' : 'smooth' });
        return;
      }
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const action = a.dataset.action;
    if (action === 'prev') goToPage(page - 1);
    else if (action === 'next') goToPage(page + 1);
    else if (action === 'zoom-in') setZoom(currentZoom() + 0.1);
    else if (action === 'zoom-out') setZoom(currentZoom() - 0.1);
    else if (action === 'zoom-fit') setZoom('fit');
    else if (action === 'summarize') runTool('summary', () => T.api.ai.summarize({ lectureId: lecture.id }), renderSummary, a.tagName === 'BUTTON' ? a : null);
    else if (action === 'notes') {
      const n = await runTool('notes', () => T.api.ai.studyNotes({ lectureId: lecture.id }), renderNotes, a);
      if (n) notes = n;
    } else if (action === 'toggle-notes') {
      const box = $('[data-notes]', root);
      const open = box.classList.toggle('is-open');
      a.setAttribute('aria-expanded', String(open));
      a.querySelector('span').textContent = open ? 'Show less' : 'Show all notes';
    } else if (action === 'copy-notes' && notes) {
      const ok = await MD.copyText(notes.content);
      T.ui.toast({ title: ok ? 'Notes copied' : 'Couldn’t copy', message: ok ? 'Markdown is on your clipboard.' : 'Select the notes and copy them manually.', variant: ok ? 'success' : 'warning' });
    } else if (action === 'download-notes' && notes) {
      downloadNotes(notes);
    }
  });

  /* ---- Boot ---------------------------------------------------------------- */
  renderPage();
  applyZoom();
  renderSummary(lecture.summary);
  renderNotes(lecture.notes);
  renderQuizzes(lecture.quizzes);
});
