/**
 * TutorAI — course UI pieces shared by the dashboard, My Courses,
 * the course workspace and the upload page.
 *
 *   TutorAI.components.CourseCard.render(course, { menu: true })
 *   TutorAI.components.CourseUI.lectureStatus(status)   → badge HTML
 *   TutorAI.components.CourseUI.scoreBadge(score)       → badge HTML
 *   TutorAI.components.CourseUI.courseUrl(id, tab)      → URL string
 */
(function (T) {
  'use strict';

  const { escape, url, timeAgo, formatFileSize } = T.utils;
  T.components = T.components || {};

  const COLORS = ['lavender', 'powder', 'sage', 'butter', 'pink', 'peach'];
  const COLOR_LABELS = { lavender: 'Lavender', powder: 'Powder blue', sage: 'Mint', butter: 'Butter', pink: 'Pink', peach: 'Peach' };

  /** Pick a decorative icon from the course title or subject code. */
  function iconFor(course) {
    const text = `${course.title || ''}`.toLowerCase();
    const rules = [
      [/database|sql|data model/, 'database'],
      [/machine learning|neural|\bai\b|intelligence/, 'brain'],
      [/statistic|probab|calculus|algebra|math/, 'sigma'],
      [/web|programming|software|code|design/, 'code'],
      [/chem/, 'flask-conical'], [/bio|genetic/, 'dna'], [/physic/, 'atom'],
      [/history|politic|law/, 'landmark'], [/business|econom|account/, 'briefcase'],
      [/language|english|writing|literature/, 'languages'], [/art|music/, 'palette']
    ];
    for (const [re, icon] of rules) if (re.test(text)) return icon;
    const prefix = String(course.code || '').split(/\s+/)[0].toUpperCase();
    return { COMP: 'code', CPSC: 'code', STAT: 'sigma', MATH: 'sigma', CHEM: 'flask-conical', BIOL: 'dna', PHYS: 'atom' }[prefix] || 'book-open';
  }

  const coverStyle = (color) => {
    const c = COLORS.includes(color) ? color : 'lavender';
    return `--cover:var(--tai-${c});--cover-ink:var(--tai-${c}-ink)`;
  };

  const courseUrl = (id, tab, extra = {}) => {
    const params = new URLSearchParams({ id, ...(tab ? { tab } : {}), ...extra });
    return url(`pages/student/course.html?${params}`);
  };
  const uploadUrl = (id) => url(`pages/student/course-upload.html${id ? `?id=${encodeURIComponent(id)}` : ''}`);

  const LECTURE_STATUS = {
    uploading:  { label: 'Uploading',       tone: 'powder',   icon: 'upload' },
    extracting: { label: 'Extracting text', tone: 'butter',   icon: 'scan-text' },
    processing: { label: 'Processing',      tone: 'lavender', icon: 'loader' },
    ready:      { label: 'Ready',           tone: 'sage',     icon: 'circle-check' },
    failed:     { label: 'Failed',          tone: 'pink',     icon: 'circle-alert' }
  };

  const scoreTone = (score) => (score == null ? 'outline' : score >= 80 ? 'sage' : score >= 65 ? 'butter' : 'pink');

  T.components.CourseUI = {
    COLORS, COLOR_LABELS, LECTURE_STATUS, iconFor, coverStyle, courseUrl, uploadUrl, scoreTone,

    lectureStatus(status) {
      const s = LECTURE_STATUS[status] || LECTURE_STATUS.processing;
      const busy = ['uploading', 'extracting', 'processing'].includes(status);
      return `<span class="tai-badge tai-badge--${s.tone}${busy ? ' is-busy' : ''}">${T.ui.icon(s.icon)}${escape(s.label)}</span>`;
    },

    scoreBadge(score) {
      return score == null
        ? `<span class="tai-badge tai-badge--outline">Not started</span>`
        : `<span class="tai-badge tai-badge--${scoreTone(score)}">${Math.round(score)}%</span>`;
    },

    /** "Mastery 77%" badge, toned by score; muted when nothing has been attempted. */
    masteryBadge(mastery, { label = 'Mastery' } = {}) {
      return mastery == null
        ? `<span class="tai-badge tai-badge--outline" title="No quizzes attempted yet">${escape(label)} —</span>`
        : `<span class="tai-badge tai-badge--${scoreTone(mastery)}" title="Average best quiz score across attempted lectures">${escape(label)} ${Math.round(mastery)}%</span>`;
    },

    /** "3 of 4 lectures quizzed" — what the progress (coverage) number means. */
    coverageText(course) {
      const ready = course.readyLectureCount || 0;
      if (!ready) return 'No ready lectures yet';
      return `${course.attemptedLectureCount || 0} of ${ready} lecture${ready === 1 ? '' : 's'} quizzed`;
    },

    lectureLabel(lecture) {
      return lecture.lectureNumber ? `Lecture ${lecture.lectureNumber}` : 'Lecture';
    },

    lectureMeta(lecture) {
      return [
        lecture.fileName,
        lecture.fileSizeKb ? formatFileSize(lecture.fileSizeKb) : '',
        lecture.pageCount ? `${lecture.pageCount} pages` : ''
      ].filter(Boolean).join(' · ');
    }
  };

  T.components.CourseCard = {
    /**
     * Course card with a pastel cover. The title link stretches over the
     * card; the optional menu (Open / Edit / Delete) sits above it and
     * fires data-course-action buttons for the page to handle.
     */
    render(course, { menu = false, headingLevel = 3 } = {}) {
      const id = escape(course.id);
      const h = `h${headingLevel}`;
      const lectures = course.lectureCount || 0;
      const opened = course.lastAccessedAt ? `Opened ${timeAgo(course.lastAccessedAt).toLowerCase()}` : 'Not opened yet';
      const archived = course.status === 'archived';
      return `
        <article class="tai-course-card h-100${archived ? ' is-archived' : ''}" style="${coverStyle(course.color)}" data-course-id="${id}">
          <div class="tai-course-card__cover">
            <span class="tai-chip">${T.ui.icon('file-text')}${lectures} lecture${lectures === 1 ? '' : 's'}</span>
            ${menu ? '' : `<span class="tai-tile__arrow" aria-hidden="true">${T.ui.icon('arrow-up-right')}</span>`}
            <span class="tai-tile__deco">${T.ui.icon(iconFor(course))}</span>
          </div>
          ${menu ? `
          <div class="dropdown tai-course-card__menu">
            <button type="button" class="btn btn-icon btn-sm tai-course-card__menu-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Actions for ${escape(course.code)}">
              ${T.ui.icon('ellipsis')}
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="${escape(courseUrl(course.id))}">${T.ui.icon('arrow-up-right')}Open</a></li>
              <li><button type="button" class="dropdown-item" data-course-action="edit" data-id="${id}">${T.ui.icon('pencil')}Edit</button></li>
              <li><a class="dropdown-item" href="${escape(uploadUrl(course.id))}">${T.ui.icon('upload')}Upload lecture</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><button type="button" class="dropdown-item text-danger" data-course-action="delete" data-id="${id}">${T.ui.icon('trash-2')}Delete</button></li>
            </ul>
          </div>` : ''}
          <div class="tai-course-card__body">
            <div>
              <div class="tai-course-card__code">${escape(course.code)}${course.term ? ` · ${escape(course.term)}` : ''}${archived ? ' <span class="tai-badge tai-badge--outline tai-badge--sm ms-1">Archived</span>' : ''}</div>
              <${h} class="tai-course-card__title"><a class="stretched-link" href="${escape(courseUrl(course.id))}">${escape(course.title)}</a></${h}>
              <p class="tai-meta tai-truncate mb-0 mt-1">${escape(course.instructor || 'No instructor added')}</p>
            </div>
            <div class="tai-progress-row">
              <div class="tai-progress-row__head">
                <span class="tai-meta tai-truncate">Progress · ${escape(T.components.CourseUI.coverageText(course))}</span>
                <span class="tai-progress-row__value">${course.progress || 0}%</span>
              </div>
              <div class="progress progress-sm" role="progressbar" aria-label="${escape(course.code)} progress: ${escape(T.components.CourseUI.coverageText(course))}" aria-valuenow="${course.progress || 0}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" data-meter="${course.progress || 0}"></div>
              </div>
            </div>
            <div class="tai-course-card__foot tai-small tai-muted">
              ${T.components.CourseUI.masteryBadge(course.mastery)}
              <span class="tai-truncate">${T.ui.icon('clock', 'icon-xs')} ${escape(opened)}</span>
            </div>
          </div>
        </article>`;
    }
  };
})(window.TutorAI);
