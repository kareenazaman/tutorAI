/**
 * TutorAI — Quiz hub (pages/student/quizzes.html?course=&status=&source=)
 * ------------------------------------------------------------------
 * Stats (analytics.summary), "Practise weak topics" (analytics.byTopic →
 * quizzes.generate source 'weak-topics' → preview), in-progress attempts
 * (attempts.list) and the quiz list (quizzes.list) with filters in the URL.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const UI = T.components.CourseUI;
  const { $, $$, escape, url, timeAgo, formatDate } = T.utils;

  const root = document.querySelector('[data-quizzes-root]');
  const params = new URLSearchParams(window.location.search);
  const state = { course: params.get('course') || '', status: params.get('status') || '', source: params.get('source') || '' };
  const SOURCE = { ai: { label: 'AI', tone: 'lavender', icon: 'sparkles' }, lecture: { label: 'Lecture', tone: 'powder', icon: 'file-text' }, 'weak-topics': { label: 'Weak topics', tone: 'pink', icon: 'target' }, retry: { label: 'Missed questions', tone: 'butter', icon: 'rotate-ccw' } };
  const STATUS = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
  const quizUrl = (path, q) => url(`pages/student/${path}?${new URLSearchParams(q)}`);
  let courses = [], quizzes = [], inProgress = [], summary = null, weak = [];

  async function load() {
    [courses, quizzes, inProgress, summary, weak] = await Promise.all([
      T.api.courses.list(), T.api.quizzes.list(), T.api.attempts.list({ status: 'in_progress' }),
      T.api.analytics.summary(), T.api.analytics.byTopic()
    ]);
    weak = weak.filter(t => t.band === 'revise');
  }

  /* ---- Pieces --------------------------------------------------------------- */
  function stats() {
    const tile = (tone, icon, label, value, suffix, meta) => `
      <div class="tai-tile tai-tile--${tone} span-3">
        <span class="tai-tile__label">${T.ui.icon(icon)}${escape(label)}</span>
        <div class="tai-tile__value"${value == null ? '>—' : ` data-count-to="${value}" data-count-suffix="${suffix}">0${suffix}`}</div>
        <p class="tai-tile__meta">${escape(meta)}</p>
      </div>`;
    const top = weak[0];
    return `
      <div class="tai-bento mb-4">
        ${tile('sage', 'list-checks', 'Quizzes completed', summary.quizzesCompleted, '', summary.quizzesCompleted ? 'Submitted attempts, all time' : 'Take your first quiz')}
        ${tile('peach', 'percent', 'Average score', summary.averageScore, '%', summary.averageScore == null ? 'No results yet' : 'Across all attempts')}
        ${tile('butter', 'hourglass', 'In progress', summary.inProgress, '', summary.inProgress ? 'Pick up where you left off' : 'Nothing half-finished')}
        <section class="tai-tile tai-tile--dark span-3 qz-weak" aria-labelledby="weak-title">
          <span class="tai-tile__label">${T.ui.icon('target')}Practise weak topics</span>
          ${top ? `
            <h2 class="tai-tile__title" id="weak-title">${escape(top.topic)}</h2>
            <p class="tai-tile__meta">${escape(top.code)} · average ${top.average}%${weak.length > 1 ? ` · ${weak.length - 1} more to revise` : ''}</p>
            <div class="tai-tile__actions"><button type="button" class="btn btn-light btn-sm" data-practise="${escape(top.courseId)}" data-topic="${escape(top.topic)}">${T.ui.icon('wand-sparkles')}<span>Practise now</span></button></div>`
          : `<h2 class="tai-tile__title" id="weak-title">No weak topics</h2><p class="tai-tile__meta">${summary.quizzesCompleted ? 'Every topic is at 65% or more.' : 'Take a quiz and topics under 65% will show up here.'}</p>`}
          <span class="tai-tile__deco">${T.ui.icon('target')}</span>
        </section>
      </div>`;
  }

  function resumeList() {
    if (!inProgress.length) return '';
    return `
      <section class="tai-card mb-4" aria-labelledby="resume-title">
        <div class="tai-card__header"><div><h2 class="tai-card__title" id="resume-title">In progress</h2><p class="tai-card__subtitle">Your answers are saved — resume any time</p></div></div>
        <ul class="tai-row-list">${inProgress.map(a => `
          <li class="tai-row">
            <span class="tai-icon-tile tai-icon-tile--butter">${T.ui.icon('hourglass')}</span>
            <div class="tai-row__main">
              <span class="tai-row__eyebrow">${escape(a.course ? a.course.code : '')}</span>
              <p class="tai-row__title">${escape(a.quizTitle)}</p>
              <p class="tai-row__meta">${a.answeredCount} of ${a.total} answered · started ${escape(timeAgo(a.startedAt).toLowerCase())}${a.flaggedCount ? ` · ${a.flaggedCount} flagged` : ''}</p>
            </div>
            <div class="tai-row__side">
              <div class="progress progress-sm qz-mini" role="progressbar" aria-label="${a.answeredCount} of ${a.total} answered" aria-valuenow="${a.answeredCount}" aria-valuemin="0" aria-valuemax="${a.total}"><div class="progress-bar" style="width:${Math.round(a.answeredCount / a.total * 100)}%"></div></div>
              <a class="btn btn-primary btn-sm" href="${escape(quizUrl('quiz-attempt.html', { id: a.quizId }))}">${T.ui.icon('play')}<span>Resume</span></a>
            </div>
          </li>`).join('')}</ul>
      </section>`;
  }

  function filtersHtml() {
    const courseOpts = courses.map(c => `<option value="${escape(c.id)}"${c.id === state.course ? ' selected' : ''}>${escape(c.code)}</option>`).join('');
    return `
      <form class="tai-toolbar" data-filters role="search" aria-label="Filter quizzes">
        <label class="visually-hidden" for="qf-course">Course</label>
        <select id="qf-course" name="course" class="form-select"><option value="">All courses</option>${courseOpts}</select>
        <label class="visually-hidden" for="qf-status">Status</label>
        <select id="qf-status" name="status" class="form-select"><option value="">Any status</option>${Object.entries(STATUS).map(([v, l]) => `<option value="${v}"${v === state.status ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <label class="visually-hidden" for="qf-source">Source</label>
        <select id="qf-source" name="source" class="form-select"><option value="">Any source</option>${Object.entries(SOURCE).map(([v, s]) => `<option value="${v}"${v === state.source ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
      </form>`;
  }

  function filtered() {
    return quizzes.filter(q => (!state.course || q.courseId === state.course) && (!state.status || q.status === state.status) && (!state.source || q.source === state.source));
  }

  function quizItem(q) {
    const src = SOURCE[q.source] || SOURCE.lecture;
    const primary = q.status === 'in_progress'
      ? `<a class="btn btn-primary btn-sm" href="${escape(quizUrl('quiz-attempt.html', { id: q.id }))}">${T.ui.icon('play')}<span>Resume</span></a>`
      : q.status === 'completed'
        ? `<a class="btn btn-secondary btn-sm" href="${escape(quizUrl('quiz-attempt.html', { id: q.id, fresh: 1 }))}">${T.ui.icon('rotate-ccw')}<span>Retry</span></a>`
        : `<a class="btn btn-primary btn-sm" href="${escape(quizUrl('quiz-attempt.html', { id: q.id }))}">${T.ui.icon('play')}<span>Start</span></a>`;
    return `
      <li class="tai-row qz-row" data-quiz-id="${escape(q.id)}">
        <span class="tai-icon-tile tai-icon-tile--${q.bestScore == null ? src.tone : UI.scoreTone(q.bestScore)}">${T.ui.icon(q.status === 'completed' ? 'circle-check' : src.icon)}</span>
        <div class="tai-row__main">
          <span class="tai-row__eyebrow">${escape(q.course ? q.course.code : '')} · <span class="tai-badge tai-badge--${src.tone} tai-badge--sm">${escape(src.label)}</span></span>
          <p class="tai-row__title">${escape(q.title)}</p>
          <p class="tai-row__meta">${q.questionCount} questions · ${escape(q.difficulty)}${q.settings && q.settings.timeLimitMin ? ` · ${q.settings.timeLimitMin} min limit` : ''} · ${q.attemptCount} attempt${q.attemptCount === 1 ? '' : 's'}${q.lastTakenAt ? ` · last taken ${escape(formatDate(q.lastTakenAt))}` : ''}</p>
        </div>
        <div class="tai-row__side">
          ${q.bestScore == null ? `<span class="tai-badge tai-badge--outline">${escape(STATUS[q.status])}</span>` : `<span class="tai-badge tai-badge--${UI.scoreTone(q.bestScore)}" title="Best score">Best ${q.bestScore}%</span>`}
          ${primary}
          ${q.latestAttemptId ? `<a class="btn btn-ghost btn-sm" href="${escape(quizUrl('quiz-results.html', { attempt: q.latestAttemptId }))}">${T.ui.icon('chart-column')}<span>Results</span></a>` : ''}
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-delete="${escape(q.id)}" aria-label="Delete ${escape(q.title)}">${T.ui.icon('trash-2')}</button>
        </div>
      </li>`;
  }

  function listHtml() {
    if (!quizzes.length) {
      return T.ui.emptyState(courses.length
        ? { icon: 'list-checks', title: 'No quizzes yet', text: 'Create a quiz from your lecture PDFs — or ask the AI Tutor to “quiz me on…”. Your results feed your progress and mastery.', actions: [{ label: 'Create quiz', icon: 'plus', href: url('pages/student/quiz-create.html') }] }
        : { icon: 'book-open', title: 'Add a course first', text: 'Quizzes are made from a course’s lectures.', actions: [{ label: 'Go to My Courses', icon: 'arrow-right', href: url('pages/student/courses.html?new=1') }] });
    }
    const list = filtered();
    if (!list.length) {
      return T.ui.emptyState({ icon: 'search-x', tone: 'butter', compact: true, title: 'No quizzes match', text: 'Try another course, status or source.', actions: [{ label: 'Clear filters', icon: 'x', variant: 'secondary', attrs: 'data-action="clear"' }] });
    }
    return `<p class="tai-toolbar__count" aria-live="polite">${list.length === quizzes.length ? `${list.length} quiz${list.length === 1 ? '' : 'zes'}` : `Showing ${list.length} of ${quizzes.length}`}</p>
      <ul class="tai-row-list">${list.map(quizItem).join('')}</ul>`;
  }

  function render() {
    root.innerHTML = `
      ${T.ui.pageHeader({
        eyebrow: 'Practice', title: 'Quizzes', subtitle: 'Practise from your own lectures. Every result updates your progress, mastery and the AI Tutor’s suggestions.',
        actions: `<a class="btn btn-primary" href="${escape(url('pages/student/quiz-create.html'))}">${T.ui.icon('plus')}<span>Create quiz</span></a>`
      })}
      ${stats()}
      ${resumeList()}
      <section class="tai-card" aria-labelledby="all-title">
        <div class="tai-card__header"><div><h2 class="tai-card__title" id="all-title">All quizzes</h2><p class="tai-card__subtitle">Best score, attempts and last taken</p></div></div>
        ${quizzes.length ? filtersHtml() : ''}
        <div data-list>${listHtml()}</div>
      </section>`;
    T.ui.enhance(root);
  }

  function renderList() {
    const box = $('[data-list]', root);
    box.innerHTML = listHtml();
    T.ui.icons(box);
    const p = new URLSearchParams(Object.entries(state).filter(([, v]) => v));
    history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
  }

  /* ---- Actions -------------------------------------------------------------- */
  async function practise(btn) {
    T.ui.setButtonLoading(btn, true);
    try {
      const draft = await T.api.quizzes.generate({ courseId: btn.dataset.practise, source: 'weak-topics', topics: [btn.dataset.topic], count: 10, difficulty: 'medium', types: ['mcq', 'multi', 'true_false'], explanations: true });
      window.location.href = url(`pages/student/quiz-create.html?draft=${encodeURIComponent(draft.id)}`);
    } catch (err) {
      T.ui.setButtonLoading(btn, false);
      T.ui.toast({ title: 'Couldn’t make a practice quiz', message: err.message, variant: 'danger' });
    }
  }

  async function remove(id) {
    const q = quizzes.find(x => x.id === id);
    if (!q) return;
    const ok = await T.ui.confirm({
      title: `Delete “${q.title}”?`,
      message: `${q.attemptCount ? `Its ${q.attemptCount} attempt${q.attemptCount === 1 ? '' : 's'} will be deleted too, and your progress and mastery recalculated. ` : ''}This can’t be undone.`,
      confirmLabel: 'Delete quiz', danger: true
    });
    if (!ok) return;
    try {
      await T.api.quizzes.remove(id);
      await load();
      render();
      T.ui.toast({ title: 'Quiz deleted', message: `“${q.title}” was removed.`, variant: 'success' });
    } catch (err) {
      T.ui.toast({ title: 'Couldn’t delete the quiz', message: err.message, variant: 'danger' });
    }
  }

  root.addEventListener('change', (e) => {
    const f = e.target.closest('[data-filters]');
    if (!f) return;
    state[e.target.name] = e.target.value;
    renderList();
  });
  root.addEventListener('click', (e) => {
    const p = e.target.closest('[data-practise]');
    if (p) return practise(p);
    const d = e.target.closest('[data-delete]');
    if (d) return remove(d.dataset.delete);
    if (e.target.closest('[data-action="clear"]')) {
      state.course = state.status = state.source = '';
      $$('[data-filters] select', root).forEach(s => { s.value = ''; });
      renderList();
    }
  });

  /* ---- Boot ----------------------------------------------------------------- */
  try {
    await load();
    render();
  } catch (err) {
    root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your quizzes', text: err.message })}</div>`;
    T.ui.icons(root);
  }
});
