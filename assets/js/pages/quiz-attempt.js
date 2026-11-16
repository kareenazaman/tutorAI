/**
 * TutorAI — Take a quiz (pages/student/quiz-attempt.html?id=qz_…[&fresh=1])
 * ------------------------------------------------------------------
 * Focus mode (core/focus-layout.js): no sidebar/topbar, a slim header.
 * attempts.start resumes the open attempt or starts a new one (fresh=1 →
 * a retry: new attempt, shuffled; the old one is kept).
 *
 * The page only ever receives the sanitized quiz from the API: no correct
 * answers, explanations, model answers or keywords exist in its memory or
 * DOM before submission. Results load on quiz-results.html after submit.
 *
 * Autosave: every change PATCHes the attempt (answers, position, flags).
 * Keyboard: 1–4 choose options, ←/→ previous/next (not while typing).
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const MD = T.markdown;
  const E = T.quizEngine;
  const UI = T.components.CourseUI;
  const { $, $$, escape, url } = T.utils;

  const root = document.querySelector('[data-attempt-root]');
  const live = document.querySelector('[data-live]');
  const announce = (m) => { live.textContent = ''; setTimeout(() => { live.textContent = m; }, 40); };
  const params = new URLSearchParams(window.location.search);
  const quizId = params.get('id');
  const TYPE_LABELS = { mcq: 'Choose one', multi: 'Choose all that apply', true_false: 'True or false', short: 'Short answer' };

  let quiz = null, attempt = null;
  let answers = {}, flagged = new Set(), index = 0;
  let leaving = false, submitting = false, timer = null, saveTimer = null;

  function fail(title, text, action = { label: 'Back to Quizzes', href: url('pages/student/quizzes.html') }) {
    root.innerHTML = `<div class="qa-fail"><div class="tai-card">${T.ui.emptyState({ icon: 'circle-alert', tone: 'butter', title, text, actions: [action] })}</div></div>`;
    T.ui.icons(root);
  }

  /* ---- Load ------------------------------------------------------------------ */
  if (!quizId) return fail('No quiz selected', 'Open a quiz from your Quizzes page.');
  try {
    const res = await T.api.attempts.start(quizId, { fresh: params.get('fresh') === '1' });
    attempt = res.attempt;
    quiz = res.quiz;
    if (params.has('fresh')) history.replaceState(null, '', `${window.location.pathname}?id=${encodeURIComponent(quizId)}`);   // reload resumes, not restarts
    if (res.resumed && params.get('fresh') === '1') T.ui.toast({ title: 'Resuming your open attempt', message: 'Finish or submit it before starting another.', variant: 'info' });
  } catch (err) {
    return fail(err.status === 404 ? 'Quiz not found' : 'We couldn’t open this quiz', err.status === 404 ? 'It may have been deleted.' : err.message);
  }
  answers = { ...attempt.answers };
  flagged = new Set(attempt.flagged || []);
  index = Math.min(attempt.currentIndex || 0, quiz.questions.length - 1);
  document.title = `${quiz.title} · Quiz · TutorAI`;

  /* ---- Layout ----------------------------------------------------------------- */
  const lectureLine = (quiz.lectures || []).map(l => UI.lectureLabel(l)).join(', ');
  root.innerHTML = `
    <header class="qa-head">
      <div class="qa-head__title">
        <p class="qa-head__quiz tai-truncate">${escape(quiz.title)}</p>
        <p class="qa-head__meta tai-truncate">${escape(quiz.course ? quiz.course.code : '')}${lectureLine ? ` · ${escape(lectureLine)}` : ''}</p>
      </div>
      <div class="qa-head__progress">
        <span class="qa-head__count" data-count>Question 1 of ${quiz.questions.length}</span>
        <div class="progress progress-sm" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${quiz.questions.length}" data-progress><div class="progress-bar"></div></div>
      </div>
      <div class="qa-head__actions">
        ${attempt.deadlineAt ? `<span class="qa-timer" data-timer role="timer" aria-live="off">${T.ui.icon('timer', 'icon-sm')}<span>--:--</span></span>` : ''}
        <span class="qa-saved tai-small tai-muted" data-saved aria-live="polite"></span>
        <button type="button" class="btn btn-secondary btn-sm" data-action="exit">${T.ui.icon('log-out')}<span>Exit</span></button>
      </div>
    </header>
    <div class="qa-body">
      <section class="qa-card tai-card" aria-labelledby="qa-prompt" data-question></section>
      <aside class="qa-side tai-card" aria-label="Question navigator">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h2 class="tai-card__title mb-0">Questions</h2>
          <span class="tai-small tai-muted" data-answered></span>
        </div>
        <div class="qa-grid" data-grid role="list"></div>
        <ul class="qa-legend" aria-hidden="true">
          <li><span class="qa-dot is-answered"></span>Answered</li><li><span class="qa-dot"></span>Unanswered</li><li><span class="qa-dot is-flagged"></span>Flagged</li>
        </ul>
        <button type="button" class="btn btn-primary w-100 mt-3" data-action="submit">${T.ui.icon('send')}<span>Submit quiz</span></button>
      </aside>
    </div>`;
  T.ui.icons(root);

  const answered = (q) => E.isAnswered(q, answers[q.id]);

  /* ---- Render ------------------------------------------------------------------ */
  function renderQuestion({ focus = false } = {}) {
    const q = quiz.questions[index];
    const n = quiz.questions.length;
    const lec = (quiz.lectures || []).find(l => l.id === q.lectureId);
    const value = answers[q.id];
    let input;
    if (q.type === 'short') {
      input = `
        <label class="form-label" for="qa-short">Your answer</label>
        <textarea id="qa-short" class="form-control qa-short" rows="5" maxlength="${q.maxLength}" data-short aria-describedby="qa-short-count">${escape(value || '')}</textarea>
        <p class="form-text text-end mb-0" id="qa-short-count" data-short-count>${(value || '').length} / ${q.maxLength}</p>`;
    } else {
      const multi = q.type === 'multi';
      input = `
        <fieldset class="qa-options">
          <legend class="visually-hidden">${escape(TYPE_LABELS[q.type])}</legend>
          ${q.options.map((o, i) => {
            const on = multi ? Array.isArray(value) && value.includes(o.id) : value === o.id;
            return `<label class="qa-option${on ? ' is-selected' : ''}">
              <input type="${multi ? 'checkbox' : 'radio'}" name="qa-opt" value="${escape(o.id)}"${on ? ' checked' : ''}>
              <span class="qa-option__key" aria-hidden="true">${i + 1}</span>
              <span class="qa-option__text">${escape(o.text)}</span>
            </label>`;
          }).join('')}
        </fieldset>`;
    }
    $('[data-question]', root).innerHTML = `
      <div class="qa-card__meta">
        <span class="tai-badge tai-badge--outline">${escape(TYPE_LABELS[q.type])}</span>
        <span class="tai-small tai-muted">${escape(lec ? UI.lectureLabel(lec) : 'Lecture')} · ${escape(q.topic || '')}</span>
        <button type="button" class="btn btn-ghost btn-sm ms-auto qa-flag${flagged.has(q.id) ? ' is-on' : ''}" data-action="flag" aria-pressed="${flagged.has(q.id)}">${T.ui.icon('flag')}<span>${flagged.has(q.id) ? 'Flagged' : 'Flag for review'}</span></button>
      </div>
      <p class="qa-card__num" id="qa-num">Question ${index + 1} of ${n}</p>
      <div class="tai-prose qa-card__prompt" id="qa-prompt">${MD.renderMarkdown(q.prompt)}</div>
      ${input}
      <div class="qa-card__foot">
        <button type="button" class="btn btn-secondary" data-action="prev"${index === 0 ? ' disabled' : ''}>${T.ui.icon('arrow-left')}<span>Previous</span></button>
        <span class="tai-small tai-muted d-none d-md-inline">${q.type === 'short' ? '' : 'Keys 1–4 choose · '}← → move</span>
        ${index === n - 1
          ? `<button type="button" class="btn btn-primary" data-action="submit"><span>Review &amp; submit</span>${T.ui.icon('send')}</button>`
          : `<button type="button" class="btn btn-primary" data-action="next"><span>Next</span>${T.ui.icon('arrow-right')}</button>`}
      </div>`;
    T.ui.icons($('[data-question]', root));
    renderChrome();
    if (focus) { const h = $('#qa-prompt', root); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
  }

  function renderChrome() {
    const n = quiz.questions.length;
    const done = quiz.questions.filter(answered).length;
    $('[data-count]', root).textContent = `Question ${index + 1} of ${n}`;
    const bar = $('[data-progress]', root);
    bar.setAttribute('aria-valuenow', String(done));
    bar.firstElementChild.style.width = `${Math.round((done / n) * 100)}%`;
    $('[data-answered]', root).textContent = `${done} of ${n} answered`;
    $('[data-grid]', root).innerHTML = quiz.questions.map((q, i) => {
      const st = [answered(q) ? 'answered' : 'unanswered', flagged.has(q.id) ? 'flagged' : ''].filter(Boolean);
      return `<button type="button" class="qa-grid__btn${answered(q) ? ' is-answered' : ''}${flagged.has(q.id) ? ' is-flagged' : ''}${i === index ? ' is-current' : ''}" data-go="${i}" role="listitem"
        aria-label="Question ${i + 1}, ${st.join(', ')}"${i === index ? ' aria-current="step"' : ''}>${i + 1}</button>`;
    }).join('');
  }

  /* ---- Saving ------------------------------------------------------------------ */
  const savedEl = () => $('[data-saved]', root);
  async function save() {
    clearTimeout(saveTimer);
    if (submitting) return;
    savedEl().textContent = 'Saving…';
    try {
      await T.api.attempts.save(attempt.id, { answers, currentIndex: index, flagged: [...flagged] });
      savedEl().textContent = 'Saved';
    } catch (err) {
      savedEl().textContent = 'Not saved';
      if (err.status === 409) { leaving = true; window.location.href = url(`pages/student/quiz-results.html?attempt=${encodeURIComponent(attempt.id)}`); }
    }
  }
  const saveSoon = (ms = 400) => { clearTimeout(saveTimer); savedEl().textContent = 'Saving…'; saveTimer = setTimeout(save, ms); };

  /* ---- Navigation & answers ---------------------------------------------------- */
  function go(i) {
    if (i < 0 || i >= quiz.questions.length || i === index) return;
    index = i;
    renderQuestion({ focus: true });
    save();
  }

  function choose(optionId) {
    const q = quiz.questions[index];
    if (q.type === 'short') return;
    if (q.type === 'multi') {
      const set = new Set(Array.isArray(answers[q.id]) ? answers[q.id] : []);
      set.has(optionId) ? set.delete(optionId) : set.add(optionId);
      answers[q.id] = [...set];
    } else {
      answers[q.id] = optionId;
    }
    $$('.qa-option', root).forEach(l => {
      const inp = l.querySelector('input');
      const on = q.type === 'multi' ? answers[q.id].includes(inp.value) : answers[q.id] === inp.value;
      inp.checked = on; l.classList.toggle('is-selected', on);
    });
    renderChrome();
    save();
  }

  root.addEventListener('change', (e) => {
    if (e.target.name === 'qa-opt') choose(e.target.value);
  });
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-short]')) return;
    const q = quiz.questions[index];
    answers[q.id] = e.target.value.slice(0, q.maxLength);
    $('[data-short-count]', root).textContent = `${e.target.value.length} / ${q.maxLength}`;
    renderChrome();
    saveSoon();
  });

  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) return go(Number(g.dataset.go));
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'prev') go(index - 1);
    else if (act === 'next') go(index + 1);
    else if (act === 'flag') {
      const q = quiz.questions[index];
      flagged.has(q.id) ? flagged.delete(q.id) : flagged.add(q.id);
      a.classList.toggle('is-on', flagged.has(q.id));
      a.setAttribute('aria-pressed', String(flagged.has(q.id)));
      a.querySelector('span').textContent = flagged.has(q.id) ? 'Flagged' : 'Flag for review';
      renderChrome();
      announce(flagged.has(q.id) ? `Question ${index + 1} flagged for review.` : `Flag removed from question ${index + 1}.`);
      save();
    } else if (act === 'submit') confirmSubmit();
    else if (act === 'exit') exit();
  });

  document.addEventListener('keydown', (e) => {
    if (submitting || document.querySelector('.modal.show')) return;
    const typing = e.target.matches('textarea, input[type="text"], input[type="search"]');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    else if (/^[1-9]$/.test(e.key)) {
      const q = quiz.questions[index];
      const opt = q.options && q.options[Number(e.key) - 1];
      if (opt) { e.preventDefault(); choose(opt.id); }
    }
  });

  /* ---- Submit, exit, timer ----------------------------------------------------- */
  async function submit({ auto = false } = {}) {
    if (submitting) return;
    submitting = true;
    clearInterval(timer);
    clearTimeout(saveTimer);
    try {
      await T.api.attempts.save(attempt.id, { answers, currentIndex: index, flagged: [...flagged] }).catch(() => {});
      const r = await T.api.attempts.submit(attempt.id);
      leaving = true;
      if (auto) T.utils.session.set('tai.quiz.autoSubmitted', attempt.id);
      window.location.href = url(`pages/student/quiz-results.html?attempt=${encodeURIComponent(r.id)}`);
    } catch (err) {
      submitting = false;
      T.ui.toast({ title: 'Couldn’t submit', message: `${err.message} Your answers are saved — try again.`, variant: 'danger' });
    }
  }

  async function confirmSubmit() {
    const unanswered = quiz.questions.map((q, i) => (answered(q) ? null : i + 1)).filter(Boolean);
    const flags = quiz.questions.map((q, i) => (flagged.has(q.id) ? i + 1 : null)).filter(Boolean);
    const list = (nums) => (nums.length > 8 ? `${nums.slice(0, 8).join(', ')} and ${nums.length - 8} more` : nums.join(', '));
    const parts = [];
    if (unanswered.length) parts.push(`Unanswered: question${unanswered.length === 1 ? '' : 's'} ${list(unanswered)} (scored as incorrect).`);
    if (flags.length) parts.push(`Flagged for review: question${flags.length === 1 ? '' : 's'} ${list(flags)}.`);
    if (!parts.length) parts.push('All questions are answered and none are flagged.');
    const ok = await T.ui.confirm({ title: 'Submit your quiz?', message: `${parts.join(' ')} You can’t change answers after submitting.`, confirmLabel: 'Submit quiz', cancelLabel: 'Keep working' });
    if (ok) submit();
  }

  async function exit() {
    const ok = await T.ui.confirm({ title: 'Leave this quiz?', message: 'Your answers and position are saved — you can resume from Quizzes any time.', confirmLabel: 'Save and exit', cancelLabel: 'Stay' });
    if (!ok) return;
    await save();
    leaving = true;
    window.location.href = url('pages/student/quizzes.html');
  }

  window.addEventListener('beforeunload', (e) => {
    if (leaving || submitting) return;
    save();
    e.preventDefault();
    e.returnValue = '';
  });

  function startTimer() {
    if (!attempt.deadlineAt) return;
    const el = $('[data-timer]', root);
    const end = new Date(attempt.deadlineAt).getTime();
    let warned = false;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      const m = Math.floor(left / 60), s = left % 60;
      el.querySelector('span').textContent = `${m}:${String(s).padStart(2, '0')}`;
      el.classList.toggle('is-low', left <= 60);
      el.setAttribute('aria-label', `${m} minutes ${s} seconds left`);
      if (left <= 60 && !warned) { warned = true; announce('One minute left.'); }
      if (left <= 0) {
        clearInterval(timer);
        T.ui.toast({ title: 'Time’s up', message: 'Submitting your answers…', variant: 'warning' });
        submit({ auto: true });
      }
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  /* ---- Boot -------------------------------------------------------------------- */
  renderQuestion();
  savedEl().textContent = Object.keys(answers).length ? 'Resumed' : '';
  if (Object.keys(answers).length) announce(`Resumed at question ${index + 1} of ${quiz.questions.length}.`);
  startTimer();
});
