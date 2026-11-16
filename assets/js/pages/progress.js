/**
 * TutorAI — My Progress (pages/student/progress.html?course=&range=7d|30d|term)
 * ------------------------------------------------------------------
 * Everything comes from TutorAI.api.analytics.* with { courseId, from, to }:
 *   summary · performanceOverTime · byCourse · byTopic · activity
 * Definitions (docs/GUIDE.md → "Analytics definitions"): progress = coverage of ready lectures,
 * mastery = mean best per attempted lecture, topic bands strong ≥ 80 ·
 * okay 65–79 · revise < 65. Each chart has an empty state and a data table.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const UI = T.components.CourseUI;
  const E = T.quizEngine;
  const { $, $$, escape, url, formatDate } = T.utils;

  const root = document.querySelector('[data-progress-root]');
  const params = new URLSearchParams(window.location.search);
  const RANGES = { '7d': 'Last 7 days', '30d': 'Last 30 days', term: 'This term' };
  const state = { course: params.get('course') || '', range: RANGES[params.get('range')] ? params.get('range') : '30d' };
  const C = T.chartColors || { series: ['#18181B'], fills: ['#E9E3FA'], grid: '#EFEFEC', text: '#5F5F69', ink: '#18181B' };
  const PASTEL = { lavender: ['#8B78D6', '#E9E3FA'], powder: ['#5B93D3', '#DCEBFB'], sage: ['#4FA67A', '#D8F0E3'], butter: ['#C99A00', '#FFF1B8'], pink: ['#E0788A', '#FBE1E4'], peach: ['#D9824B', '#FFE4D1'] };
  const BAND = { strong: { label: 'Strong', fill: '#B9E3CB', line: '#1E5B3E', tone: 'sage' }, okay: { label: 'Okay', fill: '#FFE58A', line: '#6B4F00', tone: 'butter' }, revise: { label: 'Revise', fill: '#F6C1C9', line: '#8A2E3E', tone: 'pink' } };
  const ACTIVITY = { quiz_submitted: ['Quizzes', '#18181B'], lecture_viewed: ['Lectures read', '#8B78D6'], chat_message: ['AI Tutor', '#5B93D3'], lecture_uploaded: ['Uploads', '#4FA67A'], notes_generated: ['Notes', '#E3B21B'] };
  let courses = [];
  const charts = [];

  /** Range → ISO from/to. Term: Jan–Apr (Winter), May–Aug (Summer), Sep–Dec (Fall). */
  function rangeDates(r) {
    const now = new Date();
    let from;
    if (r === '7d') from = new Date(now.getTime() - 6 * 86400000);
    else if (r === '30d') from = new Date(now.getTime() - 29 * 86400000);
    else from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 4) * 4, 1);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  /* ---- Layout ------------------------------------------------------------------ */
  function shell() {
    root.innerHTML = `
      ${T.ui.pageHeader({ eyebrow: 'Workspace', title: 'My Progress', subtitle: 'How your quiz results, course coverage and study habits are trending.' })}
      <form class="tai-toolbar" data-filters aria-label="Filter analytics">
        <label class="visually-hidden" for="pf-course">Course</label>
        <select id="pf-course" name="course" class="form-select"><option value="">All courses</option>${courses.map(c => `<option value="${escape(c.id)}"${c.id === state.course ? ' selected' : ''}>${escape(c.code)} — ${escape(c.title)}</option>`).join('')}</select>
        <div class="tai-segmented" data-segmented role="group" aria-label="Date range">
          ${Object.entries(RANGES).map(([v, l]) => `<button type="button" class="tai-segmented__item${v === state.range ? ' active' : ''}" data-value="${v}" aria-pressed="${v === state.range}">${l}</button>`).join('')}
        </div>
      </form>
      <div data-body></div>`;
    T.ui.enhance(root);
  }

  const chartCard = (id, title, sub, cls = 'col-xl-6') => `
    <div class="${cls}">
      <section class="tai-card h-100 pg-chart" aria-labelledby="${id}-title">
        <div class="tai-card__header">
          <div><h2 class="tai-card__title" id="${id}-title">${escape(title)}</h2><p class="tai-card__subtitle">${escape(sub)}</p></div>
          <button type="button" class="btn btn-ghost btn-sm" data-table-toggle="${id}" aria-expanded="false" aria-controls="${id}-table" hidden>${T.ui.icon('table')}<span>Show data</span></button>
        </div>
        <div class="pg-chart__box" data-chart="${id}"></div>
        <div class="pg-chart__table" id="${id}-table" hidden></div>
      </section>
    </div>`;

  function emptyChart(id, text) {
    const box = $(`[data-chart="${id}"]`, root);
    box.classList.add('is-empty');
    box.innerHTML = T.ui.emptyState({ icon: 'chart-no-axes-column', compact: true, title: 'No data yet', text });
    T.ui.icons(box);
  }

  function table(id, caption, headers, rows) {
    const el = document.getElementById(`${id}-table`);
    el.innerHTML = `<div class="tai-table-wrap"><table class="table tai-table"><caption class="visually-hidden">${escape(caption)}</caption>
      <thead><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${escape(c)}</th>` : `<td>${escape(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
    $(`[data-table-toggle="${id}"]`, root).hidden = false;
  }

  function canvas(id, label) {
    const box = $(`[data-chart="${id}"]`, root);
    box.classList.remove('is-empty');
    box.innerHTML = `<canvas role="img" aria-label="${escape(label)}"></canvas>`;
    return box.firstElementChild;
  }

  /* ---- Charts ------------------------------------------------------------------ */
  function drawPerformance(series) {
    if (!series.length) return emptyChart('perf', 'Submit a quiz in this range and your scores will be plotted here.');
    const dayKey = (iso) => iso.slice(0, 10);
    const days = [...new Set(series.flatMap(s => s.points.map(p => dayKey(p.date))))].sort();
    const label = (d) => formatDate(`${d}T12:00:00`, { month: 'short', day: 'numeric' });
    const lookup = {};
    charts.push(new Chart(canvas('perf', 'Line chart of quiz scores over time by course'), {
      type: 'line',
      data: {
        labels: days.map(label),
        datasets: series.map(s => {
          const [line, fill] = PASTEL[s.color] || PASTEL.lavender;
          const byDay = {};
          s.points.forEach(p => { (byDay[dayKey(p.date)] = byDay[dayKey(p.date)] || []).push(p); });
          lookup[s.code] = byDay;
          return {
            label: s.code, borderColor: line, backgroundColor: fill, pointBackgroundColor: line, pointRadius: 4, pointHoverRadius: 6, spanGaps: true, tension: 0.3,
            data: days.map(d => (byDay[d] ? Math.round(byDay[d].reduce((a, p) => a + p.percent, 0) / byDay[d].length) : null))
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, ticks: { callback: v => `${v}%`, stepSize: 25 } }, x: { grid: { display: false } } },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => { const pts = lookup[ctx.dataset.label][days[ctx.dataIndex]] || []; return `${ctx.dataset.label}: ${ctx.raw}%${pts.length ? ` — ${pts.map(p => p.quizTitle).join(', ')}` : ''}`; } } }
        }
      }
    }));
    table('perf', 'Quiz scores over time', ['Date', 'Course', 'Quiz', 'Score'],
      series.flatMap(s => s.points.map(p => [formatDate(p.date), s.code, p.quizTitle, `${p.percent}%`])).sort((a, b) => new Date(a[0]) - new Date(b[0])));
  }

  function drawCourses(rows) {
    const withData = rows.filter(r => r.attempts > 0 || r.progress > 0);
    if (!withData.length) return emptyChart('courses', 'Quiz results in this range will show each course’s progress and mastery.');
    charts.push(new Chart(canvas('courses', 'Bar chart comparing mastery and progress per course'), {
      type: 'bar',
      data: {
        labels: withData.map(r => r.code),
        datasets: [
          { label: 'Mastery', data: withData.map(r => r.mastery ?? 0), backgroundColor: withData.map(r => (PASTEL[r.color] || PASTEL.lavender)[1]), borderColor: C.ink, borderWidth: 1.5, borderRadius: 8 },
          { label: 'Progress', data: withData.map(r => r.progress), backgroundColor: C.ink, borderRadius: 8 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, ticks: { callback: v => `${v}%` } }, x: { grid: { display: false } } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.label === 'Mastery' && withData[ctx.dataIndex].mastery == null ? '—' : `${ctx.raw}%`}` } } }
      }
    }));
    table('courses', 'Course progress and mastery', ['Course', 'Progress', 'Mastery', 'Attempts'], withData.map(r => [r.code, `${r.progress}%`, r.mastery == null ? '—' : `${r.mastery}%`, String(r.attempts)]));
  }

  function drawTopics(topics) {
    if (!topics.length) return emptyChart('topics', 'Topics appear here once you’ve answered quiz questions on them.');
    const sorted = topics.slice().sort((a, b) => b.average - a.average);
    const box = $('[data-chart="topics"]', root);
    box.style.height = `${Math.max(220, sorted.length * (state.course ? 34 : 46) + 70)}px`;
    charts.push(new Chart(canvas('topics', 'Horizontal bar chart of topic averages, strongest first'), {
      type: 'bar',
      data: {
        labels: sorted.map(t => (state.course ? t.topic : `${t.topic} (${t.code})`)),
        datasets: [{ label: 'Topic average', data: sorted.map(t => t.average), backgroundColor: sorted.map(t => BAND[t.band].fill), borderColor: sorted.map(t => BAND[t.band].line), borderWidth: 1.5, borderRadius: 6 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
          x: { min: 0, max: 100, ticks: { callback: v => `${v}%` } },
          // Long topic names are shortened on the axis (full name in the tooltip and data table)
          // Topic on line 1, course on line 2; long topics shortened (full name in tooltip and data table)
          y: { grid: { display: false }, ticks: { callback(v) {
            const t = sorted[v]; const max = this.chart.width < 520 ? 18 : 28;
            const name = t.topic.length > max ? `${t.topic.slice(0, max - 1).trimEnd()}…` : t.topic;
            return state.course ? name : [name, t.code];
          } } }
        },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { generateLabels: () => Object.values(BAND).map(b => ({ text: `${b.label}${b === BAND.strong ? ' ≥ 80' : b === BAND.okay ? ' 65–79' : ' < 65'}`, fillStyle: b.fill, strokeStyle: b.line, lineWidth: 1.5 })) } },
          tooltip: { callbacks: { label: (ctx) => { const t = sorted[ctx.dataIndex]; return `${t.average}% average · ${t.attempts} attempt${t.attempts === 1 ? '' : 's'} · ${BAND[t.band].label}`; } } }
        }
      }
    }));
    table('topics', 'Topic averages', ['Topic', 'Course', 'Average', 'Best', 'Attempts', 'Band'], sorted.map(t => [t.topic, t.code, `${t.average}%`, `${t.best}%`, String(t.attempts), BAND[t.band].label]));
  }

  function drawActivity(act) {
    const total = act.days.reduce((s, d) => s + d.total, 0);
    if (!total) return emptyChart('activity', 'Reading lectures, chatting with the AI Tutor and taking quizzes all count here.');
    const types = act.types.filter(t => act.days.some(d => d.byType[t]));
    charts.push(new Chart(canvas('activity', 'Stacked bar chart of study activity per day'), {
      type: 'bar',
      data: {
        labels: act.days.map(d => formatDate(`${d.date}T12:00:00`, { month: 'short', day: 'numeric' })),
        datasets: types.map(t => ({ label: ACTIVITY[t][0], data: act.days.map(d => d.byType[t]), backgroundColor: ACTIVITY[t][1], borderRadius: 3, stack: 'a' }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { position: 'bottom' } }
      }
    }));
    table('activity', 'Study activity per day', ['Date', 'Total', ...types.map(t => ACTIVITY[t][0])], act.days.filter(d => d.total).map(d => [d.date, String(d.total), ...types.map(t => String(d.byType[t]))]));
  }

  /* ---- Lists ------------------------------------------------------------------- */
  function reviseList(topics) {
    const revise = topics.filter(t => t.band === 'revise').sort((a, b) => a.average - b.average);
    if (!revise.length) return T.ui.emptyState({ icon: 'trophy', tone: 'sage', compact: true, title: topics.length ? 'Nothing to revise' : 'No quiz results yet', text: topics.length ? 'Every topic in this range is at 65% or more.' : 'Take a quiz and topics under 65% will be listed here.' });
    return `<ul class="tai-row-list">${revise.map(t => `
      <li class="tai-row">
        <div class="tai-row__main">
          <span class="tai-row__eyebrow">${escape(t.code)}</span>
          <p class="tai-row__title">${escape(t.topic)}</p>
          <p class="tai-row__meta">Average ${t.average}% over ${t.attempts} attempt${t.attempts === 1 ? '' : 's'}${t.scores.length > 1 ? ` (${t.scores.map(s => `${s}%`).join(' → ')})` : ''}</p>
        </div>
        <div class="tai-row__side">
          <span class="tai-badge tai-badge--pink">${t.average}%</span>
          <button type="button" class="btn btn-soft btn-sm" data-practise="${escape(t.courseId)}" data-topic="${escape(t.topic)}">${T.ui.icon('wand-sparkles')}<span>Practise</span></button>
          <a class="btn btn-secondary btn-sm" href="${escape(url(`pages/student/ai-tutor.html?course=${encodeURIComponent(t.courseId)}&q=${encodeURIComponent(`Help me review ${t.topic} — my quiz average is ${t.average}%`)}`))}">${T.ui.icon('sparkles')}<span>Ask AI</span></a>
        </div>
      </li>`).join('')}</ul>`;
  }

  function attemptsTable(list) {
    if (!list.length) return T.ui.emptyState({ icon: 'list-checks', compact: true, title: 'No attempts in this range', text: 'Your submitted quizzes will be listed here.', actions: [{ label: 'Go to Quizzes', variant: 'secondary', href: url('pages/student/quizzes.html') }] });
    return `<div class="tai-table-wrap"><table class="table tai-table">
      <caption class="visually-hidden">Recent quiz attempts</caption>
      <thead><tr><th scope="col">Quiz</th><th scope="col">Course</th><th scope="col">Date</th><th scope="col">Score</th><th scope="col"><span class="visually-hidden">Results</span></th></tr></thead>
      <tbody>${list.map(a => `<tr>
        <th scope="row" class="fw-medium">${escape(a.quizTitle)}</th>
        <td>${escape(a.course ? a.course.code : '')}</td>
        <td>${escape(formatDate(a.submittedAt))}</td>
        <td><span class="tai-badge tai-badge--${UI.scoreTone(a.percent)}">${a.percent}%</span> <span class="tai-muted">${Number.isInteger(a.score) ? a.score : a.score.toFixed(1)}/${a.total}</span></td>
        <td class="text-end"><a class="btn btn-ghost btn-sm" href="${escape(url(`pages/student/quiz-results.html?attempt=${encodeURIComponent(a.id)}`))}">Results</a></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  /* ---- Render ------------------------------------------------------------------ */
  async function render() {
    charts.splice(0).forEach(c => c.destroy());
    const body = $('[data-body]', root);
    body.innerHTML = `<div class="tai-bento mb-4">${'<div class="span-3"><span class="tai-skeleton tai-skeleton--block" style="border-radius:26px"></span></div>'.repeat(4)}</div>`;
    const f = { ...(state.course ? { courseId: state.course } : {}), ...rangeDates(state.range) };
    let summary, perf, byCourse, topics, act, recent;
    try {
      [summary, perf, byCourse, topics, act, recent] = await Promise.all([
        T.api.analytics.summary(f), T.api.analytics.performanceOverTime(f), T.api.analytics.byCourse(f),
        T.api.analytics.byTopic(f), T.api.analytics.activity(f), T.api.attempts.list({ status: 'submitted', courseId: state.course || null, limit: 50 })
      ]);
    } catch (err) {
      body.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your analytics', text: err.message })}</div>`;
      T.ui.icons(body);
      return;
    }
    recent = recent.filter(a => a.submittedAt >= f.from).slice(0, 8);
    const tile = (tone, icon, label, value, suffix, meta) => `
      <div class="tai-tile tai-tile--${tone} span-3">
        <span class="tai-tile__label">${T.ui.icon(icon)}${escape(label)}</span>
        <div class="tai-tile__value"${value == null ? '>—' : ` data-count-to="${value}" data-count-suffix="${suffix}">0${suffix}`}</div>
        <p class="tai-tile__meta">${escape(meta)}</p>
      </div>`;
    const rangeLabel = RANGES[state.range].toLowerCase();
    body.innerHTML = `
      <div class="tai-bento mb-4">
        ${tile('peach', 'percent', 'Overall average', summary.averageScore, '%', summary.averageScore == null ? `No quizzes ${rangeLabel}` : `Across ${summary.quizzesCompleted} attempt${summary.quizzesCompleted === 1 ? '' : 's'}`)}
        ${tile('sage', 'list-checks', 'Quizzes completed', summary.quizzesCompleted, '', `${RANGES[state.range]}${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}`)}
        ${tile('powder', 'book-open', 'Courses studied', summary.coursesStudied, '', 'With quizzes or study activity')}
        ${tile(summary.topicsToRevise ? 'pink' : 'lavender', 'target', 'Topics to revise', summary.topicsToRevise, '', 'Topics averaging under 65%')}
      </div>
      <div class="row g-4 mb-4">
        ${chartCard('perf', 'Quiz performance over time', 'Score per quiz day, one line per course')}
        ${chartCard('courses', 'Course performance', 'Mastery vs progress (lectures covered)')}
        ${chartCard('topics', 'Topic strengths and weaknesses', 'Average per topic · strong ≥ 80 · okay 65–79 · revise < 65')}
        ${chartCard('activity', 'Study activity', 'Quizzes, lectures read, AI Tutor and uploads per day')}
      </div>
      <div class="row g-4">
        <div class="col-xl-5"><section class="tai-card h-100" aria-labelledby="revise-title"><div class="tai-card__header"><div><h2 class="tai-card__title" id="revise-title">Topics to revise</h2><p class="tai-card__subtitle">Under 65% ${escape(rangeLabel)}</p></div></div>${reviseList(topics)}</section></div>
        <div class="col-xl-7"><section class="tai-card h-100" aria-labelledby="recent-title"><div class="tai-card__header"><div><h2 class="tai-card__title" id="recent-title">Recent attempts</h2><p class="tai-card__subtitle">${escape(RANGES[state.range])}</p></div></div>${attemptsTable(recent)}</section></div>
      </div>`;
    T.ui.enhance(body);
    if (!window.Chart) {
      ['perf', 'courses', 'topics', 'activity'].forEach(id => emptyChart(id, 'Charts couldn’t load (offline?). Use the tables below each card.'));
    } else {
      drawPerformance(perf); drawCourses(byCourse); drawTopics(topics); drawActivity(act);
    }
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.course) p.set('course', state.course);
    if (state.range !== '30d') p.set('range', state.range);
    history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
  }

  /* ---- Events ------------------------------------------------------------------ */
  root.addEventListener('change', (e) => {
    if (e.target.name !== 'course') return;
    state.course = e.target.value; syncUrl(); render();
  });
  root.addEventListener('tai:segment', (e) => {
    state.range = RANGES[e.detail.value] ? e.detail.value : '30d';
    $$('[data-segmented] .tai-segmented__item', root).forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.value === state.range)); b.removeAttribute('aria-selected'); });
    syncUrl(); render();
  });
  root.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-table-toggle]');
    if (tg) {
      const el = document.getElementById(`${tg.dataset.tableToggle}-table`);
      const open = el.hidden;
      el.hidden = !open;
      tg.setAttribute('aria-expanded', String(open));
      tg.querySelector('span').textContent = open ? 'Hide data' : 'Show data';
      return;
    }
    const p = e.target.closest('[data-practise]');
    if (p) {
      T.ui.setButtonLoading(p, true);
      try {
        const draft = await T.api.quizzes.generate({ courseId: p.dataset.practise, source: 'weak-topics', topics: [p.dataset.topic], count: 10, difficulty: 'medium', types: ['mcq', 'multi', 'true_false'], explanations: true });
        window.location.href = url(`pages/student/quiz-create.html?draft=${encodeURIComponent(draft.id)}`);
      } catch (err) {
        T.ui.setButtonLoading(p, false);
        T.ui.toast({ title: 'Couldn’t make a practice quiz', message: err.message, variant: 'danger' });
      }
    }
  });

  /* ---- Boot -------------------------------------------------------------------- */
  try { courses = await T.api.courses.list(); } catch (e) { courses = []; }
  if (state.course && !courses.some(c => c.id === state.course)) state.course = '';
  shell();
  syncUrl();
  render();
});
