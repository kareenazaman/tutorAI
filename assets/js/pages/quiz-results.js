/**
 * TutorAI — Quiz results (pages/student/quiz-results.html?attempt=att_…)
 * ------------------------------------------------------------------
 * attempts.get returns the graded attempt with the quiz's answers (only
 * once it is submitted). Every number here comes from the stored
 * perQuestion grading of the stored answers — nothing is recomputed
 * differently or invented.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const UI = T.components.CourseUI;
  const MD = T.markdown;
  const E = T.quizEngine;
  const { $, $$, escape, url, formatDate } = T.utils;

  const root = document.querySelector('[data-results-root]');
  const params = new URLSearchParams(window.location.search);
  const attemptId = params.get('attempt');
  const TYPE_LABELS = { mcq: 'Multiple choice', multi: 'Multiple select', true_false: 'True / false', short: 'Short answer' };
  const BAND_TONE = { strong: 'sage', okay: 'butter', revise: 'pink' };

  function fail(title, text) {
    T.shell.setCrumbs([{ label: 'Quizzes', href: url('pages/student/quizzes.html') }, { label: 'Results' }]);
    root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon: 'search-x', tone: 'butter', title, text, actions: [{ label: 'Back to Quizzes', icon: 'arrow-left', href: url('pages/student/quizzes.html') }] })}</div>`;
    T.ui.icons(root);
  }

  if (!attemptId) return fail('No results selected', 'Open results from your Quizzes page.');
  let data;
  try {
    data = await T.api.attempts.get(attemptId);
  } catch (err) {
    return fail(err.status === 404 ? 'Results not found' : 'We couldn’t load these results', err.status === 404 ? 'This attempt doesn’t exist, or its quiz was deleted.' : err.message);
  }
  if (data.attempt.status !== 'submitted') {
    window.location.replace(url(`pages/student/quiz-attempt.html?id=${encodeURIComponent(data.attempt.quizId)}`));
    return;
  }

  const { attempt, quiz, previous, byLecture, byTopic } = data;
  const results = new Map(attempt.perQuestion.map(r => [r.questionId, r]));
  const flagged = new Set(attempt.flagged || []);
  const correctCount = attempt.perQuestion.filter(r => r.correct).length;
  const partialCount = attempt.perQuestion.filter(r => !r.correct && r.points > 0).length;
  const unansweredCount = attempt.perQuestion.filter(r => !r.answered).length;
  const wrongCount = attempt.total - correctCount - partialCount - unansweredCount;
  const seconds = Math.round((new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 1000);
  const fmtTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`);
  const fmtScore = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  // Timed quizzes: submitted at (or after) the deadline means the timer submitted it
  const auto = !!(attempt.deadlineAt && attempt.submittedAt && attempt.submittedAt >= attempt.deadlineAt);

  T.shell.setCrumbs([{ label: 'Quizzes', href: url('pages/student/quizzes.html') }, { label: quiz.title }, { label: 'Results' }]);
  document.title = `Results: ${quiz.title} · TutorAI`;

  // Celebration (core/motion.js): only on a new attempt's first view, never with reduced motion
  const M = T.motion;
  const celebrateFirstView = !attempt.resultsViewedAt && !!M && !M.reduced();
  const perfect = attempt.percent === 100;

  /* ---- Pieces --------------------------------------------------------------- */
  const band = E.band(attempt.percent);
  const lowestLecture = byLecture.find(l => l.lectureId && quiz.lectures.some(x => x.id === l.lectureId && x.status === 'ready'));
  const missed = quiz.questions.filter(q => !(results.get(q.id) || {}).correct);
  const firstMissedIn = (lectureId) => missed.find(q => q.lectureId === lectureId);
  const weakest = byTopic[0];

  function hero() {
    const diff = previous ? attempt.percent - previous.percent : null;
    return `
      <div class="tai-bento mb-4">
        <section class="tai-tile tai-tile--${BAND_TONE[band]} span-8 qr-hero" aria-labelledby="qr-title">
          <span class="tai-chip align-self-start">${T.ui.icon('list-checks')}${escape(quiz.course ? quiz.course.code : '')} · ${escape(quiz.title)}</span>
          <h1 class="visually-hidden" id="qr-title">Results for ${escape(quiz.title)}</h1>
          <div class="qr-hero__score">
            <div class="qr-ring" role="img" aria-label="Score: ${attempt.percent}%" data-ring>
              <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                <circle class="qr-ring__track" cx="60" cy="60" r="52" pathLength="100"></circle>
                <circle class="qr-ring__fill" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" style="stroke-dashoffset:${celebrateFirstView ? 100 : 100 - attempt.percent}" data-ring-fill></circle>
              </svg>
              <span class="qr-hero__percent qr-ring__value" aria-hidden="true" data-ring-value>${celebrateFirstView ? 0 : attempt.percent}%</span>
            </div>
            <div>
              <p class="qr-hero__line">${fmtScore(attempt.score)} / ${attempt.total} points</p>
              <p class="tai-tile__meta mb-0">${band === 'strong' ? 'Strong — ' : band === 'okay' ? 'Okay — ' : 'Worth revising — '}${correctCount} correct${partialCount ? `, ${partialCount} partly correct` : ''}, ${wrongCount} incorrect${unansweredCount ? `, ${unansweredCount} not answered` : ''}</p>
            </div>
          </div>
          <div class="tai-hero__meta">
            ${perfect ? `<span class="tai-chip qr-perfect" data-perfect${celebrateFirstView ? ' style="opacity:0"' : ''}>${T.ui.icon('trophy')}Perfect score</span>` : ''}
            ${previous
              ? `<span class="tai-chip">${T.ui.icon(diff >= 0 ? 'trending-up' : 'trending-down')}${diff === 0 ? 'Same as' : `${diff > 0 ? '+' : ''}${diff} points vs`} last attempt (${previous.percent}%)</span>`
              : '<span class="tai-chip">First attempt</span>'}
            <span class="tai-chip">${T.ui.icon('timer')}${fmtTime(seconds)}</span>
            <span class="tai-chip">${T.ui.icon('calendar')}${escape(formatDate(attempt.submittedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span>
            ${auto ? `<span class="tai-chip">${T.ui.icon('alarm-clock')}Submitted when time ran out</span>` : ''}
          </div>
          <span class="tai-tile__deco">${T.ui.icon('award')}</span>
        </section>
        <section class="tai-tile tai-tile--white span-4 qr-next" aria-labelledby="qr-next-title">
          <span class="tai-tile__label" id="qr-next-title">${T.ui.icon('compass')}What next?</span>
          <div class="qr-next__actions">
            <a class="btn btn-primary" href="${escape(url(`pages/student/quiz-attempt.html?id=${encodeURIComponent(quiz.id)}&fresh=1`))}">${T.ui.icon('rotate-ccw')}<span>Retry quiz</span></a>
            ${missed.length ? `<button type="button" class="btn btn-soft" data-action="practise">${T.ui.icon('wand-sparkles')}<span>Practise what I missed</span></button>` : ''}
            ${lowestLecture ? `<a class="btn btn-secondary" href="${escape(url(`pages/student/lecture.html?id=${encodeURIComponent(lowestLecture.lectureId)}${firstMissedIn(lowestLecture.lectureId) ? `&page=${firstMissedIn(lowestLecture.lectureId).page}` : ''}`))}">${T.ui.icon('book-open-text')}<span>Review ${escape(lowestLecture.lectureNumber ? `Lecture ${lowestLecture.lectureNumber}` : 'lecture')}</span></a>` : ''}
            ${quiz.course ? `<a class="btn btn-secondary" href="${escape(url(`pages/student/ai-tutor.html?course=${encodeURIComponent(quiz.course.id)}&q=${encodeURIComponent(`Help me understand ${weakest ? weakest.topic : quiz.title} — I scored ${weakest ? weakest.percent : attempt.percent}% on “${quiz.title}”`)}`))}">${T.ui.icon('sparkles')}<span>Ask AI Tutor about this</span></a>` : ''}
          </div>
        </section>
      </div>`;
  }

  function breakdown(title, list, labelOf, linkOf) {
    return `
      <section class="tai-card h-100" aria-label="${escape(title)}">
        <div class="tai-card__header"><h2 class="tai-card__title">${escape(title)}</h2></div>
        <div class="d-grid gap-3">${list.map(g => `
          <div class="tai-progress-row">
            <div class="tai-progress-row__head">
              <span class="tai-progress-row__label">${linkOf && linkOf(g) ? `<a class="text-ink" href="${escape(linkOf(g))}">${escape(labelOf(g))}</a>` : escape(labelOf(g))}</span>
              <span class="tai-progress-row__value">${fmtScore(g.points)}/${g.total} · ${g.percent}%</span>
            </div>
            <div class="progress" role="progressbar" aria-label="${escape(labelOf(g))}" aria-valuenow="${g.percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar is-${BAND_TONE[E.band(g.percent)]}" data-meter="${g.percent}"></div></div>
          </div>`).join('')}</div>
      </section>`;
  }

  function optionLine(q, o, value) {
    const chosen = q.type === 'multi' ? Array.isArray(value) && value.includes(o.id) : value === o.id;
    const right = q.correct.includes(o.id);
    const cls = right ? 'is-correct' : chosen ? 'is-wrong' : '';
    const tags = [chosen ? 'Your answer' : '', right ? 'Correct answer' : ''].filter(Boolean);
    return `<li class="qr-opt ${cls}">
      <span class="qr-opt__icon" aria-hidden="true">${T.ui.icon(right ? 'circle-check' : chosen ? 'circle-x' : 'circle')}</span>
      <span class="qr-opt__text">${escape(o.text)}</span>
      ${tags.length ? `<span class="qr-opt__tags">${tags.map(t => `<span class="tai-badge tai-badge--sm ${t === 'Correct answer' ? 'tai-badge--sage' : 'tai-badge--outline'}">${t}</span>`).join('')}</span>` : ''}
    </li>`;
  }

  function review(q, i) {
    const r = results.get(q.id) || { points: 0, correct: false, answered: false };
    const value = attempt.answers[q.id];
    const status = !r.answered ? ['outline', 'Not answered'] : r.correct ? ['sage', 'Correct'] : r.points > 0 ? ['butter', `Partly correct · ${r.points} point`] : ['pink', 'Incorrect'];
    const lec = quiz.lectures.find(l => l.id === q.lectureId);
    let body;
    if (q.type === 'short') {
      const f = r.feedback || { matched: [], missing: q.correct.keywords, required: Math.min(3, q.correct.keywords.length) };
      body = `
        <div class="qr-short">
          <p class="qr-short__label">Your answer</p>
          <p class="qr-short__text">${value ? escape(value).replace(/\n/g, '<br>') : '<span class="tai-muted">No answer</span>'}</p>
          <div class="qr-feedback">
            <p class="qr-short__label">${T.ui.icon('sparkles', 'icon-xs')} AI feedback (demo)</p>
            <p class="mb-2">${f.matched.length >= f.required ? 'You covered the key ideas.' : f.matched.length ? `You covered ${f.matched.length} of the ${f.required} key ideas needed for full marks — ${r.points > 0 ? `partial credit (${r.points} point)` : `cover at least ${Math.ceil(f.required / 2)} for partial credit`}.` : 'None of the key ideas came through yet.'}</p>
            <div class="qr-keywords">${f.matched.map(k => `<span class="tai-badge tai-badge--sage">${T.ui.icon('check')}${escape(k)}</span>`).join('')}${f.missing.map(k => `<span class="tai-badge tai-badge--outline">${escape(k)}</span>`).join('')}</div>
          </div>
          <p class="qr-short__label mt-3">Model answer</p>
          <div class="tai-prose">${MD.renderMarkdown(q.correct.model)}</div>
        </div>`;
    } else {
      body = `<ul class="qr-opts">${q.options.map(o => optionLine(q, o, value)).join('')}</ul>`;
    }
    return `
      <li class="qr-q" data-status="${r.correct ? 'correct' : 'incorrect'}" data-flagged="${flagged.has(q.id)}">
        <div class="qr-q__head">
          <span class="qc-q__num">${i + 1}</span>
          <span class="tai-badge tai-badge--${status[0]}">${escape(status[1])}</span>
          ${flagged.has(q.id) ? `<span class="tai-badge tai-badge--butter">${T.ui.icon('flag')}Flagged</span>` : ''}
          <span class="tai-small tai-muted ms-auto">${escape(TYPE_LABELS[q.type])}</span>
        </div>
        <div class="tai-prose qr-q__prompt">${MD.renderMarkdown(q.prompt)}</div>
        ${body}
        ${quiz.settings.explanations && q.explanation ? `<div class="qr-explain"><p class="qr-short__label">Explanation</p><div class="tai-prose">${MD.renderMarkdown(q.explanation)}</div></div>` : ''}
        <a class="qr-source" href="${escape(url(`pages/student/lecture.html?id=${encodeURIComponent(q.lectureId)}&page=${q.page}`))}">${T.ui.icon('file-text', 'icon-xs')} ${escape(lec ? `${UI.lectureLabel(lec)}: ${lec.title}` : 'Lecture')} · page ${q.page}${q.topic ? ` · ${escape(q.topic)}` : ''}</a>
      </li>`;
  }

  const counts = { all: quiz.questions.length, incorrect: quiz.questions.filter(q => !(results.get(q.id) || {}).correct).length, flagged: quiz.questions.filter(q => flagged.has(q.id)).length };

  root.innerHTML = `
    ${hero()}
    <div class="row g-4 mb-4">
      <div class="col-lg-6">${breakdown('By lecture', byLecture, g => `${g.lectureNumber ? `Lecture ${g.lectureNumber}: ` : ''}${g.title}`, g => g.lectureId && quiz.lectures.some(l => l.id === g.lectureId) ? url(`pages/student/lecture.html?id=${encodeURIComponent(g.lectureId)}`) : null)}</div>
      <div class="col-lg-6">${breakdown('By topic', byTopic, g => g.topic || 'General')}</div>
    </div>
    <section class="tai-card" aria-labelledby="qr-review-title">
      <div class="tai-card__header flex-wrap">
        <div><h2 class="tai-card__title" id="qr-review-title">Question review</h2><p class="tai-card__subtitle">Your answer, the correct answer${quiz.settings.explanations ? ', the explanation' : ''} and the page it came from</p></div>
        <div class="tai-segmented" data-segmented role="group" aria-label="Filter questions">
          <button type="button" class="tai-segmented__item active" data-value="all" aria-pressed="true">All (${counts.all})</button>
          <button type="button" class="tai-segmented__item" data-value="incorrect" aria-pressed="false">Incorrect (${counts.incorrect})</button>
          <button type="button" class="tai-segmented__item" data-value="flagged" aria-pressed="false">Flagged (${counts.flagged})</button>
        </div>
      </div>
      <ol class="qr-list" data-review>${quiz.questions.map(review).join('')}</ol>
      <p class="tai-meta mb-0 text-center py-4" data-review-empty hidden></p>
    </section>`;
  T.ui.enhance(root);
  celebrate();

  /**
   * First view of a new attempt: the ring fills with a count-up (~1.3s, ease-out).
   * ≥ 80%: confetti bursts from behind the ring when it finishes (bigger at 100%,
   * plus the "Perfect score" chip pops in). Below 80%: the results fade in gently.
   * Re-opened results, or reduced motion: everything is shown in its final state.
   */
  async function celebrate() {
    const live = document.querySelector('[data-live]');
    let first = false;
    try { first = (await T.api.attempts.markViewed(attempt.id)).firstView; } catch (e) { first = false; }
    const ringEl = $('[data-ring]', root);
    const fill = $('[data-ring-fill]', root);
    const value = $('[data-ring-value]', root);
    const chip = $('[data-perfect]', root);
    const showFinal = () => {
      fill.style.strokeDashoffset = String(100 - attempt.percent);
      value.textContent = `${attempt.percent}%`;
      if (chip) chip.style.opacity = '1';
    };
    if (!celebrateFirstView || !first) { showFinal(); return; }   // seen before (e.g. in another tab)

    const rest = Array.from(root.children).slice(1);              // everything after the hero row
    if (attempt.percent < 80) M.fadeIn(rest, { duration: 520, stagger: 90 });
    await Promise.all([M.ring(fill, attempt.percent), M.countUp(value, attempt.percent, { suffix: '%' })]);
    if (attempt.percent >= 80) {
      if (perfect) M.pop(chip);
      M.confetti(ringEl, perfect ? { count: 50, power: 1.3 } : { count: 35 });
    }
    if (live) { live.textContent = ''; setTimeout(() => { live.textContent = perfect ? `Perfect score: ${attempt.percent}%.` : `You scored ${attempt.percent}%.`; }, 30); }
  }

  /* ---- Interactions ---------------------------------------------------------- */
  const seg = $('[data-segmented]', root);
  seg.addEventListener('tai:segment', (e) => {
    const v = e.detail.value;
    $$('.tai-segmented__item', seg).forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.value === v)); b.removeAttribute('aria-selected'); });
    let shown = 0;
    $$('.qr-q', root).forEach(li => {
      const show = v === 'all' || (v === 'incorrect' && li.dataset.status !== 'correct') || (v === 'flagged' && li.dataset.flagged === 'true');
      li.hidden = !show; if (show) shown++;
    });
    const emptyEl = $('[data-review-empty]', root);
    emptyEl.hidden = shown > 0;
    emptyEl.textContent = v === 'incorrect' ? 'Nothing incorrect — well done.' : 'No questions were flagged.';
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action="practise"]');
    if (!b) return;
    T.ui.setButtonLoading(b, true);
    try {
      const draft = await T.api.quizzes.generate({ courseId: quiz.courseId, source: 'retry', fromAttemptId: attempt.id, count: missed.length > 7 ? 10 : 5, difficulty: quiz.difficulty, types: quiz.settings.types, explanations: true });
      window.location.href = url(`pages/student/quiz-create.html?draft=${encodeURIComponent(draft.id)}`);
    } catch (err) {
      T.ui.setButtonLoading(b, false);
      T.ui.toast({ title: 'Couldn’t make a practice quiz', message: err.message, variant: 'danger' });
    }
  });
});
