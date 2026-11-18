/**
 * TutorAI — Student dashboard (pages/student/dashboard.html)
 * One call: TutorAI.api.dashboard.summary()  (GET /api/dashboard/summary)
 * Every tile, row and button links to a real page or tab.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const { escape, url, timeAgo } = T.utils;
  const UI = T.components.CourseUI;
  const main = document.getElementById('page-content');

  const ACTIVITY_META = {
    course_created:   { icon: 'folder-plus',  tone: 'butter' },
    course_updated:   { icon: 'pencil',       tone: 'powder' },
    course_deleted:   { icon: 'trash-2',      tone: 'pink' },
    lecture_uploaded: { icon: 'file-up',      tone: 'lavender' },
    lecture_failed:   { icon: 'circle-alert', tone: 'pink' },
    lecture_deleted:  { icon: 'file-x',       tone: 'pink' },
    quiz_completed:   { icon: 'list-checks',  tone: 'sage' },
    quiz_submitted:   { icon: 'list-checks',  tone: 'sage' },
    quiz_generated:   { icon: 'wand-sparkles', tone: 'lavender' },
    quiz_created:     { icon: 'wand-sparkles', tone: 'lavender' },
    notes_generated:  { icon: 'notebook-pen', tone: 'powder' }
  };

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function heroTile(s) {
    const date = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
    const topics = s.weakTopics.length;
    const parts = [];
    if (s.nextQuiz) parts.push(`a quiz waiting in ${escape(s.nextQuiz.course.code)}`);
    if (topics) parts.push(`${topics} topic${topics === 1 ? '' : 's'} worth revising`);
    const lead = s.stats.courses
      ? (parts.length ? `You have ${parts.join(' and ')}.` : 'You’re all caught up. Upload a lecture to keep going.')
      : 'Add your first course to start building your study space.';
    return `
      <section class="tai-tile tai-tile--lavender span-8 dash-hero" aria-labelledby="dash-greeting">
        <div class="tai-hero__meta">
          <span class="tai-chip">${T.ui.icon('calendar')}${escape(date)}</span>
          ${goalChip(s.weeklyGoal)}
        </div>
        <h1 class="tai-hero__title" id="dash-greeting">${greeting()}, <em>${escape(s.user.firstName)}</em>.</h1>
        <p class="dash-hero__lead">${lead}</p>
        <span class="tai-tile__deco">${T.ui.icon('sparkles')}</span>
      </section>`;
  }

  /** Weekly goal (Settings → Weekly study goal): "2 of 4 study days" with a dot per goal day. */
  function goalChip(g) {
    if (!g) return '';
    const done = Math.min(g.studiedDays, g.goalDays);
    const met = g.studiedDays >= g.goalDays;
    const dots = Array.from({ length: g.goalDays }, (_, i) => `<span class="dash-goal__dot${i < done ? ' is-done' : ''}"></span>`).join('');
    return `
      <a class="tai-chip dash-goal text-reset" href="${escape(url('pages/student/settings.html#goal'))}"
         aria-label="Weekly goal: ${g.studiedDays} of ${g.goalDays} study days this week${met ? ', reached' : ''}. Change goal">
        ${T.ui.icon(met ? 'circle-check' : 'target')}<span aria-hidden="true">${Math.min(g.studiedDays, 7)}/${g.goalDays} days this week</span>
        <span class="dash-goal__dots" aria-hidden="true">${dots}</span>
      </a>`;
  }

  function continueTile(course) {
    if (!course) {
      return `
        <a class="tai-tile tai-tile--dark tai-tile--interactive span-4 dash-continue" href="${escape(url('pages/student/courses.html?new=1'))}">
          <div class="tai-tile__top"><span class="tai-tile__label">${T.ui.icon('play')}Continue learning</span><span class="tai-tile__arrow">${T.ui.icon('arrow-up-right')}</span></div>
          <h2 class="tai-tile__title">Add your first course</h2>
          <p class="tai-tile__meta">Then upload a lecture to start studying with TutorAI.</p>
          <span class="tai-tile__deco">${T.ui.icon('plus')}</span>
        </a>`;
    }
    return `
      <a class="tai-tile tai-tile--dark tai-tile--interactive span-4 dash-continue" href="${escape(UI.courseUrl(course.id))}">
        <div class="tai-tile__top"><span class="tai-tile__label">${T.ui.icon('play')}Continue learning</span><span class="tai-tile__arrow">${T.ui.icon('arrow-up-right')}</span></div>
        <span class="tai-chip mt-4 align-self-start">${escape(course.code)}</span>
        <h2 class="tai-tile__title mt-2">${escape(course.title)}</h2>
        <p class="tai-tile__meta mb-3">${course.lectureCount} lecture${course.lectureCount === 1 ? '' : 's'} · opened ${escape(timeAgo(course.lastAccessedAt).toLowerCase())}</p>
        <div class="d-flex align-items-center gap-3">
          <div class="tai-meter flex-grow-1" role="presentation"><span data-meter="${course.progress}"></span></div>
          <span class="fw-semibold text-white">${course.progress}%</span>
        </div>
        <p class="tai-tile__meta mt-2 mb-0">${escape(UI.coverageText(course))}${course.mastery === null ? '' : ` · mastery ${course.mastery}%`}</p>
        <span class="tai-tile__deco">${T.ui.icon(UI.iconFor(course))}</span>
      </a>`;
  }

  function statTile({ label, icon, value, suffix = '', tone, href, meta }) {
    return `
      <a class="tai-tile tai-tile--${tone} tai-tile--interactive span-3 dash-stat" href="${escape(href)}">
        <div class="tai-tile__top"><span class="tai-tile__label">${T.ui.icon(icon)}${escape(label)}</span><span class="tai-tile__arrow">${T.ui.icon('arrow-up-right')}</span></div>
        <div class="tai-tile__value" ${value === null ? '' : `data-count-to="${value}" data-count-suffix="${suffix}"`}>${value === null ? '—' : `0${suffix}`}</div>
        <p class="tai-tile__meta">${escape(meta)}</p>
      </a>`;
  }

  function activityList(items) {
    if (!items.length) {
      return T.ui.emptyState({ icon: 'activity', title: 'No activity yet', text: 'Add a course or upload a lecture and it will show up here.', compact: true });
    }
    return `<ul class="tai-row-list">${items.map(a => {
      const m = ACTIVITY_META[a.type] || { icon: 'circle', tone: 'powder' };
      const title = escape(a.title);
      return `
        <li class="tai-row">
          <span class="tai-icon-tile tai-icon-tile--${m.tone}">${T.ui.icon(m.icon)}</span>
          <div class="tai-row__main">
            <p class="tai-row__title">${a.link ? `<a href="${escape(url(a.link))}">${title}</a>` : title}</p>
            <p class="tai-row__meta">${a.course ? `${escape(a.course.code)} · ` : ''}${escape(timeAgo(a.createdAt))}</p>
          </div>
        </li>`;
    }).join('')}</ul>`;
  }

  function revisionList(topics, hasQuizzes) {
    if (!topics.length) {
      return T.ui.emptyState({
        icon: 'trophy', tone: 'sage', compact: true,
        title: hasQuizzes ? 'Nothing to revise' : 'No quiz results yet',
        text: hasQuizzes ? 'Every topic you’ve been quizzed on is at 65% or more.' : 'Take a practice quiz and weak topics will show up here.'
      });
    }
    return `<ul class="tai-row-list">${topics.map(t => `
      <li class="tai-row">
        <div class="tai-row__main">
          <span class="tai-row__eyebrow">${escape(t.course.code)}</span>
          <p class="tai-row__title"><a href="${escape(UI.courseUrl(t.course.id, 'progress'))}">${escape(t.topic)}</a></p>
          <p class="tai-row__meta">${t.attempts} attempt${t.attempts === 1 ? '' : 's'} · average ${t.averageScore}%</p>
        </div>
        <div class="tai-row__side">
          ${UI.scoreBadge(t.averageScore)}
          <a class="btn btn-soft btn-sm" href="${escape(url(`pages/student/ai-tutor.html?course=${encodeURIComponent(t.course.id)}&topic=${encodeURIComponent(t.topic)}`))}" aria-label="Revise ${escape(t.topic)} with the AI Tutor">${T.ui.icon('sparkles')}<span>Revise</span></a>
        </div>
      </li>`).join('')}</ul>`;
  }

  function quickActions(s) {
    const c = s.continueCourse;
    const quizHref = s.nextQuiz ? url(`pages/student/quiz-attempt.html?id=${encodeURIComponent(s.nextQuiz.id)}`) : url('pages/student/quiz-create.html');
    const actions = [
      { label: 'Add course',     icon: 'folder-plus', tone: 'butter',   href: url('pages/student/courses.html?new=1') },
      { label: 'Upload lecture', icon: 'upload',      tone: 'powder',   href: UI.uploadUrl(c ? c.id : '') },
      { label: 'Ask AI Tutor',   icon: 'sparkles',    tone: 'lavender', href: url(`pages/student/ai-tutor.html${c ? `?course=${encodeURIComponent(c.id)}` : ''}`) },
      { label: s.nextQuiz ? (s.nextQuiz.status === 'in_progress' ? 'Resume quiz' : 'Take a quiz') : 'Create a quiz', icon: 'list-checks', tone: 'sage', href: quizHref }
    ];
    return `<div class="dash-actions">${actions.map(a => `
      <a class="dash-action" href="${escape(a.href)}">
        <span class="tai-icon-tile tai-icon-tile--${a.tone}">${T.ui.icon(a.icon)}</span>
        <span>${escape(a.label)}</span>
      </a>`).join('')}</div>`;
  }

  function render(s) {
    const st = s.stats;
    const courses = s.recentCourses.length
      ? `<div class="row g-4">${s.recentCourses.map(c => `<div class="col-md-6 col-xl-4">${T.components.CourseCard.render(c)}</div>`).join('')}</div>`
      : `<div class="tai-card">${T.ui.emptyState({ icon: 'book-open', title: 'No courses yet', text: 'Add a course to organise its lectures, quizzes and progress.', actions: [{ label: 'Add course', icon: 'plus', href: url('pages/student/courses.html?new=1') }] })}</div>`;

    main.innerHTML = `
      <h1 class="visually-hidden">Dashboard</h1>
      <div class="tai-bento mb-4">
        ${heroTile(s)}
        ${continueTile(s.continueCourse)}
        ${statTile({ label: 'Courses', icon: 'book-open', value: st.courses, tone: 'powder', href: url('pages/student/courses.html?status=active'), meta: st.archivedCourses ? `Active · ${st.archivedCourses} archived` : 'Active this term' })}
        ${statTile({ label: 'Lectures uploaded', icon: 'file-text', value: st.lectures, tone: 'butter', href: s.continueCourse ? UI.courseUrl(s.continueCourse.id, 'lectures') : url('pages/student/courses.html'), meta: `${st.readyLectures} ready for the AI Tutor` })}
        ${statTile({ label: 'Quizzes completed', icon: 'list-checks', value: st.quizzesCompleted, tone: 'sage', href: url('pages/student/quizzes.html'), meta: st.quizzesWaiting ? `${st.quizzesWaiting} waiting to start` : 'None waiting' })}
        ${statTile({ label: 'Average score', icon: 'target', value: st.averageScore, suffix: '%', tone: 'peach', href: url('pages/student/progress.html'), meta: st.averageScore === null ? 'No quizzes yet' : 'Across all quizzes' })}
      </div>

      <section class="tai-section" aria-labelledby="dash-courses-title">
        <div class="tai-section__header">
          <h2 class="tai-section__title" id="dash-courses-title">Your courses</h2>
          <a class="btn btn-link btn-sm" href="${escape(url('pages/student/courses.html'))}">View all${T.ui.icon('arrow-right')}</a>
        </div>
        ${courses}
      </section>

      <div class="row g-4">
        <div class="col-lg-7">
          <section class="tai-card h-100" aria-labelledby="dash-activity-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="dash-activity-title">Recent activity</h2><p class="tai-card__subtitle">Your latest uploads, quizzes and course changes</p></div></div>
            ${activityList(s.recentActivity)}
          </section>
        </div>
        <div class="col-lg-5 d-flex flex-column gap-4">
          <section class="tai-card" aria-labelledby="dash-revision-title">
            <div class="tai-card__header"><div><h2 class="tai-card__title" id="dash-revision-title">Recommended revision</h2><p class="tai-card__subtitle">Topics averaging under 65% in your quizzes</p></div><span class="tai-icon-tile tai-icon-tile--pink" aria-hidden="true">${T.ui.icon('target')}</span></div>
            ${revisionList(s.weakTopics, st.quizzesCompleted > 0)}
          </section>
          <section class="tai-card" aria-labelledby="dash-actions-title">
            <div class="tai-card__header"><h2 class="tai-card__title" id="dash-actions-title">Quick actions</h2></div>
            ${quickActions(s)}
          </section>
        </div>
      </div>`;
    main.removeAttribute('aria-busy');
    T.ui.enhance(main);
  }

  try {
    render(await T.api.dashboard.summary());
  } catch (err) {
    main.removeAttribute('aria-busy');
    main.innerHTML = `<div class="tai-card">${T.ui.emptyState({
      icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your dashboard', text: err.message,
      actions: [{ label: 'Try again', icon: 'refresh-cw', attrs: 'data-action="reload"' }]
    })}</div>`;
    T.ui.icons(main);
    main.querySelector('[data-action="reload"]').addEventListener('click', () => window.location.reload());
  }
});
