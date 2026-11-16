/**
 * TutorAI — Course workspace (pages/student/course.html?id=crs_2001&tab=overview)
 * ------------------------------------------------------------------
 * Opening the page marks the course as accessed (POST /api/courses/{id}/access).
 * Tabs live in ?tab= and switch without a reload (back/forward work):
 *   overview · lectures · ai-tutor · quizzes · progress
 * ?lecture=lec_3004 highlights a lecture on the Lectures tab.
 * Unknown or missing id → "Course not found".
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const UI = T.components.CourseUI;
  const { $, $$, escape, url, timeAgo, formatDate } = T.utils;

  const root = document.querySelector('[data-course-root]');
  const TABS = [
    { id: 'overview', label: 'Overview',  icon: 'layout-dashboard' },
    { id: 'lectures', label: 'Lectures',  icon: 'file-text' },
    { id: 'ai-tutor', label: 'AI Tutor',  icon: 'sparkles' },
    { id: 'quizzes',  label: 'Quizzes',   icon: 'list-checks' },
    { id: 'progress', label: 'Progress',  icon: 'chart-line' }
  ];
  const tabIds = TABS.map(t => t.id);

  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('id');
  let tab = tabIds.includes(params.get('tab')) ? params.get('tab') : 'overview';
  let highlightLecture = params.get('lecture');
  let highlightQuiz = params.get('quiz');
  let chatInstance = null;
  /** Starting state for the next AI Tutor tab mount (?c= / ?lecture= or an "Ask AI" click). */
  let pendingChat = tab === 'ai-tutor' ? { conversationId: params.get('c'), lectureId: params.get('lecture') } : {};
  let course = null, lectures = [], quizzes = [], attempts = [], topics = [];
  let lectureQuery = '';
  let chart = null;

  /* ---- Not found ----------------------------------------------------------- */
  function notFound(message) {
    T.shell.setCrumbs([{ label: 'My Courses', href: url('pages/student/courses.html') }, { label: 'Course not found' }]);
    root.innerHTML = `<div class="tai-card">${T.ui.emptyState({
      icon: 'search-x', tone: 'butter', title: 'Course not found',
      text: message || 'This course doesn’t exist, or it was deleted.',
      actions: [{ label: 'Back to My Courses', icon: 'arrow-left', href: url('pages/student/courses.html') }]
    })}</div>`;
    T.ui.icons(root);
  }

  /* ---- Header -------------------------------------------------------------- */
  function header() {
    const c = course;
    return `
      <section class="tai-card tai-card--flush course-head mb-4" style="${UI.coverStyle(c.color)}" aria-labelledby="course-title">
        <div class="course-head__cover">
          <span class="tai-chip">${T.ui.icon('calendar-range')}${escape(c.term || 'No term')}</span>
          ${c.status === 'archived' ? `<span class="tai-chip">${T.ui.icon('archive')}Archived</span>` : ''}
          <span class="tai-tile__deco">${T.ui.icon(UI.iconFor(c))}</span>
        </div>
        <div class="course-head__body">
          <div class="course-head__text">
            <span class="tai-eyebrow">${escape(c.code)}</span>
            <h1 class="course-head__title" id="course-title">${escape(c.title)}</h1>
            <p class="tai-meta mb-0">${T.ui.icon('user', 'icon-xs')} ${escape(c.instructor || 'No instructor added')} · ${c.lectureCount} lecture${c.lectureCount === 1 ? '' : 's'} · ${c.completedQuizCount} quiz${c.completedQuizCount === 1 ? '' : 'zes'} completed</p>
          </div>
          <div class="course-head__metrics">
            <div class="course-head__metric">
              <div class="d-flex justify-content-between align-items-baseline mb-2">
                <span class="tai-meta">Progress</span>
                <span class="course-head__pct" data-count-to="${c.progress}" data-count-suffix="%">0%</span>
              </div>
              <div class="progress" role="progressbar" aria-label="Progress: ${escape(UI.coverageText(c))}" aria-valuenow="${c.progress}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" data-meter="${c.progress}"></div>
              </div>
              <span class="tai-small tai-muted d-block mt-2">${escape(UI.coverageText(c))}</span>
            </div>
            <div class="course-head__metric">
              <div class="d-flex justify-content-between align-items-baseline mb-2">
                <span class="tai-meta">Mastery</span>
                <span class="course-head__pct"${c.mastery === null ? '>—' : ` data-count-to="${c.mastery}" data-count-suffix="%">0%`}</span>
              </div>
              <div class="progress" role="progressbar" aria-label="Mastery: average best quiz score" aria-valuenow="${c.mastery || 0}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar is-${UI.scoreTone(c.mastery) === 'outline' ? 'lavender' : UI.scoreTone(c.mastery)}" data-meter="${c.mastery || 0}"></div>
              </div>
              <span class="tai-small tai-muted d-block mt-2">${c.mastery === null ? 'No quizzes attempted yet' : 'Average best score'}</span>
            </div>
          </div>
          <div class="course-head__actions">
            <a class="btn btn-secondary" href="${escape(url(`pages/student/courses.html?edit=${encodeURIComponent(c.id)}`))}">${T.ui.icon('pencil')}<span>Edit</span></a>
            <a class="btn btn-primary" href="${escape(UI.uploadUrl(c.id))}">${T.ui.icon('upload')}<span>Upload lecture</span></a>
          </div>
        </div>
      </section>`;
  }

  function tabsNav() {
    return `
      <nav class="course-tabs" aria-label="Course sections">
        <ul class="nav nav-tabs">
          ${TABS.map(t => `
            <li class="nav-item">
              <a class="nav-link${t.id === tab ? ' active' : ''}" href="${escape(UI.courseUrl(course.id, t.id))}" data-tab="${t.id}"${t.id === tab ? ' aria-current="page"' : ''}>
                ${T.ui.icon(t.icon, 'icon-sm')}<span>${t.label}</span>${t.id === 'lectures' ? ` <span class="tai-badge tai-badge--sm">${lectures.length}</span>` : ''}
              </a>
            </li>`).join('')}
        </ul>
      </nav>`;
  }

  /* ---- Shared rows --------------------------------------------------------- */
  const lectureUrl = (id, page) => url(`pages/student/lecture.html?id=${encodeURIComponent(id)}${page ? `&page=${page}` : ''}`);
  function lectureRow(l, { actions = true } = {}) {
    const s = UI.LECTURE_STATUS[l.status] || UI.LECTURE_STATUS.processing;
    return `
      <li class="tai-row" data-lecture-id="${escape(l.id)}">
        <span class="tai-icon-tile tai-icon-tile--${s.tone}">${T.ui.icon('file-text')}</span>
        <div class="tai-row__main">
          <span class="tai-row__eyebrow">${escape(UI.lectureLabel(l))} · ${escape(timeAgo(l.uploadedAt))}</span>
          <p class="tai-row__title">${l.status === 'ready' ? `<a href="${escape(lectureUrl(l.id))}">${escape(l.title)}</a>` : escape(l.title)}</p>
          <p class="tai-row__meta">${escape(UI.lectureMeta(l))}${l.description ? ` — ${escape(l.description)}` : ''}</p>
        </div>
        <div class="tai-row__side">
          ${UI.lectureStatus(l.status)}
          ${actions && l.status === 'ready' ? `<button type="button" class="btn btn-soft btn-sm" data-action="ask-ai" data-id="${escape(l.id)}" aria-label="Ask AI about ${escape(l.title)}">${T.ui.icon('sparkles')}<span>Ask AI</span></button><a class="btn btn-secondary btn-sm" href="${escape(lectureUrl(l.id))}">${T.ui.icon('book-open-text')}<span>Open</span></a>` : ''}
          ${actions && l.status === 'failed' ? `<a class="btn btn-secondary btn-sm" href="${escape(UI.uploadUrl(course.id))}">${T.ui.icon('rotate-ccw')}<span>Re-upload</span></a>` : ''}
          ${actions ? `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="delete-lecture" data-id="${escape(l.id)}" aria-label="Delete ${escape(l.title)}">${T.ui.icon('trash-2')}</button>` : ''}
        </div>
      </li>`;
  }

  const quizPage = (path, q) => url(`pages/student/${path}?${new URLSearchParams(q)}`);
  function quizActions(q) {
    if (q.status === 'in_progress') return `<a class="btn btn-primary btn-sm" href="${escape(quizPage('quiz-attempt.html', { id: q.id }))}">${T.ui.icon('play')}<span>Resume</span></a>`;
    if (q.status === 'completed') return `<a class="btn btn-secondary btn-sm" href="${escape(quizPage('quiz-attempt.html', { id: q.id, fresh: 1 }))}">${T.ui.icon('rotate-ccw')}<span>Retry</span></a>
      <a class="btn btn-ghost btn-sm" href="${escape(quizPage('quiz-results.html', { attempt: q.latestAttemptId }))}">Results</a>`;
    return `<a class="btn btn-primary btn-sm" href="${escape(quizPage('quiz-attempt.html', { id: q.id }))}">${T.ui.icon('play')}<span>Start</span></a>`;
  }

  function quizRow(q) {
    const done = q.status === 'completed';
    return `
      <li class="tai-row" data-quiz-id="${escape(q.id)}">
        <span class="tai-icon-tile tai-icon-tile--${done ? UI.scoreTone(q.bestScore) : q.status === 'in_progress' ? 'butter' : 'lavender'}">${T.ui.icon(done ? 'circle-check' : q.status === 'in_progress' ? 'hourglass' : 'list-checks')}</span>
        <div class="tai-row__main">
          <span class="tai-row__eyebrow">${escape(q.topic || '')}${q.source === 'ai' ? ` · <span class="tai-badge tai-badge--lavender tai-badge--sm">${T.ui.icon('sparkles')}AI</span>` : ''}</span>
          <p class="tai-row__title">${escape(q.title)}</p>
          <p class="tai-row__meta">${q.questionCount} questions · ${escape(q.difficulty)}${q.lectures && q.lectures.length ? ` · from ${q.lectures.map(l => `<a href="${escape(lectureUrl(l.id))}">${escape(UI.lectureLabel(l))}</a>`).join(', ')}` : ''}${done ? ` · ${q.attemptCount} attempt${q.attemptCount === 1 ? '' : 's'} · last ${escape(formatDate(q.lastTakenAt))}` : q.status === 'in_progress' ? ' · in progress' : ''}</p>
        </div>
        <div class="tai-row__side">
          ${done ? `<span class="tai-badge tai-badge--${UI.scoreTone(q.bestScore)}" title="Best score">Best ${q.bestScore}%</span>` : UI.scoreBadge(null)}
          ${quizActions(q)}
        </div>
      </li>`;
  }

  /* ---- Tabs ---------------------------------------------------------------- */
  function overviewTab() {
    const c = course;
    const latest = lectures.slice(0, 3);
    const next = quizzes.find(q => q.status === 'not_started');
    const weakCount = topicMastery().filter(t => t.band === 'revise').length;
    return `
      <div class="tai-bento mb-4">
        <div class="tai-tile tai-tile--powder span-3"><span class="tai-tile__label">${T.ui.icon('file-text')}Lectures</span><div class="tai-tile__value" data-count-to="${c.lectureCount}">0</div><p class="tai-tile__meta">${c.readyLectureCount} ready</p></div>
        <div class="tai-tile tai-tile--sage span-3"><span class="tai-tile__label">${T.ui.icon('list-checks')}Quizzes done</span><div class="tai-tile__value" data-count-to="${c.completedQuizCount}">0</div><p class="tai-tile__meta">of ${c.quizCount}</p></div>
        <div class="tai-tile tai-tile--peach span-3"><span class="tai-tile__label">${T.ui.icon('percent')}Average score</span><div class="tai-tile__value"${c.averageScore === null ? '>—' : ` data-count-to="${c.averageScore}" data-count-suffix="%">0%`}</div><p class="tai-tile__meta">${c.averageScore === null ? 'No quizzes yet' : 'Across completed quizzes'}</p></div>
        <a class="tai-tile tai-tile--butter tai-tile--interactive span-3" href="${escape(UI.courseUrl(c.id, 'progress'))}" data-tab="progress"><span class="tai-tile__label">${T.ui.icon('target')}Topics to revise</span><div class="tai-tile__value" data-count-to="${weakCount}">0</div><p class="tai-tile__meta">${weakCount ? 'Averaging under 65%' : 'None under 65%'}</p></a>
      </div>
      <div class="row g-4">
        <div class="col-lg-7 d-flex flex-column gap-4">
          <section class="tai-card" aria-labelledby="about-title">
            <div class="tai-card__header"><h2 class="tai-card__title" id="about-title">About this course</h2></div>
            ${c.description
              ? `<p class="mb-0">${escape(c.description)}</p>`
              : `<p class="tai-meta mb-0">No description yet. <a class="text-ink fw-semibold" href="${escape(url(`pages/student/courses.html?edit=${encodeURIComponent(c.id)}`))}">Add one</a></p>`}
          </section>
          <section class="tai-card" aria-labelledby="latest-title">
            <div class="tai-card__header">
              <div><h2 class="tai-card__title" id="latest-title">Latest lectures</h2><p class="tai-card__subtitle">Most recently uploaded</p></div>
              ${lectures.length ? `<a class="btn btn-link btn-sm" href="${escape(UI.courseUrl(c.id, 'lectures'))}" data-tab="lectures">View all${T.ui.icon('arrow-right')}</a>` : ''}
            </div>
            ${latest.length ? `<ul class="tai-row-list">${latest.map(l => lectureRow(l, { actions: false })).join('')}</ul>` : noLectures(true)}
          </section>
        </div>
        <div class="col-lg-5">
          ${next ? `
          <section class="tai-tile tai-tile--dark h-100 course-next" aria-labelledby="next-title">
            <span class="tai-tile__label">${T.ui.icon('list-checks')}Next quiz</span>
            <h2 class="tai-tile__title" id="next-title">${escape(next.title)}</h2>
            <p class="tai-tile__meta">${next.questionCount} questions · ${escape(next.difficulty)} · ${escape(next.topic)}</p>
            <div class="tai-tile__actions">
              <a class="btn btn-light" href="${escape(quizPage('quiz-attempt.html', { id: next.id }))}">${T.ui.icon('play')}<span>${next.status === 'in_progress' ? 'Resume quiz' : 'Start quiz'}</span></a>
              <a class="btn btn-ghost text-white" href="${escape(UI.courseUrl(c.id, 'quizzes'))}" data-tab="quizzes">All quizzes</a>
            </div>
            <span class="tai-tile__deco">${T.ui.icon('list-checks')}</span>
          </section>` : `
          <section class="tai-tile tai-tile--lavender h-100" aria-labelledby="next-title">
            <span class="tai-tile__label">${T.ui.icon('list-checks')}Next quiz</span>
            <h2 class="tai-tile__title" id="next-title">No quiz waiting</h2>
            <p class="tai-tile__meta">${c.readyLectureCount ? 'Ask the AI Tutor to quiz you on a lecture.' : 'Upload a lecture and TutorAI can build practice quizzes from it.'}</p>
            <div class="tai-tile__actions">
              ${c.readyLectureCount
                ? `<a class="btn btn-primary" href="${escape(UI.courseUrl(c.id, 'ai-tutor'))}" data-tab="ai-tutor">${T.ui.icon('sparkles')}<span>Open AI Tutor</span></a>`
                : `<a class="btn btn-primary" href="${escape(UI.uploadUrl(c.id))}">${T.ui.icon('upload')}<span>Upload lecture</span></a>`}
            </div>
            <span class="tai-tile__deco">${T.ui.icon('sparkles')}</span>
          </section>`}
        </div>
      </div>`;
  }

  function noLectures(compact = false) {
    return T.ui.emptyState({
      icon: 'file-up', compact,
      title: 'No lectures yet',
      text: 'Upload a lecture PDF so the AI Tutor and quizzes can use it.',
      actions: [{ label: 'Upload lecture', icon: 'upload', href: UI.uploadUrl(course.id) }]
    });
  }

  function lecturesTab() {
    if (!lectures.length) return `<div class="tai-card">${noLectures()}</div>`;
    const sorted = [...lectures].sort((a, b) => (b.lectureNumber || 0) - (a.lectureNumber || 0) || b.uploadedAt.localeCompare(a.uploadedAt));
    const q = lectureQuery.trim().toLowerCase();
    const list = sorted.filter(l => !q || `${l.title} ${l.fileName} ${l.description} lecture ${l.lectureNumber || ''}`.toLowerCase().includes(q));
    return `
      <section class="tai-card" aria-labelledby="lectures-title">
        <div class="tai-card__header">
          <div><h2 class="tai-card__title" id="lectures-title">Lectures</h2><p class="tai-card__subtitle">${lectures.length} uploaded · ${course.readyLectureCount} ready for the AI Tutor</p></div>
          <a class="btn btn-primary btn-sm" href="${escape(UI.uploadUrl(course.id))}">${T.ui.icon('upload')}<span>Upload</span></a>
        </div>
        <div class="tai-input-icon mb-4">
          ${T.ui.icon('search')}
          <label class="visually-hidden" for="lecture-search">Search lectures</label>
          <input id="lecture-search" type="search" class="form-control" placeholder="Search lectures by title, file or number" value="${escape(lectureQuery)}" autocomplete="off">
        </div>
        <div data-lecture-list>${lectureListHtml(list)}</div>
      </section>`;
  }

  function lectureListHtml(list) {
    if (!list.length) {
      return T.ui.emptyState({ icon: 'search-x', tone: 'butter', compact: true, title: 'No lectures match', text: `Nothing matches “${lectureQuery}”.`,
        actions: [{ label: 'Clear search', variant: 'secondary', icon: 'x', attrs: 'data-action="clear-lecture-search"' }] });
    }
    return `<p class="visually-hidden" aria-live="polite">${list.length} lecture${list.length === 1 ? '' : 's'}</p><ul class="tai-row-list">${list.map(l => lectureRow(l)).join('')}</ul>`;
  }

  /**
   * AI Tutor tab: the course's AI Tutor space, embedded. Same component and
   * same conversations as ai-tutor.html?course=… (components/course-chat.js).
   */
  function aiTab() {
    return '<div class="course-chat" data-course-chat></div>';
  }

  function mountChat(panel) {
    const opts = pendingChat;
    pendingChat = {};
    chatInstance = T.components.CourseChat.mount(panel.querySelector('[data-course-chat]'), {
      courseId: course.id,
      variant: 'embedded',
      conversationId: opts.conversationId || null,
      lectureId: opts.lectureId || null,
      onStateChange: ({ conversationId, lectureId }) => {
        if (tab !== 'ai-tutor') return;
        const p = new URLSearchParams({ id: course.id, tab: 'ai-tutor' });
        if (conversationId) p.set('c', conversationId);
        if (lectureId) p.set('lecture', lectureId);
        history.replaceState({ tab }, '', `${window.location.pathname}?${p}`);
      }
    });
  }

  function quizzesTab() {
    const createBtn = lectures.some(l => l.status === 'ready')
      ? `<a class="btn btn-primary btn-sm" href="${escape(url(`pages/student/quiz-create.html?course=${encodeURIComponent(course.id)}`))}">${T.ui.icon('plus')}<span>Create quiz</span></a>` : '';
    if (!quizzes.length) {
      return `<div class="tai-card">${T.ui.emptyState({
        icon: 'list-checks', title: 'No quizzes yet',
        text: lectures.some(l => l.status === 'ready') ? `Create a quiz from ${course.code}’s lectures — your results feed this course’s progress and mastery.` : 'Upload a lecture first — quizzes are generated from it.',
        actions: [lectures.some(l => l.status === 'ready')
          ? { label: 'Create quiz', icon: 'plus', href: url(`pages/student/quiz-create.html?course=${encodeURIComponent(course.id)}`) }
          : { label: 'Upload lecture', icon: 'upload', href: UI.uploadUrl(course.id) }]
      })}</div>`;
    }
    const waiting = quizzes.filter(q => q.status !== 'completed');
    const done = quizzes.filter(q => q.status === 'completed');
    return `
      <div class="row g-4">
        <div class="col-12">
          <section class="tai-card" aria-labelledby="quiz-waiting-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="quiz-waiting-title">Ready to take</h2><p class="tai-card__subtitle">${waiting.length ? `${waiting.length} not finished` : 'Nothing waiting'}</p></div>${createBtn}</div>
            ${waiting.length ? `<ul class="tai-row-list">${waiting.map(quizRow).join('')}</ul>` : `<p class="tai-meta mb-0">Every quiz here has been taken. Create another to keep practising.</p>`}
          </section>
        </div>
        <div class="col-12">
          <section class="tai-card" aria-labelledby="quiz-done-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="quiz-done-title">Completed</h2><p class="tai-card__subtitle">${done.length ? `${done.length} quiz${done.length === 1 ? '' : 'zes'} · ${attempts.length} attempt${attempts.length === 1 ? '' : 's'} · average ${course.averageScore}%` : 'None yet'}</p></div></div>
            ${done.length ? `<ul class="tai-row-list">${done.map(quizRow).join('')}</ul>` : `<p class="tai-meta mb-0">Your scores will appear here after your first quiz.</p>`}
          </section>
        </div>
      </div>`;
  }

  /** Topic averages for this course (analytics.byTopic): strong ≥ 80 · okay 65–79 · revise < 65. */
  function topicMastery() {
    return topics.map(t => ({ topic: t.topic, score: t.average, attempts: t.attempts, band: t.band })).sort((a, b) => b.score - a.score);
  }

  /** Coverage + mastery tiles and the per-lecture table they're calculated from. */
  function progressSummary() {
    const c = course;
    const ready = lectures.filter(l => l.status === 'ready')
      .sort((a, b) => (a.lectureNumber || 0) - (b.lectureNumber || 0) || a.uploadedAt.localeCompare(b.uploadedAt));
    return `
      <div class="tai-bento mb-4">
        <div class="tai-tile tai-tile--powder span-6">
          <span class="tai-tile__label">${T.ui.icon('layers')}Progress</span>
          <div class="tai-tile__value" data-count-to="${c.progress}" data-count-suffix="%">0%</div>
          <p class="tai-tile__meta">${escape(UI.coverageText(c))} — ready lectures with at least one question answered in a submitted quiz.</p>
          <span class="tai-tile__deco">${T.ui.icon('layers')}</span>
        </div>
        <div class="tai-tile tai-tile--${c.mastery === null ? 'white' : { sage: 'sage', butter: 'butter', pink: 'pink' }[UI.scoreTone(c.mastery)]} span-6">
          <span class="tai-tile__label">${T.ui.icon('target')}Mastery</span>
          <div class="tai-tile__value"${c.mastery === null ? '>—' : ` data-count-to="${c.mastery}" data-count-suffix="%">0%`}</div>
          <p class="tai-tile__meta">${c.mastery === null ? 'Take a quiz on a lecture to see your mastery.' : `Average of your best score on each of the ${c.attemptedLectureCount} attempted lecture${c.attemptedLectureCount === 1 ? '' : 's'} (each question counts for its own lecture).`}</p>
          <span class="tai-tile__deco">${T.ui.icon('target')}</span>
        </div>
      </div>
      ${ready.length ? `
      <section class="tai-card mb-4" aria-labelledby="coverage-title">
        <div class="tai-card__header"><div><h2 class="tai-card__title" id="coverage-title">By lecture</h2><p class="tai-card__subtitle">Best quiz score on each ready lecture</p></div></div>
        <ul class="tai-row-list">${ready.map(l => `
          <li class="tai-row">
            <span class="tai-icon-tile tai-icon-tile--${l.bestScore === null ? 'powder' : UI.scoreTone(l.bestScore)}">${T.ui.icon(l.bestScore === null ? 'circle-dashed' : 'circle-check')}</span>
            <div class="tai-row__main">
              <span class="tai-row__eyebrow">${escape(UI.lectureLabel(l))}</span>
              <p class="tai-row__title">${escape(l.title)}</p>
            </div>
            <div class="tai-row__side">${l.bestScore === null
              ? `<span class="tai-badge tai-badge--outline">Not quizzed yet</span>`
              : `<span class="tai-badge tai-badge--${UI.scoreTone(l.bestScore)}">Best ${l.bestScore}%</span>`}</div>
          </li>`).join('')}</ul>
      </section>` : ''}`;
  }

  function progressTab() {
    const done = attempts;
    if (!done.length) {
      return `${progressSummary()}<div class="tai-card">${T.ui.emptyState({
        icon: 'chart-line', title: 'No quiz results yet',
        text: 'Complete a practice quiz and your scores and topic mastery will be charted here.',
        actions: [{ label: 'View quizzes', icon: 'list-checks', href: UI.courseUrl(course.id, 'quizzes'), attrs: 'data-tab="quizzes"' }]
      })}</div>`;
    }
    const topics = topicMastery();
    const tone = (s) => ({ strong: 'sage', okay: 'butter', revise: 'pink' }[T.quizEngine.band(s)]);
    return `${progressSummary()}
      <div class="row g-4">
        <div class="col-lg-7">
          <section class="tai-card h-100" aria-labelledby="chart-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="chart-title">Quiz scores over time</h2><p class="tai-card__subtitle">${done.length} submitted attempt${done.length === 1 ? '' : 's'} · <a class="text-ink" href="${escape(url(`pages/student/progress.html?course=${encodeURIComponent(course.id)}`))}">Full analytics</a></p></div></div>
            <div class="course-chart"><canvas id="score-chart" role="img" aria-label="Line chart of quiz scores over time"></canvas></div>
            <table class="visually-hidden"><caption>Quiz scores</caption><thead><tr><th>Date</th><th>Quiz</th><th>Score</th></tr></thead><tbody>
              ${[...done].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).map(a => `<tr><td>${escape(formatDate(a.submittedAt))}</td><td>${escape(a.quizTitle)}</td><td>${a.percent}%</td></tr>`).join('')}
            </tbody></table>
          </section>
        </div>
        <div class="col-lg-5">
          <section class="tai-card h-100" aria-labelledby="mastery-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="mastery-title">Topic mastery</h2><p class="tai-card__subtitle">Average per topic · strong ≥ 80 · okay 65–79 · revise < 65</p></div></div>
            <div class="d-grid gap-4">
              ${topics.map(t => `
                <div class="tai-progress-row">
                  <div class="tai-progress-row__head"><span class="tai-progress-row__label">${escape(t.topic)}</span><span class="tai-progress-row__value">${t.score}%</span></div>
                  <div class="progress" role="progressbar" aria-label="${escape(t.topic)} mastery" aria-valuenow="${t.score}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar is-${tone(t.score)}" data-meter="${t.score}"></div></div>
                  <span class="tai-small tai-muted">${t.attempts} attempt${t.attempts === 1 ? '' : 's'}${t.band === 'revise' ? ' · worth revising (under 65%)' : ''}</span>
                </div>`).join('')}
            </div>
          </section>
        </div>
      </div>`;
  }

  function drawChart() {
    const canvas = document.getElementById('score-chart');
    if (!canvas) return;
    if (!window.Chart) {
      canvas.parentElement.innerHTML = `<p class="tai-meta mb-0">The chart couldn’t load (offline?). Your scores are listed under Topic mastery.</p>`;
      return;
    }
    const done = [...attempts].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const C = T.chartColors;
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: done.map(a => formatDate(a.submittedAt, { month: 'short', day: 'numeric' })),
        datasets: [{
          label: 'Score',
          data: done.map(a => a.percent),
          borderColor: C.ink,
          backgroundColor: 'rgba(233, 227, 250, 0.6)',
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: C.ink
        }, {
          label: 'Revision threshold (65%)',
          data: done.map(() => 65),
          borderColor: '#E0788A',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%', stepSize: 25 } }, x: { grid: { display: false } } },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { title: (items) => done[items[0].dataIndex].quizTitle, label: (item) => `${item.dataset.label}: ${item.raw}%` } }
        }
      }
    });
  }

  /* ---- Render & navigation ------------------------------------------------- */
  const RENDERERS = { overview: overviewTab, lectures: lecturesTab, 'ai-tutor': aiTab, quizzes: quizzesTab, progress: progressTab };

  function renderPanel() {
    if (chart) { chart.destroy(); chart = null; }
    if (chatInstance) { chatInstance.destroy(); chatInstance = null; }
    const panel = $('[data-tab-panel]', root);
    panel.innerHTML = RENDERERS[tab]();
    T.ui.enhance(panel);
    if (tab === 'ai-tutor') mountChat(panel);
    if (tab === 'progress') drawChart();
    if (tab === 'lectures') bindLectureSearch();
    if (tab === 'quizzes' && highlightQuiz) {
      const row = panel.querySelector(`[data-quiz-id="${CSS.escape(highlightQuiz)}"]`);
      if (row) { row.classList.add('is-highlighted'); setTimeout(() => row.scrollIntoView({ block: 'center', behavior: T.utils.reducedMotion() ? 'auto' : 'smooth' }), 250); }
      highlightQuiz = null;
    }
    if (tab === 'lectures' && highlightLecture) {
      const row = panel.querySelector(`[data-lecture-id="${CSS.escape(highlightLecture)}"]`);
      if (row) { row.classList.add('is-highlighted'); setTimeout(() => row.scrollIntoView({ block: 'center', behavior: T.utils.reducedMotion() ? 'auto' : 'smooth' }), 250); }
      highlightLecture = null;
    }
  }

  function renderAll() {
    T.shell.setCrumbs([
      { label: 'My Courses', href: url('pages/student/courses.html') },
      { label: course.code }
    ]);
    document.title = `${course.code} — ${course.title} · TutorAI`;
    root.innerHTML = `${header()}${tabsNav()}<div class="course-panel" data-tab-panel></div>`;
    T.ui.enhance(root);
    renderPanel();
  }

  function goToTab(next, { push = true } = {}) {
    if (!tabIds.includes(next)) return;
    tab = next;
    $$('[data-tab]', $('.course-tabs', root)).forEach(a => {
      const on = a.dataset.tab === tab;
      a.classList.toggle('active', on);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    if (push) {
      const p = new URLSearchParams({ id: course.id, tab });
      history.pushState({ tab }, '', `${window.location.pathname}?${p}`);
    }
    renderPanel();
  }

  function bindLectureSearch() {
    const input = document.getElementById('lecture-search');
    if (!input) return;
    input.addEventListener('input', T.utils.debounce(() => {
      lectureQuery = input.value;
      const sorted = [...lectures].sort((a, b) => (b.lectureNumber || 0) - (a.lectureNumber || 0) || b.uploadedAt.localeCompare(a.uploadedAt));
      const q = lectureQuery.trim().toLowerCase();
      const list = sorted.filter(l => !q || `${l.title} ${l.fileName} ${l.description} lecture ${l.lectureNumber || ''}`.toLowerCase().includes(q));
      const box = $('[data-lecture-list]', root);
      box.innerHTML = lectureListHtml(list);
      T.ui.icons(box);
    }, 150));
  }

  async function refresh() {
    [course, lectures, quizzes] = await Promise.all([
      T.api.courses.get(course.id), T.api.lectures.list(course.id), T.api.quizzes.list(course.id)
    ]);
    [attempts, topics] = await Promise.all([T.api.attempts.list({ status: 'submitted', courseId: course.id }), T.api.analytics.byTopic({ courseId: course.id })]);
  }

  async function deleteLecture(id) {
    const l = lectures.find(x => x.id === id);
    if (!l) return;
    const ok = await T.ui.confirm({
      title: `Delete “${l.title}”?`,
      message: 'The AI Tutor will stop using it. Quizzes made from it are kept. This can’t be undone.',
      confirmLabel: 'Delete lecture', danger: true
    });
    if (!ok) return;
    try {
      await T.api.lectures.remove(id);
      await refresh();
      renderAll();
      T.ui.toast({ title: 'Lecture deleted', message: `“${l.title}” was removed from ${course.code}.`, variant: 'success' });
      const search = document.getElementById('lecture-search');
      if (search) search.focus();
    } catch (err) {
      T.ui.toast({ title: 'Couldn’t delete the lecture', message: err.message, variant: 'danger' });
    }
  }

  root.addEventListener('click', (e) => {
    const tabLink = e.target.closest('[data-tab]');
    if (tabLink && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      goToTab(tabLink.dataset.tab);
      if (!tabLink.closest('.course-tabs')) $('.course-tabs', root).scrollIntoView({ block: 'nearest', behavior: T.utils.reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'delete-lecture') deleteLecture(action.dataset.id);
    else if (action.dataset.action === 'ask-ai') {
      // Lecture-scoped chat in this course's AI Tutor tab
      pendingChat = { lectureId: action.dataset.id, conversationId: null };
      if (tab === 'ai-tutor' && chatInstance) { chatInstance.startNew({ lectureId: action.dataset.id }); return; }
      goToTab('ai-tutor');
      $('.course-tabs', root).scrollIntoView({ block: 'nearest', behavior: T.utils.reducedMotion() ? 'auto' : 'smooth' });
    }
    else if (action.dataset.action === 'clear-lecture-search') {
      lectureQuery = '';
      renderPanel();
      document.getElementById('lecture-search').focus();
    } else if (action.dataset.action === 'open-quiz') {
      T.ui.toast({ title: action.dataset.title, message: 'The quiz player arrives with the Quizzes stage. Your scores here are sample data.', variant: 'info' });
    }
  });

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search);
    if (!course || p.get('id') !== course.id) return;
    const next = tabIds.includes(p.get('tab')) ? p.get('tab') : 'overview';
    if (next === 'ai-tutor') pendingChat = { conversationId: p.get('c'), lectureId: p.get('lecture') };
    goToTab(next, { push: false });
  });

  /* ---- Boot ---------------------------------------------------------------- */
  if (!courseId) { notFound('No course was selected. Choose one from My Courses.'); return; }
  try {
    course = await T.api.courses.markAccessed(courseId);   // also updates lastAccessedAt
    [lectures, quizzes, attempts, topics] = await Promise.all([
      T.api.lectures.list(courseId), T.api.quizzes.list(courseId),
      T.api.attempts.list({ status: 'submitted', courseId }), T.api.analytics.byTopic({ courseId })
    ]);
  } catch (err) {
    if (err.status === 404) notFound();
    else {
      root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load this course', text: err.message,
        actions: [{ label: 'Back to My Courses', href: url('pages/student/courses.html') }] })}</div>`;
      T.ui.icons(root);
    }
    return;
  }
  // Normalise the URL (adds ?tab= when missing, drops ?lecture= after use)
  const keep = new URLSearchParams({ id: course.id, tab });
  if (tab === 'ai-tutor') { if (params.get('c')) keep.set('c', params.get('c')); if (params.get('lecture')) keep.set('lecture', params.get('lecture')); }
  history.replaceState({ tab }, '', `${window.location.pathname}?${keep}`);
  renderAll();
});
