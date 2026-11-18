/**
 * TutorAI — API service layer
 * ------------------------------------------------------------------
 * The single gateway between the UI and data. Every method returns a
 * Promise, whether it is served from mock data or a real backend, so
 * pages never need to change when the backend arrives.
 *
 *   TutorAI.api.courses.list().then(courses => …)
 *
 * Planned endpoints are written beside each method:
 *   PHP + MySQL   →  config.apiBaseUrl  (e.g. GET /api/courses)
 *   FastAPI (AI)  →  config.aiBaseUrl   (e.g. POST /tutor/ask)
 *
 * Error contract (mock and real): rejected promises carry an ApiError
 * with .status and .details. Validation failures use status 422 (or
 * 409 for duplicates) and details.errors = { fieldName: 'message' },
 * keyed by the camelCase JSON field, so forms can show inline errors.
 *
 * Mock store (stage 3)
 *   mock-data.js is SEED data. On first load it is copied into a store
 *   that lives in localStorage under "tai.mockdb.v1", so changes carry
 *   between pages and reloads. Every non-GET call saves the store.
 *   Passwords and auth fixtures are never written to it.
 *   TutorAI.api.dev.resetMockData() restores the seed.
 *
 * AI (stage 4): ai.* calls go to FastAPI (config.aiBaseUrl) in production.
 * In mock mode they use services/mock-ai.js, fed ONLY the selected course's
 * lecture pages; every result is re-checked for course isolation.
 * No API keys live in the frontend — the LLM key stays in FastAPI.
 */
(function (T) {
  'use strict';

  const cfg = T.config;

  /** Error shape every caller can rely on. */
  class ApiError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const nowIso = () => new Date().toISOString();

  /* ======================================================================
     Mock store
     ====================================================================== */
  const STORE_KEY = cfg.storageKeys.mockDb;
  const STORE_VERSION = 1;
  /** Tables every store has had since stage 3. */
  const CORE_TABLES = ['users', 'session', 'courses', 'lectures', 'quizzes', 'activity', 'notifications'];
  /** Stage 4–6 tables — added in place to older stores (see migrate()). */
  const AI_TABLES = ['lectureContent', 'conversations', 'messages', 'summaries', 'notes', 'attempts', 'settings', 'adminActions'];
  const TABLES = [...CORE_TABLES, ...AI_TABLES];
  const fixtures = T.mockData.auth;          // demo password etc. — memory only, never saved

  function seed() {
    // `fresh` → ensureContent() builds quizzes/attempts from the seed plans once helpers exist
    const data = { meta: { version: STORE_VERSION, seededAt: nowIso(), fresh: true, adminSeeded: true, resultsViewedFlag: true } };
    CORE_TABLES.forEach(t => { data[t] = t === 'quizzes' ? [] : clone(T.mockData[t]); });
    AI_TABLES.forEach(t => { data[t] = []; });
    return data;
  }

  /** Remove anything password- or token-like before it touches storage. */
  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce((acc, k) => {
        if (!/password|token|secret|apikey|api_key/i.test(k)) acc[k] = scrub(value[k]);
        return acc;
      }, {});
    }
    return value;
  }

  function isValidStore(data) {
    return data && data.meta && data.meta.version === STORE_VERSION &&
      CORE_TABLES.every(t => t === 'session' ? data[t] && typeof data[t] === 'object' : Array.isArray(data[t]));
  }

  /** Bring an older v1 store up to date without losing the student's data. */
  function migrate(data) {
    let changed = false;
    AI_TABLES.forEach(t => { if (!Array.isArray(data[t])) { data[t] = []; changed = true; } });
    // Stage 6: one { userId } session (was one per shell)
    if (!('userId' in data.session)) { data.session = { userId: data.session.student || null }; changed = true; }
    // Account status is 'active' | 'deactivated' (older stores said 'suspended')
    data.users.forEach(u => { if (u.status === 'suspended') { u.status = 'deactivated'; changed = true; } });
    if (!data.meta.adminSeeded) { addAdminSeed(data); changed = true; }
    // Results celebrate only on a new attempt's first view: older results count as seen
    if (!data.meta.resultsViewedFlag) {
      data.attempts.forEach(a => { if (a.status === 'submitted' && !a.resultsViewedAt) a.resultsViewedAt = a.submittedAt; });
      data.meta.resultsViewedFlag = true; changed = true;
    }
    return changed;
  }

  /**
   * Stores created before the admin console: add the admin account and the
   * other sample students with their courses, lectures and activity. New rows
   * get fresh ids (never reusing a number) and references are remapped.
   */
  function addAdminSeed(data) {
    const seed = T.mockData;
    const seq = (data.meta.sequences = data.meta.sequences || {});
    const fresh = (prefix, table) => {
      const max = table.reduce((m, r) => Math.max(m, parseInt(String(r.id).split('_')[1], 10) || 0), 0);
      seq[prefix] = Math.max(seq[prefix] || 0, max) + 1;
      return `${prefix}_${seq[prefix]}`;
    };
    const demo = seed.demoUserId;
    // Runs while the store loads, before later helpers exist: use only local ones
    const lower = (email) => String(email || '').trim().toLowerCase();
    seed.users.forEach(u => {
      const existing = data.users.find(x => x.id === u.id);
      if (existing && u.role === 'admin') {
        // An older admin record: take the current seed's details, drop its old notifications
        Object.assign(existing, clone(u), { lastLoginAt: existing.lastLoginAt });
        data.notifications = data.notifications.filter(n => n.userId !== u.id);
      } else if (!existing && !data.users.some(x => lower(x.email) === lower(u.email))) {
        data.users.push(clone(u));
      }
    });
    const courseMap = {};
    seed.courses.filter(c => c.userId !== demo && data.users.some(u => u.id === c.userId)).forEach(c => {
      const id = data.courses.some(x => x.id === c.id) ? fresh('crs', data.courses) : c.id;
      courseMap[c.id] = id;
      data.courses.push({ ...clone(c), id });
    });
    seed.lectures.filter(l => courseMap[l.courseId]).forEach(l => {
      const id = data.lectures.some(x => x.id === l.id) ? fresh('lec', data.lectures) : l.id;
      data.lectures.push({ ...clone(l), id, courseId: courseMap[l.courseId] });
    });
    seed.activity.filter(a => a.userId !== demo && data.users.some(u => u.id === a.userId)).forEach(a => {
      const id = data.activity.some(x => x.id === a.id) ? fresh('act', data.activity) : a.id;
      data.activity.push({ ...clone(a), id, courseId: a.courseId ? (courseMap[a.courseId] || null) : null });
    });
    data.meta.adminSeeded = true;
  }

  function save() {
    if (!cfg.useMockData) return;
    const out = { meta: db.meta };
    TABLES.forEach(t => { out[t] = db[t]; });
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(scrub(out))); } catch (e) { /* storage full or disabled: keep working in memory */ }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (isValidStore(data)) {
          // A failed migration must never wipe the student's data: keep it as stored
          let migrated = false;
          try { migrated = migrate(data); } catch (err) { migrated = false; }
          if (migrated) { db = data; save(); }
          return data;
        }
      }
    } catch (e) { /* corrupt or blocked storage → reseed */ }
    const fresh = seed();
    db = fresh;
    save();
    return fresh;
  }

  let db = null;
  db = load();

  // Another tab changed the store → pick it up on the next call
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    db = load();
    ensureContent();
    // Pages (e.g. the AI Tutor in another tab) can refresh what they show
    window.dispatchEvent(new CustomEvent('tutorai:store-changed'));
  });

  /* ---- Request plumbing --------------------------------------------------- */
  /** Resolve a mock handler after a short, realistic delay; persist writes. */
  async function fromMock(method, handler, { latency = cfg.mockLatencyMs } = {}) {
    await wait(latency);
    settleStaleUploads();
    const result = handler();
    // Writes are saved even when the call fails (e.g. a failed AI reply is stored with status 'error')
    if (method !== 'GET') save();
    if (result instanceof ApiError) throw result;
    return clone(result);
  }

  /** Real HTTP call — used once config.useMockData is false. */
  async function fromHttp(method, path, { body, base = cfg.apiBaseUrl } = {}) {
    let response;
    try {
      response = await fetch(base + path, {
        method,
        credentials: 'include',            // PHP session cookie
        // FormData (file uploads) goes as multipart/form-data — the browser sets the boundary header
        headers: { 'Accept': 'application/json', ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
      });
    } catch (networkError) {
      throw new ApiError('Network error — please check your connection.', 0, networkError);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError((data && data.message) || `Request failed (${response.status})`, response.status, data);
    }
    // Backend envelope: { success: true, data: … }
    return data && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
  }

  /** { key: value } → FormData for multipart uploads (null/undefined values are skipped). */
  function multipart(fields) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
    return fd;
  }

  /** Route a request to mock or HTTP. */
  function request(method, path, { body, base, mock, latency } = {}) {
    if (cfg.useMockData) {
      if (typeof mock !== 'function') {
        return Promise.reject(new ApiError(`No mock handler for ${method} ${path}`, 501));
      }
      // Like the PHP session check: everything outside /auth needs a signed-in, active user
      if (!path.startsWith('/auth/')) {
        const user = sessionUser();
        if (!user) return wait(latency ?? cfg.mockLatencyMs).then(() => { throw new ApiError('Please sign in to continue.', 401); });
        if (user.status !== 'active') {
          // Deactivated while signed in: end the session, as session.php will
          db.session.userId = null; save();
          return wait(latency ?? cfg.mockLatencyMs).then(() => { throw new ApiError('This account has been deactivated.', 401); });
        }
      }
      return fromMock(method, mock, { latency });
    }
    return fromHttp(method, path, { body, base });
  }

  /* ======================================================================
     Mock helpers
     ====================================================================== */
  const userById = (id) => db.users.find(u => u.id === id);
  /**
   * The signed-in user. In mock mode db.session.userId plays the PHP session
   * (a server-side session keyed by an httpOnly cookie in production).
   * actingUserId is set only while seed data is generated for the demo student.
   */
  let actingUserId = null;
  const me = () => actingUserId || (db.session && db.session.userId) || null;
  const sessionUser = () => userById(me()) || null;
  const notFound = (entity, id) => new ApiError(`${entity} not found`, 404, { id });
  const normEmail = (email) => String(email || '').trim().toLowerCase();
  const userByEmail = (email) => db.users.find(u => normEmail(u.email) === normEmail(email));
  const str = (v) => String(v ?? '').trim();

  /** Validation-style error, same shape the PHP API will return. */
  const invalid = (message, errors = {}, status = 422) => new ApiError(message, status, { message, errors });

  /**
   * Next prefixed id: nextId('crs', db.courses) → "crs_2006".
   * Like MySQL AUTO_INCREMENT, numbers are never reused after a delete:
   * the highest number handed out per prefix is kept in meta.sequences.
   */
  function nextId(prefix, table) {
    const seq = (db.meta.sequences = db.meta.sequences || {});
    const max = table.reduce((m, r) => Math.max(m, parseInt(String(r.id).split('_')[1], 10) || 0), 0);
    seq[prefix] = Math.max(seq[prefix] || 0, max) + 1;
    return `${prefix}_${seq[prefix]}`;
  }

  function emailTaken(email, exceptUserId = null) {
    const e = normEmail(email);
    if (fixtures.takenEmails.includes(e)) return true;
    const owner = userByEmail(e);
    return !!owner && owner.id !== exceptUserId;
  }

  const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
  const byNewest = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''));

  /* ---- Courses ------------------------------------------------------------ */
  const COURSE_COLORS = ['lavender', 'powder', 'sage', 'butter', 'pink', 'peach'];
  const myCourses = () => db.courses.filter(c => c.userId === me());
  const findCourse = (id) => myCourses().find(c => c.id === id);
  const courseLectures = (courseId) => db.lectures.filter(l => l.courseId === courseId);
  const courseQuizzes = (courseId) => db.quizzes.filter(q => q.courseId === courseId);

  /**
   * Calculated course fields — never stored.
   *   lectureCount           all lectures in the course
   *   readyLectureCount      lectures with status 'ready'
   *   attemptedLectureCount  ready lectures with at least one question in a submitted attempt
   *   progress               COVERAGE: attempted ÷ ready lectures, 0–100 (0 when nothing is ready)
   *   mastery                mean, over attempted ready lectures, of the lecture's BEST
   *                          per-attempt percentage (only that lecture's questions count),
   *                          0–100, or null when no lecture has been attempted
   *   averageScore           mean percent of submitted attempts, or null
   * Stage 5: computed per QUESTION lectureId from attempts, so a quiz that
   * spans two lectures credits each lecture with its own questions.
   */
  function withStats(course) {
    const lectures = courseLectures(course.id);
    const ready = lectures.filter(l => l.status === 'ready');
    const results = lectureResults({ courseId: course.id });
    const best = ready.map(l => lectureBestScore(l.id, results)).filter(s => s !== null);
    const quizzes = courseQuizzes(course.id).filter(q => q.status === 'ready');
    const atts = submittedAttempts({ courseId: course.id });
    const completed = quizzes.filter(q => atts.some(a => a.quizId === q.id));
    const avgScore = avg(atts.map(a => a.percent));
    return {
      ...course,
      lectureCount: lectures.length,
      readyLectureCount: ready.length,
      attemptedLectureCount: best.length,
      quizCount: quizzes.length,
      completedQuizCount: completed.length,
      averageScore: avgScore === null ? null : Math.round(avgScore),
      progress: ready.length ? Math.round((best.length / ready.length) * 100) : 0,
      mastery: best.length ? Math.round(avg(best)) : null
    };
  }

  function validateCourse(input, { partial = false, exceptId = null } = {}) {
    const errors = {};
    const out = {};
    const has = (k) => !partial || input[k] !== undefined;

    if (has('code')) {
      out.code = str(input.code).toUpperCase().replace(/\s+/g, ' ');
      if (!out.code) errors.code = 'Enter a course code.';
      else if (out.code.length > 20) errors.code = 'Use 20 characters or fewer.';
      else if (myCourses().some(c => c.id !== exceptId && c.code.toLowerCase() === out.code.toLowerCase())) {
        errors.code = `You already have a course with the code ${out.code}.`;
      }
    }
    if (has('title')) {
      out.title = str(input.title);
      if (!out.title) errors.title = 'Enter a course title.';
      else if (out.title.length > 120) errors.title = 'Use 120 characters or fewer.';
    }
    if (has('instructor')) {
      out.instructor = str(input.instructor);
      if (out.instructor.length > 80) errors.instructor = 'Use 80 characters or fewer.';
    }
    if (has('term')) {
      out.term = str(input.term);
      if (!out.term) errors.term = 'Choose a term.';
    }
    if (has('color')) {
      out.color = str(input.color) || 'lavender';
      if (!COURSE_COLORS.includes(out.color)) errors.color = 'Choose one of the colours.';
    }
    if (has('description')) {
      out.description = str(input.description);
      if (out.description.length > 1000) errors.description = 'Use 1000 characters or fewer.';
    }
    if (input.status !== undefined) {
      out.status = input.status === 'archived' ? 'archived' : 'active';
    }
    const isDuplicate = errors.code && /already have/.test(errors.code);
    if (Object.keys(errors).length) {
      return invalid(isDuplicate ? 'That course code is already in use.' : 'Check the highlighted fields.', errors, isDuplicate ? 409 : 422);
    }
    return out;
  }

  /* ---- Lectures ----------------------------------------------------------- */
  const PIPELINE = ['uploading', 'extracting', 'processing'];
  const LECTURE_STATUSES = [...PIPELINE, 'ready', 'failed'];
  const STALE_MINUTES = 10;
  const MAX_UPLOAD_KB = 20 * 1024;

  /** An upload abandoned mid-pipeline (tab closed) fails after 10 minutes. */
  function settleStaleUploads() {
    if (!db) return;
    const cutoff = Date.now() - STALE_MINUTES * 60000;
    let changed = false;
    db.lectures.forEach(l => {
      if (PIPELINE.includes(l.status) && new Date(l.uploadedAt).getTime() < cutoff) {
        l.status = 'failed';
        changed = true;
      }
    });
    if (changed) save();
  }

  /** Demo stand-in for PDF text extraction: about 90 KB per page. */
  const estimatePages = (kb) => Math.max(1, Math.round(kb / 90));

  /* ---- Activity & notifications ------------------------------------------ */
  /**
   * Activity log row: { id, userId, courseId, type, refId, title, createdAt }.
   * Types: course_created | course_updated | course_deleted | lecture_uploaded |
   * lecture_failed | lecture_deleted | lecture_viewed | quiz_created |
   * quiz_submitted | chat_message | notes_generated
   */
  function logActivity(type, courseId, title, refId = null) {
    db.activity.push({ id: nextId('act', db.activity), userId: me(), type, courseId, refId, title, createdAt: nowIso() });
  }

  function notify(type, title, message, link) {
    const prefs = userSettings(me()).notifications;
    if (prefs[NOTIFY_PREF[type]] === false) return;
    db.notifications.push({ id: nextId('ntf', db.notifications), userId: me(), type, title, message, link, isRead: false, createdAt: nowIso() });
  }

  /* ---- Settings (user_settings) ------------------------------------------ */
  const DEFAULT_SETTINGS = Object.freeze({
    notifications: { lectureReady: true, quizReady: true, weeklySummary: true, studyReminders: false },
    weeklyGoalDays: 4,                       // study days per week (1–7), shown on the dashboard
    reducedMotion: 'system'                  // 'system' (follow the device) | 'reduce' (always)
  });
  /** Notification type → the setting that switches it off. */
  const NOTIFY_PREF = { lecture: 'lectureReady', quiz: 'quizReady', progress: 'weeklySummary', reminder: 'studyReminders' };
  function userSettings(userId) {
    const row = db.settings.find(x => x.userId === userId) || {};
    return {
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(row.notifications || {}) },
      weeklyGoalDays: row.weeklyGoalDays || DEFAULT_SETTINGS.weeklyGoalDays,
      reducedMotion: row.reducedMotion || DEFAULT_SETTINGS.reducedMotion,
      updatedAt: row.updatedAt || null
    };
  }

  const ACTIVITY_TAB = { lecture_uploaded: 'lectures', lecture_failed: 'lectures', lecture_deleted: 'lectures', quiz_created: 'quizzes', quiz_submitted: 'quizzes', notes_generated: 'lectures' };
  /** Activity that's too frequent for "Recent activity" lists (still counted in the weekly goal and charts). */
  const QUIET_ACTIVITY = ['lecture_viewed', 'chat_message'];

  function enrichActivity(a) {
    const course = a.courseId ? findCourse(a.courseId) : null;
    let link = course ? `pages/student/course.html?id=${course.id}&tab=${ACTIVITY_TAB[a.type] || 'overview'}` : null;
    if (a.type === 'quiz_submitted' && a.refId && db.attempts.some(x => x.id === a.refId)) link = `pages/student/quiz-results.html?attempt=${a.refId}`;
    if ((a.type === 'lecture_viewed' || a.type === 'notes_generated') && a.refId && db.lectures.some(l => l.id === a.refId)) link = `pages/student/lecture.html?id=${a.refId}`;
    return { ...a, course: course ? { id: course.id, code: course.code, title: course.title, color: course.color } : null, link };
  }

  /** Local calendar day key, e.g. "2026-11-15". */
  const dayKey = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };


  /** Study days so far this week (Monday start) against the student's weekly goal. */
  function weeklyGoal(userId) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const days = new Set(db.activity.filter(a => a.userId === userId && new Date(a.createdAt) >= start).map(a => dayKey(a.createdAt)));
    return { goalDays: userSettings(userId).weeklyGoalDays, studiedDays: days.size, weekStart: start.toISOString() };
  }

  /* ---- Admin helpers -------------------------------------------------------- */
  const requireAdmin = () => ((sessionUser() || {}).role === 'admin' ? null : new ApiError('Only administrators can do that.', 403));
  const fullName = (u) => `${u.firstName} ${u.lastName}`.trim();
  const ADMIN_ACTIVITY_LABEL = {
    course_created: 'Added a course', course_updated: 'Updated a course', course_deleted: 'Deleted a course',
    lecture_uploaded: 'Uploaded a lecture', lecture_failed: 'Lecture processing failed', lecture_deleted: 'Deleted a lecture',
    lecture_viewed: 'Read a lecture', chat_message: 'Asked the AI Tutor', notes_generated: 'Generated study notes',
    quiz_created: 'Created a quiz', quiz_submitted: 'Submitted a quiz'
  };
  /** Latest of sign-in and logged activity (ISO string, '' if never). */
  function lastActiveAt(u) {
    const acts = db.activity.filter(a => a.userId === u.id).map(a => a.createdAt);
    return [u.lastLoginAt || '', ...acts].sort().pop() || '';
  }
  /** One row of the admin user table: account details and usage counts, no content. */
  function adminUserRow(u) {
    const courseIds = new Set(db.courses.filter(c => c.userId === u.id).map(c => c.id));
    const lastAction = db.adminActions.filter(x => x.userId === u.id).sort(byNewest('createdAt'))[0];
    return {
      id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, avatarColor: u.avatarColor,
      institution: u.institution, program: u.program, status: u.status,
      createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null, lastActiveAt: lastActiveAt(u) || null,
      counts: {
        courses: courseIds.size,
        lectures: db.lectures.filter(l => courseIds.has(l.courseId)).length,
        quizzesTaken: db.attempts.filter(a => a.userId === u.id && a.status === 'submitted').length,
        conversations: db.conversations.filter(c => c.userId === u.id).length
      },
      lastStatusChange: lastAction ? { action: lastAction.action, reason: lastAction.reason, at: lastAction.createdAt } : null
    };
  }

  const courseRef = (c) => (c ? { id: c.id, code: c.code, title: c.title, color: c.color } : null);

  /* ======================================================================
     Quizzes, attempts and results (stage 5)
     ----------------------------------------------------------------------
     Quiz (qz_):    { id, courseId, title, source, lectureIds[], difficulty,
                      settings { count, types[], explanations, timeLimitMin },
                      status 'draft'|'ready', createdAt, questions[] }
     Question (q_): { id, type, prompt, options[{id,text}], correct, explanation,
                      lectureId, page, topic, difficulty }
     Attempt (att_):{ id, quizId, userId, status 'in_progress'|'submitted',
                      answers {qid: value}, currentIndex, flagged[], order[],
                      shuffleOptions, startedAt, deadlineAt, submittedAt,
                      score, total, percent, perQuestion[{questionId, correct, points, feedback?}] }
     Every score is recomputed from answers vs correct answers (quiz-engine.js).
     ====================================================================== */
  const E = T.quizEngine;
  const quizById = (id) => db.quizzes.find(q => q.id === id);
  const myQuiz = (id) => { const q = quizById(id); return q && findCourse(q.courseId) ? q : null; };
  const lectureTopic = (lectureId) => { const l = db.lectures.find(x => x.id === lectureId); return l ? (l.topic || l.title) : null; };
  const QUIZ_TYPES = ['mcq', 'multi', 'true_false', 'short'];
  const QUIZ_COUNTS = [5, 10, 15, 20];
  const QUIZ_LEVELS = ['easy', 'medium', 'hard', 'mixed'];
  const QUIZ_SOURCES = ['ai', 'lecture', 'weak-topics', 'retry'];

  /** questionId → question (+ courseId), across all of the student's quizzes. */
  function questionIndex() {
    const m = new Map();
    db.quizzes.forEach(qz => { if (findCourse(qz.courseId)) (qz.questions || []).forEach(q => m.set(q.id, { ...q, courseId: qz.courseId, quizId: qz.id })); });
    return m;
  }

  /** Submitted attempts, optionally for one course and a date range (ISO from/to). */
  function submittedAttempts({ courseId = null, from = null, to = null } = {}) {
    return db.attempts.filter(a => {
      if (a.userId !== me() || a.status !== 'submitted') return false;
      const qz = quizById(a.quizId);
      if (!qz || !findCourse(qz.courseId)) return false;
      if (courseId && qz.courseId !== courseId) return false;
      if (from && a.submittedAt < from) return false;
      if (to && a.submittedAt > to) return false;
      return true;
    });
  }

  /** lectureId → [{ attemptId, quizId, percent, submittedAt }] — each question credits its own lecture. */
  const lectureResults = (filter) => E.lectureStats(submittedAttempts(filter), questionIndex());

  /** Best per-lecture percentage, or null when the lecture has never been in a submitted attempt. */
  function lectureBestScore(lectureId, results = lectureResults()) {
    const list = results.get(lectureId);
    return list && list.length ? Math.max(...list.map(x => x.percent)) : null;
  }

  /**
   * Per (course, topic) results. average = mean of the topic's percentage in
   * each submitted attempt that included it; band from quiz-engine
   * (strong ≥ 80, okay 65–79, revise < 65).
   */
  function topicSummary(filter = {}) {
    const qi = questionIndex();
    const keyed = new Map([...qi].map(([id, q]) => [id, { ...q, topic: q.topic ? `${q.courseId}|${q.topic}` : null }]));
    const stats = E.topicStats(submittedAttempts(filter), keyed);
    return [...stats.entries()].map(([key, list]) => {
      const [courseId, topic] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      const sample = [...qi.values()].find(q => q.courseId === courseId && q.topic === topic);
      const average = Math.round(avg(list.map(x => x.percent)));
      return {
        topic, courseId, lectureId: sample ? sample.lectureId : null,
        average, best: Math.max(...list.map(x => x.percent)), latest: list[list.length - 1].percent,
        attempts: list.length, scores: list.map(x => x.percent), quizIds: list.map(x => x.quizId),
        quizTitles: list.map(x => (quizById(x.quizId) || {}).title || 'Quiz'),
        lastAt: list[list.length - 1].submittedAt, band: E.band(average)
      };
    });
  }

  /** "Recommended revision": topics in the revise band (< 65%), lowest first. */
  function weakTopics(courses, limit = 3) {
    const ids = new Set(courses.map(c => c.id));
    return topicSummary().filter(t => ids.has(t.courseId) && t.band === 'revise')
      .sort((a, b) => a.average - b.average).slice(0, limit)
      .map(t => ({ courseId: t.courseId, topic: t.topic, lectureId: t.lectureId, averageScore: t.average, attempts: t.attempts, course: courseRef(findCourse(t.courseId)) }));
  }

  /** Hub/list row: quiz metadata + derived attempt stats (never questions). */
  function quizRow(qz) {
    const atts = db.attempts.filter(a => a.quizId === qz.id && a.userId === me());
    const done = atts.filter(a => a.status === 'submitted').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const open = atts.find(a => a.status === 'in_progress');
    const lectures = qz.lectureIds.map(id => db.lectures.find(l => l.id === id)).filter(Boolean)
      .map(l => ({ id: l.id, title: l.title, lectureNumber: l.lectureNumber, status: l.status }));
    const best = done.length ? Math.max(...done.map(a => a.percent)) : null;
    const last = done[done.length - 1];
    const { questions, ...meta } = qz;
    return {
      ...meta,
      course: courseRef(findCourse(qz.courseId)),
      lectures,
      topic: lectures[0] ? lectureTopic(lectures[0].id) : null,
      questionCount: (qz.questions || []).length,
      status: open ? 'in_progress' : done.length ? 'completed' : 'not_started',
      attemptCount: done.length,
      bestScore: best,
      lastScore: last ? last.percent : null,
      lastTakenAt: last ? last.submittedAt : null,
      latestAttemptId: last ? last.id : null,
      inProgressAttemptId: open ? open.id : null,
      // stage 3–4 aliases still read by older views
      score: best, completedAt: last ? last.submittedAt : null, lecture: lectures[0] || null
    };
  }

  /** Quiz as sent before submission: questions WITHOUT answers, in attempt order. */
  function publicQuiz(qz, attempt = null) {
    const byId = new Map((qz.questions || []).map(q => [q.id, q]));
    const order = attempt && attempt.order ? attempt.order.filter(id => byId.has(id)) : (qz.questions || []).map(q => q.id);
    return {
      ...quizRow(qz),
      questions: order.map(id => E.sanitizeQuestion(byId.get(id), { optionSeed: attempt && attempt.shuffleOptions ? attempt.id : null }))
    };
  }

  /** Generate questions from the course's READY lecture pages only. */
  function generateQuestionsFor({ courseId, lectureIds, count, difficulty, types, focusTerms = [], priorityPages = [], exclude = [], seed = Date.now() }) {
    const pages = lectureIds.flatMap(id => coursePages(courseId, id));
    const r = T.mockAI.generateQuestions({ pages, count, difficulty, types, focusTerms, priorityPages, exclude, topicOf: lectureTopic, seed });
    const allowed = new Set(courseLectures(courseId).map(l => l.id));
    r.questions.forEach(q => { if (!allowed.has(q.lectureId)) throw new Error(`[TutorAI dev] Course isolation violated: question from ${q.lectureId}`); });
    return { questions: r.questions.map(q => ({ id: nextId('q', []), ...q })), short: r.short };
  }

  /** Answer value that is right (or wrong) for a question — used to build seeded/migrated attempts. */
  function seedAnswer(q, right) {
    if (q.type === 'short') return right ? `${q.correct.keywords.join(', ')}.` : 'I’m not sure.';
    if (q.type === 'multi') return right ? q.correct.slice() : [q.options.find(o => !q.correct.includes(o.id)).id];
    return right ? q.correct[0] : q.options.find(o => !q.correct.includes(o.id)).id;
  }

  /** A submitted attempt whose stored answers get exactly `correct` questions right. */
  function seedAttempt(qz, { correct, submittedAt, minutes = 10, n = 0 }) {
    const qs = qz.questions;
    const wrong = new Set(E.shuffle(qs.map(q => q.id), `${qz.id}:${n}`).slice(0, Math.max(0, qs.length - correct)));
    const answers = {};
    qs.forEach(q => { answers[q.id] = seedAnswer(q, !wrong.has(q.id)); });
    const g = E.gradeAttempt(qs, answers);
    const att = {
      id: nextId('att', db.attempts), quizId: qz.id, userId: me(), status: 'submitted',
      answers, currentIndex: qs.length - 1, flagged: qs.filter(q => wrong.has(q.id)).slice(0, 1).map(q => q.id),
      order: qs.map(q => q.id), shuffleOptions: n > 0,
      startedAt: new Date(new Date(submittedAt).getTime() - minutes * 60000).toISOString(), deadlineAt: null,
      submittedAt, resultsViewedAt: submittedAt, score: g.score, total: g.total, percent: g.percent, perQuestion: g.perQuestion
    };
    db.attempts.push(att);
    return att;
  }

  function seedInProgress(qz, { answered, at }) {
    const answers = {};
    qz.questions.slice(0, answered).forEach(q => { answers[q.id] = seedAnswer(q, true); });
    db.attempts.push({
      id: nextId('att', db.attempts), quizId: qz.id, userId: me(), status: 'in_progress',
      answers, currentIndex: Math.min(answered, qz.questions.length - 1), flagged: [],
      order: qz.questions.map(q => q.id), shuffleOptions: false, startedAt: at, deadlineAt: null,
      submittedAt: null, score: null, total: qz.questions.length, percent: null, perQuestion: []
    });
  }

  /** Attempt without answers — for lists and tables. */
  function attemptSummary(a) {
    const qz = quizById(a.quizId);
    return {
      id: a.id, quizId: a.quizId, quizTitle: qz ? qz.title : 'Quiz', course: courseRef(findCourse(qz && qz.courseId)),
      status: a.status, startedAt: a.startedAt, submittedAt: a.submittedAt, deadlineAt: a.deadlineAt,
      score: a.score, total: a.total, percent: a.percent, currentIndex: a.currentIndex,
      answeredCount: qz ? qz.questions.filter(q => E.isAnswered(q, a.answers[q.id])).length : 0,
      flaggedCount: (a.flagged || []).length,
      timeTakenSec: a.submittedAt ? Math.round((new Date(a.submittedAt) - new Date(a.startedAt)) / 1000) : null
    };
  }

  const attemptTitle = (att) => { const qz = quizById(att.quizId); return `Scored ${att.percent}% on “${qz ? qz.title : 'a quiz'}”`; };

  /** Build seed quizzes + attempts from mock-data.js plans (fresh stores). */
  function seedQuizzesFromPlans() {
    (T.mockData.quizzes || []).forEach(plan => {
      if (!findCourse(plan.courseId) || !plan.lectureIds.every(id => contentFor(id))) return;
      const gen = generateQuestionsFor({ courseId: plan.courseId, lectureIds: plan.lectureIds, count: plan.count, difficulty: plan.difficulty, types: plan.types, seed: E.hash(plan.id) });
      const qz = {
        id: plan.id, courseId: plan.courseId, title: plan.title, source: plan.source, lectureIds: plan.lectureIds.slice(),
        difficulty: plan.difficulty, settings: { count: plan.count, types: plan.types.slice(), explanations: true, timeLimitMin: null },
        status: 'ready', createdAt: plan.createdAt, questions: gen.questions
      };
      db.quizzes.push(qz);
      (plan.attempts || []).forEach((a, n) => {
        const att = seedAttempt(qz, { ...a, correct: Math.min(a.correct, qz.questions.length), n });
        db.activity.push({ id: nextId('act', db.activity), userId: me(), type: 'quiz_submitted', courseId: qz.courseId, refId: att.id, title: attemptTitle(att), createdAt: att.submittedAt });
      });
      if (plan.inProgress) seedInProgress(qz, plan.inProgress);
    });
  }

  /** Stage 3–4 quiz → stage 5 quiz (+ an attempt rebuilt from its recorded score). Keeps the id. */
  function migrateLegacyQuiz(old) {
    const lectureIds = old.lectureId && db.lectures.some(l => l.id === old.lectureId) ? [old.lectureId] : [];
    let questions = [];
    if (Array.isArray(old.questions) && old.questions.length && 'answerIndex' in old.questions[0]) {
      questions = old.questions.map(x => ({
        id: nextId('q', []), type: 'mcq', prompt: x.prompt,
        options: x.options.map((t, i) => ({ id: 'abcd'[i], text: t })), correct: ['abcd'[x.answerIndex]],
        explanation: x.explanation || '', lectureId: old.lectureId, page: x.page || 1,
        topic: lectureTopic(old.lectureId), difficulty: old.difficulty || 'medium'
      }));
    } else if (lectureIds.length && findCourse(old.courseId)) {
      questions = generateQuestionsFor({ courseId: old.courseId, lectureIds, count: old.questionCount || 8, difficulty: old.difficulty || 'medium', types: ['mcq', 'true_false'], seed: E.hash(old.id) }).questions;
    }
    const qz = {
      id: old.id, courseId: old.courseId, title: old.title, source: old.source === 'ai' ? 'ai' : 'lecture', lectureIds,
      difficulty: old.difficulty || 'medium', settings: { count: questions.length, types: [...new Set(questions.map(q => q.type))], explanations: true, timeLimitMin: null },
      status: 'ready', createdAt: old.createdAt || old.completedAt || nowIso(), questions
    };
    let att = null;
    if (old.status === 'completed' && old.score != null && questions.length) {
      att = seedAttempt(qz, { correct: Math.round((old.score / 100) * questions.length), submittedAt: old.completedAt || nowIso(), n: 0 });
    }
    return { qz, att };
  }

  /**
   * Quizzes for this store's schema: build from seed plans on a fresh store,
   * or migrate stage 3–4 quizzes in place (no data is wiped). Also drops
   * abandoned drafts older than a day.
   */
  function ensureQuizzes() {
    if (!T.mockAI || !T.quizEngine) return false;
    let changed = false;
    if (db.meta.fresh) {
      seedQuizzesFromPlans();
      changed = true;
    } else if ((db.meta.schema || 0) < 5) {
      const legacy = db.quizzes.filter(q => !Array.isArray(q.lectureIds));
      const keep = db.quizzes.filter(q => Array.isArray(q.lectureIds));
      db.quizzes = keep;
      legacy.forEach(old => {
        const { qz, att } = migrateLegacyQuiz(old);
        db.quizzes.push(qz);
        if (att) {
          const row = db.activity.find(a => a.type === 'quiz_completed' && !a.refId && a.courseId === qz.courseId && String(a.title || '').includes(qz.title));
          if (row) Object.assign(row, { type: 'quiz_submitted', refId: att.id, title: attemptTitle(att) });
          else db.activity.push({ id: nextId('act', db.activity), userId: me(), type: 'quiz_submitted', courseId: qz.courseId, refId: att.id, title: attemptTitle(att), createdAt: att.submittedAt });
        }
      });
      db.activity.forEach(a => { if (a.type === 'quiz_completed' || a.type === 'quiz_generated') a.type = a.type === 'quiz_completed' ? 'quiz_submitted' : 'quiz_created'; });
      changed = true;
    }
    if ((db.meta.schema || 0) < 5) { db.meta.schema = 5; changed = true; }
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const stale = db.quizzes.filter(q => q.status === 'draft' && q.createdAt < dayAgo).map(q => q.id);
    if (stale.length) { db.quizzes = db.quizzes.filter(q => !stale.includes(q.id)); changed = true; }
    return changed;
  }

  /** A month of lecture views and chat messages, so the activity chart has history (fresh stores). */
  function seedStudyActivity() {
    const lectures = db.lectures.filter(l => l.status === 'ready' && findCourse(l.courseId) && findCourse(l.courseId).status !== 'archived');
    if (!lectures.length) return;
    for (let d = 1; d <= 30; d++) {
      if (d % 7 === 6) continue;                     // a rest day each week
      const day = new Date(); day.setDate(day.getDate() - d);
      const views = 1 + (d * 3) % 3;
      for (let i = 0; i < views; i++) {
        const l = lectures[(d * 5 + i * 3) % lectures.length];
        day.setHours(9 + i * 3, 15, 0, 0);
        db.activity.push({ id: nextId('act', db.activity), userId: me(), type: 'lecture_viewed', courseId: l.courseId, refId: l.id, title: `Read “${l.title}”`, createdAt: day.toISOString() });
      }
      if (d % 3 === 0) {
        const l = lectures[(d * 7) % lectures.length];
        day.setHours(20, 30, 0, 0);
        db.activity.push({ id: nextId('act', db.activity), userId: me(), type: 'chat_message', courseId: l.courseId, refId: null, title: `Asked the AI Tutor about ${l.title}`, createdAt: day.toISOString() });
      }
    }
  }

  /* ---- Lecture content (extracted text) ------------------------------------ */
  const contentFor = (lectureId) => db.lectureContent.find(c => c.lectureId === lectureId);

  /**
   * Demo stand-in pages for a lecture uploaded in the browser — the PDF is
   * never read, so each page says so. Labelled with generated: true.
   */
  function placeholderPages(lecture) {
    const n = Math.min(12, Math.max(4, estimatePages(lecture.fileSizeKb || 400)));
    return Array.from({ length: n }, (_, i) => ({
      page: i + 1,
      heading: i === 0 ? lecture.title : `${lecture.title} (page ${i + 1})`,
      text: `**Demo content — not extracted from your file.** This placeholder stands in for page ${i + 1} of *${lecture.fileName}*.` +
        (i === 0 && lecture.description ? ` The lecture description says: ${lecture.description}` : '') +
        `\n\nIn the full app, page ${i + 1} would show the real text extracted from the PDF, and the AI Tutor would answer from it.`
    }));
  }

  /** The selected course's ready pages only (optionally one lecture). The ONLY input the mock AI gets. */
  function coursePages(courseId, lectureId = null) {
    return db.lectures
      .filter(l => l.courseId === courseId && l.status === 'ready' && (!lectureId || l.id === lectureId))
      .sort((a, b) => (a.lectureNumber || 0) - (b.lectureNumber || 0))
      .flatMap(l => (contentFor(l.id) ? contentFor(l.id).pages : []).map(pg => ({
        lectureId: l.id, lectureTitle: l.title, lectureNumber: l.lectureNumber, page: pg.page, heading: pg.heading, text: pg.text
      })));
  }

  /* ---- Conversations & messages ------------------------------------------- */
  const MAX_MESSAGE = 2000;
  const findConversation = (id) => {
    const c = db.conversations.find(x => x.id === id);
    return c && c.userId === me() && findCourse(c.courseId) ? c : null;
  };
  const conversationMessages = (id) => db.messages.filter(m => m.conversationId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  function enrichSources(sources) {
    return (sources || []).map(src => {
      const l = db.lectures.find(x => x.id === src.lectureId);
      return { ...src, lectureTitle: l ? l.title : null, lectureNumber: l ? l.lectureNumber : null, missing: !l };
    });
  }
  const enrichMessage = (m) => ({ ...m, sources: enrichSources(m.sources) });

  /** First line of real prose in a Markdown answer: no heading, learner note, links or symbols. */
  function previewOf(md) {
    const lines = String(md || '').split('\n').map(l => l.trim())
      .filter(l => l && !/^#{1,6}\s/.test(l) && !/^\*\*From your/.test(l) && !/^(<|~~~|```|\$\$)/.test(l));
    const line = (lines[0] || '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\$([^$]+)\$/g, (_, tex) => tex
        .replace(/\\([a-zA-Z]+)/g, (m, cmd) => ({ rightarrow: '→', to: '→', times: '×', cap: '∩', cup: '∪', mid: '|', sigma: 'σ', pi: 'π', eta: 'η', nabla: '∇', le: '≤', ge: '≥', dots: '…' }[cmd] || ''))
        .replace(/[{}^]/g, ''))
      .replace(/^(\d+\.|-)\s+/, '')
      .replace(/\*\*|[*`>#]/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ').trim();
    return line.length > 110 ? line.slice(0, 109).replace(/\s+\S*$/, '') + '…' : line;
  }

  function enrichConversation(c) {
    const msgs = conversationMessages(c.id);
    const lecture = c.lectureId ? db.lectures.find(l => l.id === c.lectureId) : null;
    const last = msgs[msgs.length - 1];
    return {
      ...c,
      course: courseRef(findCourse(c.courseId)),
      lectureTitle: lecture ? lecture.title : null,
      messageCount: msgs.length,
      preview: last ? previewOf(last.content) : ''
    };
  }

  /**
   * Run the mock AI on the conversation's course only, then re-check
   * isolation for sources AND the learner context it used.
   */
  function generateReply(conv, text, history, variant = 0, learner = null) {
    const course = findCourse(conv.courseId);
    const pages = coursePages(course.id, conv.lectureId);
    const ctx = T.mockAI.buildContext({ course, pages, message: text, history, lectureId: conv.lectureId, learner: learner || buildLearnerContext(course.id) });
    const result = T.mockAI.respond(ctx, { variant });
    T.mockAI.assertCourseIsolation(result.sources, courseLectures(course.id).map(l => l.id), course.code, {
      context: result.context, allowedQuizIds: courseQuizzes(course.id).map(q => q.id), courseId: course.id
    });
    return result;
  }

  /**
   * Chat "quiz me on joins, 10 hard questions" → parse within THIS course,
   * make a draft with the shared generator, answer with a preview link.
   * Returns null if nothing could be made (the normal answer is used).
   */
  function quizReply(conv, text) {
    const course = findCourse(conv.courseId);
    const lectures = courseLectures(course.id).filter(l => l.status === 'ready' && (!conv.lectureId || l.id === conv.lectureId));
    if (!lectures.length) return null;
    const parsed = T.mockAI.parseQuizRequest(text, [{ id: course.id, code: course.code, title: course.title, lectures: lectures.map(l => ({ id: l.id, title: l.title, topic: l.topic })), pages: lectures.flatMap(l => coursePages(course.id, l.id)) }], { defaultCourseId: course.id });
    const lectureIds = parsed.lectureIds.filter(id => lectures.some(l => l.id === id));
    const gen = generateQuestionsFor({ courseId: course.id, lectureIds: lectureIds.length ? lectureIds : lectures.map(l => l.id), count: parsed.count, difficulty: parsed.difficulty, types: parsed.types, focusTerms: parsed.focusTerms });
    if (!gen.questions.length) return null;
    const ids = [...new Set(gen.questions.map(q => q.lectureId))];
    const qz = {
      id: nextId('qz', db.quizzes), courseId: course.id,
      title: parsed.label ? `${course.code}: ${parsed.label}` : `${course.code} practice quiz`,
      source: 'ai', lectureIds: ids, difficulty: parsed.difficulty,
      settings: { count: parsed.count, types: parsed.types, explanations: true, timeLimitMin: null },
      status: 'draft', createdAt: nowIso(), questions: gen.questions
    };
    db.quizzes.push(qz);
    const lecs = ids.map(id => db.lectures.find(l => l.id === id));
    const label = (l) => (l.lectureNumber ? `Lecture ${l.lectureNumber}` : `“${l.title}”`);
    const typeNames = { mcq: 'multiple choice', multi: 'multiple select', true_false: 'true/false', short: 'short answer' };
    return {
      intent: 'quiz',
      content: [
        `### Your quiz is ready: ${qz.title}`,
        `I wrote **${gen.questions.length} ${parsed.difficulty} questions** (${parsed.types.map(t => typeNames[t]).join(', ')}) from ${lecs.map(l => `[${label(l)}: ${l.title}](lecture.html?id=${l.id})`).join(', ')}${parsed.focusTerms.length ? `, focusing on *${(parsed.label || parsed.focusTerms.join(', ')).toLowerCase()}*` : ''}.`,
        `Answers stay hidden until you submit. You can swap questions before you start.`,
        `**[Preview and start the quiz →](quiz-create.html?draft=${qz.id})**`
      ].join('\n\n'),
      sources: [],
      context: [
        { type: 'quiz', label: `Quiz draft: ${gen.questions.length} questions`, link: `pages/student/quiz-create.html?draft=${qz.id}`, ref: { quizId: qz.id } },
        ...lecs.map(l => ({ type: 'lecture', label: label(l), link: `pages/student/lecture.html?id=${l.id}`, ref: { lectureId: l.id } }))
      ]
    };
  }

  /**
   * Learner context for ONE course — what the AI may know about the student
   * there. In production FastAPI builds this server-side from MySQL; the
   * frontend never needs to send it.
   */
  function buildLearnerContext(courseId) {
    const course = findCourse(courseId);
    if (!course) return null;
    const stats = withStats(course);
    const results = lectureResults({ courseId });
    const lectures = courseLectures(courseId)
      .sort((a, b) => (a.lectureNumber || 999) - (b.lectureNumber || 999))
      .map(l => {
        const attempts = (results.get(l.id) || []).map(x => ({ quizId: x.quizId, title: (quizById(x.quizId) || {}).title || 'Quiz', topic: l.topic || l.title, score: x.percent, completedAt: x.submittedAt }));
        return { id: l.id, title: l.title, lectureNumber: l.lectureNumber, status: l.status, pageCount: l.pageCount, bestScore: attempts.length ? Math.max(...attempts.map(a => a.score)) : null, attempts };
      });
    const weak = topicSummary({ courseId }).filter(t => t.band === 'revise').sort((a, b) => a.average - b.average)
      .map(t => ({ topic: t.topic, lectureId: t.lectureId, averageScore: t.average, scores: t.scores, quizIds: t.quizIds, quizTitles: t.quizTitles }));
    return {
      courseId, code: course.code, title: course.title, color: course.color,
      progress: stats.progress, mastery: stats.mastery,
      readyLectureCount: stats.readyLectureCount, attemptedLectureCount: stats.attemptedLectureCount,
      lectures,
      weakTopics: weak,
      unquizzedLectures: lectures.filter(l => l.status === 'ready' && !l.attempts.length).map(({ id, title, lectureNumber }) => ({ id, title, lectureNumber })),
      unstartedQuizzes: courseQuizzes(courseId).filter(q => q.status === 'ready' && !db.attempts.some(a => a.quizId === q.id && a.status === 'submitted'))
        .map(q => ({ id: q.id, title: q.title, topic: lectureTopic(q.lectureIds[0]), lectureId: q.lectureIds[0] || null }))
    };
  }

  /** One smart, data-backed suggestion for a course's AI Tutor card. */
  function suggestionFor(lc) {
    const lec = (id) => lc.lectures.find(l => l.id === id);
    const label = (l) => (l && l.lectureNumber ? `Lecture ${l.lectureNumber}` : (l ? `“${l.title}”` : 'this lecture'));
    if (!lc.readyLectureCount) {
      return { kind: 'upload', label: 'Upload a lecture to start chatting', prompt: null, lectureId: null };
    }
    const w = lc.weakTopics[0];
    if (w) {
      const l = lec(w.lectureId);
      return {
        kind: 'review',
        label: w.scores.length > 1 ? `Review ${label(l)}: your lowest topic (${w.averageScore}% avg)` : `Review ${label(l)}: your lowest score (${w.averageScore}%)`,
        prompt: `Help me review ${w.topic} — my quiz ${w.scores.length > 1 ? 'average is' : 'score was'} ${w.averageScore}%`,
        lectureId: l && l.status === 'ready' ? l.id : null
      };
    }
    const u = lc.unquizzedLectures[0];
    if (u) return { kind: 'quiz', label: `${label(u)} isn’t quizzed yet`, prompt: `Test my understanding of “${u.title}”`, lectureId: u.id };
    const q = lc.unstartedQuizzes[0];
    if (q) return { kind: 'waiting', label: `Quiz waiting: ${q.title}`, prompt: `Test my understanding of ${q.topic}`, lectureId: q.lectureId && lec(q.lectureId) && lec(q.lectureId).status === 'ready' ? q.lectureId : null };
    const ready = lc.lectures.filter(l => l.status === 'ready');
    const latest = ready[ready.length - 1];
    return { kind: 'summary', label: latest.lectureNumber ? `Summarize ${label(latest)}: ${latest.title}` : `Summarize ${label(latest)}`, prompt: `Summarize “${latest.title}”`, lectureId: latest.id };
  }

  function addMessage(conv, fields, at = nowIso()) {
    const m = { id: nextId('msg', db.messages), conversationId: conv.id, sources: [], status: 'complete', createdAt: at, ...fields };
    db.messages.push(m);
    conv.updatedAt = at;
    return m;
  }

  /** Sample conversations, generated once the mock AI and lecture text are loaded. */
  function seedConversations() {
    if (db.meta.seededConversations || !T.mockAI) return false;
    const owner = T.mockData.demoUserId;
    const plan = [
      { courseId: 'crs_2001', lectureId: 'lec_3003', minutesAgo: 95, ask: ['How do PHP sessions work?', 'Test my understanding of session security'] },
      { courseId: 'crs_2002', lectureId: null, minutesAgo: 60 * 24 * 3, ask: ['Explain the difference between 2NF and 3NF simply'] }
    ].filter(x => findCourse(x.courseId) && coursePages(x.courseId, x.lectureId).length);
    if (!plan.length) return false;
    plan.forEach(x => {
      let t = Date.now() - x.minutesAgo * 60000;
      const at = () => new Date(t += 20000).toISOString();
      const conv = { id: nextId('conv', db.conversations), userId: owner, courseId: x.courseId, lectureId: x.lectureId, title: x.ask[0], createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString() };
      db.conversations.push(conv);
      x.ask.forEach(q => {
        const history = conversationMessages(conv.id);
        addMessage(conv, { role: 'user', content: q }, at());
        const r = generateReply(conv, q, history);
        addMessage(conv, { role: 'assistant', content: r.content, sources: r.sources, context: r.context, intent: r.intent, attempt: 0 }, at());
      });
    });
    db.meta.seededConversations = true;
    return true;
  }

  /**
   * Fill in lecture text from the seed file (when this page loaded it) and
   * placeholder pages for lectures uploaded before stage 4. Idempotent.
   */
  function ensureContent() {
    if (!db) return;
    // Seed rows (sample quizzes, attempts, activity, chats) belong to the demo student
    actingUserId = T.mockData.demoUserId;
    try { ensureContentAsDemo(); } finally { actingUserId = null; }
  }

  function ensureContentAsDemo() {
    const seedContent = T.mockLectureContent || null;
    let changed = false;
    db.lectures.forEach(l => {
      if (contentFor(l.id)) return;
      if (seedContent && seedContent[l.id]) {
        db.lectureContent.push({ lectureId: l.id, generated: false, pages: seedContent[l.id].map((pg, i) => ({ page: i + 1, heading: pg.heading, text: pg.text })) });
        l.pageCount = seedContent[l.id].length;
        changed = true;
      } else if (l.status === 'ready') {         // uploaded in the browser, or a seed lecture without seed text
        const pages = placeholderPages(l);
        db.lectureContent.push({ lectureId: l.id, generated: true, pages });
        l.pageCount = pages.length;
        changed = true;
      }
    });
    db.lectures.forEach(l => { if (!l.topic) { l.topic = (T.mockData.lectureTopics || {})[l.id] || l.title; changed = true; } });
    if (ensureQuizzes()) changed = true;
    if (db.meta.fresh && T.mockAI) { seedStudyActivity(); delete db.meta.fresh; changed = true; }
    if (seedConversations()) changed = true;
    if (changed) save();
  }

  /** Common checks for the lecture study tools. Returns { lecture, course, pages } or an ApiError. */
  function studyTarget(lectureId) {
    const lecture = db.lectures.find(l => l.id === lectureId);
    const course = lecture && findCourse(lecture.courseId);
    if (!lecture || !course) return notFound('Lecture', lectureId);
    if (lecture.status !== 'ready') return new ApiError('This lecture isn’t ready yet. Try again when processing has finished.', 409);
    if (!T.mockAI) return new ApiError('The AI service is unavailable.', 503);
    const pages = coursePages(course.id, lecture.id);
    if (!pages.length) return new ApiError('No text was extracted from this lecture.', 422);
    return { lecture, course, pages };
  }

  const clipTitle = (text) => { const t = String(text).replace(/\s+/g, ' ').trim(); return t.length > 60 ? t.slice(0, 59).replace(/\s+\S*$/, '') + '…' : t; };
  const aiFailure = () => new ApiError('The AI Tutor couldn’t answer just now. Please try again.', 503);
  const randomFail = () => (cfg.mockAiFailRate || 0) > 0 && Math.random() < cfg.mockAiFailRate;

  ensureContent();

  /* ======================================================================
     Public services
     ====================================================================== */
  T.api = {
    ApiError,
    request,

    auth: {
      /**
       * POST /api/auth/login → api/auth/login.php
       * body: { email, password, remember }
       * 200 → user · 401 → invalid credentials (never says which field was wrong)
       */
      login: ({ email, password, remember = false } = {}) => request('POST', '/auth/login', {
        body: { email, password, remember },
        mock: () => {
          const user = userByEmail(email);
          if (!user || password !== fixtures.demoPassword) {
            return new ApiError('Incorrect email or password. Check your details and try again.', 401);
          }
          if (user.status !== 'active') {
            return new ApiError('This account has been deactivated. Contact TutorAI support if you think this is a mistake.', 403);
          }
          user.lastLoginAt = nowIso();
          db.session.userId = user.id;       // PHP: session_regenerate_id(); $_SESSION['user_id'] = …
          return user;
        }
      }),

      /**
       * POST /api/auth/register → api/auth/register.php
       * body: { firstName, lastName, email, password, acceptTerms }
       * 201 → user · 409 → email already registered · 422 → validation errors
       */
      register: ({ firstName, lastName = '', email, password, acceptTerms } = {}) => request('POST', '/auth/register', {
        body: { firstName, lastName, email, password, acceptTerms },
        mock: () => {
          if (!acceptTerms) return invalid('Please accept the terms to continue.', { acceptTerms: 'You must accept the terms to create an account.' });
          if (emailTaken(email)) {
            return invalid('That email is already registered.', { email: 'This email is already registered. Try signing in instead.' }, 409);
          }
          const now = nowIso();
          const user = {
            id: nextId('usr', db.users), role: 'student', firstName, lastName, email: normEmail(email),
            institution: '', program: '', yearOfStudy: null, bio: '',
            avatarUrl: null, avatarColor: 'powder', createdAt: now, lastLoginAt: now, status: 'active'
          };
          db.users.push(user);   // the password is discarded, never stored
          db.session.userId = user.id;       // signed in straight away, like register.php will do
          return user;
        }
      }),

      /**
       * POST /api/auth/forgot-password → api/auth/forgot-password.php
       * body: { email }
       * Always 200, whether or not the account exists (no account enumeration).
       */
      requestPasswordReset: ({ email } = {}) => request('POST', '/auth/forgot-password', {
        body: { email },
        mock: () => ({ ok: true })
      }),

      /**
       * POST /api/auth/reset-password → api/auth/reset-password.php
       * body: { token, password }
       * 200 → ok · 410 → token invalid or expired
       */
      resetPassword: ({ token, password } = {}) => request('POST', '/auth/reset-password', {
        body: { token, password },
        mock: () => (token === fixtures.validResetToken
          ? { ok: true }
          : new ApiError('This reset link is invalid or has expired.', 410))
      }),

      /** POST /api/auth/logout → api/auth/logout.php (destroys the PHP session) */
      logout: () => request('POST', '/auth/logout', { mock: () => { db.session.userId = null; return { ok: true }; } }),

      /**
       * GET /api/auth/session → api/auth/session.php
       * 200 → { user } when signed in, { user: null } when not (never 401, so
       * pages can ask without an error). Used by core/auth.js — a UX check only.
       */
      session: () => request('GET', '/auth/session', {
        latency: 0,
        mock: () => {
          const user = sessionUser();
          if (user && user.status !== 'active') { db.session.userId = null; save(); return { user: null }; }
          return { user };
        }
      })
    },

    users: {
      /** GET /api/users/me → api/users/me.php — 401 when signed out */
      me: () => request('GET', '/users/me', { mock: () => sessionUser() }),

      /**
       * PATCH /api/users/me → api/users/update-profile.php
       * body: { firstName, lastName, email, institution, program, yearOfStudy, bio }
       * 200 → updated user · 409 → email already registered · 422 → validation errors
       */
      updateProfile: (changes = {}) => request('PATCH', '/users/me', {
        body: changes,
        mock: () => {
          const user = sessionUser();
          if (changes.email !== undefined && emailTaken(changes.email, user.id)) {
            return invalid('That email is already registered.', { email: 'This email is already registered to another account.' }, 409);
          }
          ['firstName', 'lastName', 'email', 'institution', 'program', 'yearOfStudy', 'bio'].forEach(k => {
            if (changes[k] !== undefined) user[k] = k === 'email' ? normEmail(changes[k]) : changes[k];
          });
          return user;
        }
      }),

      /**
       * POST /api/users/me/password → api/users/change-password.php
       * body: { currentPassword, newPassword }
       * 200 → ok · 422 → current password incorrect / new password reused
       * Mock: the demo password never changes, so sign-in keeps working.
       */
      changePassword: ({ currentPassword, newPassword } = {}) => request('POST', '/users/me/password', {
        body: { currentPassword, newPassword },
        mock: () => {
          if (currentPassword !== fixtures.demoPassword) {
            return invalid('Your current password is incorrect.', { currentPassword: 'Your current password is incorrect.' });
          }
          if (newPassword === currentPassword) {
            return invalid('Choose a new password.', { newPassword: 'Your new password must be different from the current one.' });
          }
          return { ok: true };
        }
      })
    },

    courses: {
      /**
       * GET /api/courses → api/courses/index.php
       * The signed-in student's courses with calculated lectureCount,
       * progress (coverage) and mastery, most recently accessed first.
       */
      list: () => request('GET', '/courses', {
        mock: () => myCourses().map(withStats).sort(byNewest('lastAccessedAt'))
      }),

      /** GET /api/courses/{id} → api/courses/show.php — 404 when unknown or not yours */
      get: (id) => request('GET', `/courses/${encodeURIComponent(id)}`, {
        mock: () => { const c = findCourse(id); return c ? withStats(c) : notFound('Course', id); }
      }),

      /** POST /api/courses/{id}/access → api/courses/access.php — sets lastAccessedAt (called when a course is opened) */
      markAccessed: (id) => request('POST', `/courses/${encodeURIComponent(id)}/access`, {
        latency: 0,
        mock: () => {
          const c = findCourse(id);
          if (!c) return notFound('Course', id);
          c.lastAccessedAt = nowIso();
          return withStats(c);
        }
      }),

      /**
       * POST /api/courses → api/courses/create.php
       * body: { code, title, instructor, term, color, description }
       * 201 → course · 409 → code already used · 422 → validation errors
       */
      create: (data = {}) => request('POST', '/courses', {
        body: data,
        mock: () => {
          const v = validateCourse(data);
          if (v instanceof ApiError) return v;
          const now = nowIso();
          const course = {
            id: nextId('crs', db.courses), userId: me(),
            code: v.code, title: v.title, instructor: v.instructor || '', term: v.term,
            color: v.color, description: v.description || '', status: 'active',
            createdAt: now, lastAccessedAt: now
          };
          db.courses.push(course);
          logActivity('course_created', course.id, `Added ${course.code} — ${course.title}`);
          return withStats(course);
        }
      }),

      /**
       * PATCH /api/courses/{id} → api/courses/update.php
       * body: any of { code, title, instructor, term, color, description, status }
       * 200 → course · 404 · 409 · 422
       */
      update: (id, changes = {}) => request('PATCH', `/courses/${encodeURIComponent(id)}`, {
        body: changes,
        mock: () => {
          const course = findCourse(id);
          if (!course) return notFound('Course', id);
          const v = validateCourse(changes, { partial: true, exceptId: id });
          if (v instanceof ApiError) return v;
          const wasArchived = course.status === 'archived';
          Object.assign(course, v);
          const verb = v.status && (v.status === 'archived') !== wasArchived
            ? (v.status === 'archived' ? 'Archived' : 'Restored')
            : 'Updated';
          logActivity('course_updated', course.id, `${verb} ${course.code} — ${course.title}`);
          return withStats(course);
        }
      }),

      /**
       * DELETE /api/courses/{id} → api/courses/delete.php
       * Also deletes the course's lectures (and their text), quizzes, summaries,
       * notes and AI conversations (ON DELETE CASCADE).
       * 200 → { ok, removed: { lectures, quizzes, conversations } } · 404
       */
      remove: (id) => request('DELETE', `/courses/${encodeURIComponent(id)}`, {
        mock: () => {
          const course = findCourse(id);
          if (!course) return notFound('Course', id);
          const removed = {
            lectures: db.lectures.filter(l => l.courseId === id).length,
            quizzes: db.quizzes.filter(q => q.courseId === id).length
          };
          const lectureIds = new Set(db.lectures.filter(l => l.courseId === id).map(l => l.id));
          const convIds = new Set(db.conversations.filter(c => c.courseId === id).map(c => c.id));
          removed.conversations = convIds.size;
          db.courses = db.courses.filter(c => c.id !== id);
          db.lectures = db.lectures.filter(l => l.courseId !== id);
          const quizIds = new Set(db.quizzes.filter(q => q.courseId === id).map(q => q.id));
          db.quizzes = db.quizzes.filter(q => q.courseId !== id);
          db.attempts = db.attempts.filter(a => !quizIds.has(a.quizId));
          db.lectureContent = db.lectureContent.filter(c => !lectureIds.has(c.lectureId));
          db.summaries = db.summaries.filter(x => x.courseId !== id);
          db.notes = db.notes.filter(x => x.courseId !== id);
          db.conversations = db.conversations.filter(c => !convIds.has(c.id));
          db.messages = db.messages.filter(m => !convIds.has(m.conversationId));
          db.notifications = db.notifications.filter(n => !String(n.link || '').includes(`id=${id}`));
          db.activity.forEach(a => { if (a.courseId === id) a.courseId = null; });   // keep history, drop the link
          logActivity('course_deleted', null, `Deleted ${course.code} — ${course.title}`);
          return { ok: true, removed };
        }
      })
    },

    lectures: {
      /**
       * GET /api/courses/{courseId}/lectures → api/lectures/index.php — newest first.
       * Each lecture carries a calculated bestScore (null if never quizzed).
       */
      list: (courseId) => request('GET', `/courses/${encodeURIComponent(courseId)}/lectures`, {
        mock: () => (findCourse(courseId)
          ? courseLectures(courseId).map(l => ({ ...l, bestScore: lectureBestScore(l.id) })).sort(byNewest('uploadedAt'))
          : notFound('Course', courseId))
      }),

      /**
       * GET /api/lectures/{id} → api/lectures/show.php
       * The lecture with its course, saved summary and notes, and the
       * AI-generated quizzes made from it. 404 when unknown or not yours.
       */
      get: (id) => request('GET', `/lectures/${encodeURIComponent(id)}`, {
        mock: () => {
          const l = db.lectures.find(x => x.id === id);
          const c = l && findCourse(l.courseId);
          if (!l || !c) return notFound('Lecture', id);
          const content = contentFor(id);
          return {
            ...l,
            generatedContent: !!(content && content.generated),
            course: { ...courseRef(c), instructor: c.instructor, term: c.term, status: c.status },
            summary: db.summaries.find(x => x.lectureId === id) || null,
            notes: db.notes.find(x => x.lectureId === id) || null,
            quizzes: db.quizzes.filter(q => q.status === 'ready' && q.lectureIds.includes(id))
              .sort(byNewest('createdAt')).map(quizRow)
          };
        }
      }),

      /**
       * GET /api/lectures/{id}/pages → api/lectures/pages.php
       * Extracted text, one entry per PDF page: { lectureId, generated, pages: [{ page, heading, text }] }.
       */
      pages: (id) => request('GET', `/lectures/${encodeURIComponent(id)}/pages`, {
        mock: () => {
          const l = db.lectures.find(x => x.id === id);
          if (!l || !findCourse(l.courseId)) return notFound('Lecture', id);
          const content = contentFor(id);
          return content ? { lectureId: id, generated: !!content.generated, pages: content.pages } : { lectureId: id, generated: false, pages: [] };
        }
      }),

      /**
       * POST /api/lectures/{id}/view → api/lectures/view.php — logs `lecture_viewed`
       * for the activity chart (at most once per lecture per 30 minutes).
       */
      markViewed: (id) => request('POST', `/lectures/${encodeURIComponent(id)}/view`, {
        latency: 0,
        mock: () => {
          const l = db.lectures.find(x => x.id === id);
          if (!l || !findCourse(l.courseId)) return notFound('Lecture', id);
          const recent = new Date(Date.now() - 30 * 60000).toISOString();
          if (!db.activity.some(a => a.type === 'lecture_viewed' && a.refId === id && a.createdAt > recent)) {
            logActivity('lecture_viewed', l.courseId, `Read “${l.title}”`, id);
          }
          return { ok: true };
        }
      }),

      /**
       * POST /api/courses/{courseId}/lectures → api/lectures/upload.php
       * multipart/form-data: lecture_file, title, lecture_number, description
       * Mock: receives file metadata only — the file is never read or stored.
       * 201 → lecture with status 'uploading' · 404 · 409 (number taken) · 413 (too large) · 422
       */
      create: (courseId, data = {}) => request('POST', `/courses/${encodeURIComponent(courseId)}/lectures`, {
        // Real API: multipart/form-data with the PDF, field names as upload.php reads them from $_POST/$_FILES
        body: cfg.useMockData ? null : multipart({ lecture_file: data.file, title: data.title, lecture_number: data.lectureNumber ?? '', description: data.description || '' }),
        mock: () => {
          const course = findCourse(courseId);
          if (!course) return notFound('Course', courseId);
          const errors = {};
          const title = str(data.title);
          const description = str(data.description);
          const num = data.lectureNumber === '' || data.lectureNumber == null ? null : Number(data.lectureNumber);
          const sizeKb = Number(data.fileSizeKb) || 0;

          if (!title) errors.title = 'Enter a lecture title.';
          else if (title.length > 150) errors.title = 'Use 150 characters or fewer.';
          if (num !== null && !(Number.isInteger(num) && num > 0 && num <= 999)) errors.lectureNumber = 'Use a whole number from 1 to 999.';
          else if (num !== null && courseLectures(courseId).some(l => l.lectureNumber === num && l.status !== 'failed')) {
            errors.lectureNumber = `Lecture ${num} already exists in ${course.code}.`;
          }
          if (description.length > 500) errors.description = 'Use 500 characters or fewer.';
          if (!/\.pdf$/i.test(str(data.fileName))) errors.file = 'Only PDF files can be uploaded.';
          else if (sizeKb <= 0) errors.file = 'This file is empty.';
          else if (sizeKb > MAX_UPLOAD_KB) return invalid('The file is larger than 20 MB.', { file: 'The file is larger than 20 MB.' }, 413);
          if (Object.keys(errors).length) {
            return invalid('Check the highlighted fields.', errors, errors.lectureNumber && /already exists/.test(errors.lectureNumber) ? 409 : 422);
          }

          const lecture = {
            id: nextId('lec', db.lectures), courseId, title, lectureNumber: num, description,
            fileName: str(data.fileName), fileSizeKb: Math.round(sizeKb), pageCount: null,
            status: 'uploading', uploadedAt: nowIso()
          };
          db.lectures.push(lecture);
          course.lastAccessedAt = nowIso();
          return lecture;
        }
      }),

      /**
       * PATCH /api/lectures/{id}/status → api/lectures/status.php
       * In production the server moves a lecture through the pipeline itself
       * and the page polls GET /api/lectures/{id}; the mock lets the upload
       * page drive it. Reaching 'ready' logs activity and sends a notification.
       */
      updateStatus: (id, status) => request('PATCH', `/lectures/${encodeURIComponent(id)}/status`, {
        body: { status },
        latency: 0,
        mock: () => {
          const lecture = db.lectures.find(l => l.id === id);
          if (!lecture || !findCourse(lecture.courseId)) return notFound('Lecture', id);
          if (!LECTURE_STATUSES.includes(status)) return invalid('Unknown status.', { status: 'Unknown status.' });
          lecture.status = status;
          const course = findCourse(lecture.courseId);
          if (status === 'extracting' || status === 'processing' || status === 'ready') {
            lecture.pageCount = lecture.pageCount || estimatePages(lecture.fileSizeKb);
          }
          if (status === 'ready') {
            if (!lecture.topic) lecture.topic = lecture.title;
            if (!contentFor(lecture.id)) {
              const pages = placeholderPages(lecture);   // demo: the PDF is never read
              db.lectureContent.push({ lectureId: lecture.id, generated: true, pages });
              lecture.pageCount = pages.length;
            }
            logActivity('lecture_uploaded', course.id, `Uploaded “${lecture.title}”`);
            notify('lecture', 'Lecture ready', `“${lecture.title}” is ready for the AI Tutor.`, `pages/student/course.html?id=${course.id}&tab=lectures`);
          } else if (status === 'failed') {
            logActivity('lecture_failed', course.id, `Processing failed: “${lecture.title}”`);
          }
          return lecture;
        }
      }),

      /**
       * DELETE /api/lectures/{id} → api/lectures/delete.php
       * Also used to cancel an upload in progress. Quizzes made from the
       * lecture are kept but no longer linked to it.
       */
      remove: (id) => request('DELETE', `/lectures/${encodeURIComponent(id)}`, {
        mock: () => {
          const lecture = db.lectures.find(l => l.id === id);
          if (!lecture || !findCourse(lecture.courseId)) return notFound('Lecture', id);
          db.lectures = db.lectures.filter(l => l.id !== id);
          db.quizzes.forEach(q => { if (q.lectureId === id) q.lectureId = null; });
          db.lectureContent = db.lectureContent.filter(c => c.lectureId !== id);
          db.summaries = db.summaries.filter(x => x.lectureId !== id);
          db.notes = db.notes.filter(x => x.lectureId !== id);
          db.conversations.forEach(c => { if (c.lectureId === id) c.lectureId = null; });
          if (!PIPELINE.includes(lecture.status)) {
            logActivity('lecture_deleted', lecture.courseId, `Deleted “${lecture.title}”`);
          }
          return { ok: true };
        }
      })
    },

    quizzes: {
      /**
       * GET /api/quizzes?courseId=&status=&source= → api/quizzes/index.php
       * Ready quizzes (no drafts) with derived stats: status ('not_started'|
       * 'in_progress'|'completed'), attemptCount, bestScore, lastScore,
       * lastTakenAt, inProgressAttemptId, latestAttemptId. Never questions.
       */
      list: (filter = {}) => {
        const { courseId = null, status = null, source = null } = typeof filter === 'string' ? { courseId: filter } : filter;
        const qs = new URLSearchParams(Object.entries({ courseId, status, source }).filter(([, v]) => v));
        return request('GET', `/quizzes${qs.toString() ? `?${qs}` : ''}`, {
          mock: () => db.quizzes
            .filter(q => q.status === 'ready' && findCourse(q.courseId) && (!courseId || q.courseId === courseId) && (!source || q.source === source))
            .map(quizRow)
            .filter(r => !status || r.status === status)
            .sort((a, b) => (b.status === 'in_progress') - (a.status === 'in_progress')
              || String(b.lastTakenAt || b.createdAt).localeCompare(String(a.lastTakenAt || a.createdAt)))
        });
      },

      /** GET /api/quizzes/{id} → api/quizzes/show.php — metadata + questions WITHOUT answers (drafts included, for the preview). */
      get: (id) => request('GET', `/quizzes/${encodeURIComponent(id)}`, {
        mock: () => { const q = myQuiz(id); return q ? publicQuiz(q) : notFound('Quiz', id); }
      }),

      /**
       * POST {aiBaseUrl}/quizzes/parse — "Quiz me on joins and indexing, 10 hard questions"
       * body: { text, courseId? } → { courseId, lectureIds, count, difficulty, types, focusTerms, understood[] }
       */
      parse: ({ text, courseId = null } = {}) => request('POST', '/quizzes/parse', {
        base: cfg.aiBaseUrl, body: { text, courseId }, latency: cfg.mockLatencyMs,
        mock: () => {
          if (!str(text)) return invalid('Describe the quiz you want.', { text: 'Describe the quiz you want, e.g. “10 hard questions on joins”.' });
          const courses = myCourses().filter(c => c.status !== 'archived' || c.id === courseId).map(c => ({
            id: c.id, code: c.code, title: c.title,
            lectures: courseLectures(c.id).filter(l => l.status === 'ready').map(l => ({ id: l.id, title: l.title, topic: l.topic })),
            pages: coursePages(c.id)
          })).filter(c => c.lectures.length);
          if (!courses.length) return invalid('None of your courses has a ready lecture yet.', { text: 'Upload a lecture first — quizzes are made from lecture pages.' });
          const r = T.mockAI.parseQuizRequest(text, courses, { defaultCourseId: courseId });
          if (!r.courseId) return invalid('Which course is this for?', { text: 'I couldn’t tell which course you mean — name it (e.g. “COMP 3410”) or pick one below.' });
          return r;
        }
      }),

      /**
       * POST {aiBaseUrl}/quizzes/generate → saved as a DRAFT on the server.
       * body: { courseId, lectureIds[], count (5|10|15|20), difficulty, types[],
       *         explanations, timeLimitMin|null, source, focusTerms[], topics[],
       *         fromAttemptId, title }
       *   source 'weak-topics' (topics[]) or 'retry' (fromAttemptId) focus on
       *   the pages behind missed questions.
       * → quiz with questions WITHOUT answers (+ `notice` if fewer could be made)
       * 422: no ready lectures / invalid settings.
       */
      generate: (opts = {}) => request('POST', '/quizzes/generate', {
        base: cfg.aiBaseUrl, body: opts, latency: cfg.mockAiLatencyMs,
        mock: () => {
          const course = findCourse(opts.courseId);
          if (!course) return invalid('Choose a course.', { courseId: 'Choose a course.' });
          const ready = courseLectures(course.id).filter(l => l.status === 'ready');
          if (!ready.length) return invalid(`${course.code} has no ready lectures yet.`, { lectureIds: 'Upload a lecture first — quizzes are made from lecture pages.' });
          const source = QUIZ_SOURCES.includes(opts.source) ? opts.source : 'lecture';
          let lectureIds = (opts.lectureIds || []).filter(id => ready.some(l => l.id === id));
          let priorityPages = [];
          let focusTerms = (opts.focusTerms || []).slice(0, 12);
          let titleHint = null;
          const qi = questionIndex();
          if (source === 'retry' && opts.fromAttemptId) {
            const att = db.attempts.find(a => a.id === opts.fromAttemptId && a.userId === me() && a.status === 'submitted');
            const src = att && myQuiz(att.quizId);
            if (!att || !src || src.courseId !== course.id) return notFound('Attempt', opts.fromAttemptId);
            const missed = att.perQuestion.filter(r => !r.correct).map(r => qi.get(r.questionId)).filter(Boolean);
            if (!missed.length) return invalid('You didn’t miss anything in that attempt.', { fromAttemptId: 'Nothing was missed — try a new quiz instead.' });
            priorityPages = missed.map(q => ({ lectureId: q.lectureId, page: q.page }));
            lectureIds = [...new Set(missed.map(q => q.lectureId))].filter(id => ready.some(l => l.id === id));
            titleHint = `Practise what I missed: ${src.title}`;
          } else if (source === 'weak-topics') {
            const topics = (opts.topics && opts.topics.length ? opts.topics : topicSummary({ courseId: course.id }).filter(t => t.band === 'revise').map(t => t.topic));
            if (!topics.length) return invalid('No topics need revision in this course.', { topics: 'Every topic is at 65% or more — try a regular quiz.' });
            const inTopic = [...qi.values()].filter(q => q.courseId === course.id && topics.includes(q.topic));
            const missedIds = new Set(submittedAttempts({ courseId: course.id }).flatMap(a => a.perQuestion.filter(r => !r.correct).map(r => r.questionId)));
            priorityPages = inTopic.filter(q => missedIds.has(q.id)).map(q => ({ lectureId: q.lectureId, page: q.page }));
            lectureIds = [...new Set(inTopic.map(q => q.lectureId).concat(ready.filter(l => topics.includes(l.topic)).map(l => l.id)))].filter(id => ready.some(l => l.id === id));
            titleHint = `Practise: ${topics.slice(0, 2).join(' & ')}`;
          }
          if (!lectureIds.length) return invalid('Choose at least one ready lecture.', { lectureIds: 'Choose at least one ready lecture.' });
          const count = Number(opts.count) || 10;
          if (!QUIZ_COUNTS.includes(count)) return invalid('Choose 5, 10, 15 or 20 questions.', { count: 'Choose 5, 10, 15 or 20 questions.' });
          const difficulty = QUIZ_LEVELS.includes(opts.difficulty) ? opts.difficulty : null;
          if (!difficulty) return invalid('Choose a difficulty.', { difficulty: 'Choose easy, medium, hard or mixed.' });
          const types = (opts.types || []).filter(t => QUIZ_TYPES.includes(t));
          if (!types.length) return invalid('Choose at least one question type.', { types: 'Choose at least one question type.' });
          const limit = opts.timeLimitMin == null || opts.timeLimitMin === '' ? null : Number(opts.timeLimitMin);
          if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= 120)) return invalid('Time limit must be 1–120 minutes.', { timeLimitMin: 'Use 1–120 minutes, or no limit.' });
          if (randomFail()) return aiFailure();

          const gen = generateQuestionsFor({ courseId: course.id, lectureIds, count, difficulty, types, focusTerms, priorityPages });
          if (!gen.questions.length) return invalid('There isn’t enough text in those lectures to write questions.', { lectureIds: 'Pick lectures with more content.' });
          const lecTitles = lectureIds.map(id => (db.lectures.find(l => l.id === id) || {}).title).filter(Boolean);
          const qz = {
            id: nextId('qz', db.quizzes), courseId: course.id,
            title: str(opts.title).slice(0, 120) || titleHint || (focusTerms.length ? `${course.code}: ${focusTerms.slice(0, 3).join(', ')}` : `${course.code}: ${lecTitles.length === 1 ? lecTitles[0] : `${lecTitles.length} lectures`}`),
            source, lectureIds, difficulty,
            settings: { count, types, explanations: opts.explanations !== false, timeLimitMin: limit },
            status: 'draft', createdAt: nowIso(), questions: gen.questions
          };
          db.quizzes.push(qz);
          return { ...publicQuiz(qz), notice: gen.short ? `Only ${gen.questions.length} of ${count} questions could be written from this material.` : null };
        }
      }),

      /** POST {aiBaseUrl}/quizzes/{id}/regenerate — new questions, same settings (drafts only). */
      regenerate: (id) => request('POST', `/quizzes/${encodeURIComponent(id)}/regenerate`, {
        base: cfg.aiBaseUrl, latency: cfg.mockAiLatencyMs,
        mock: () => {
          const qz = myQuiz(id);
          if (!qz) return notFound('Quiz', id);
          if (qz.status !== 'draft') return new ApiError('Only a draft can be regenerated.', 409);
          const gen = generateQuestionsFor({ courseId: qz.courseId, lectureIds: qz.lectureIds, count: qz.settings.count, difficulty: qz.difficulty, types: qz.settings.types, exclude: qz.questions.map(q => q.prompt) });
          if (!gen.questions.length) return invalid('Couldn’t write new questions from this material.');
          qz.questions = gen.questions;
          return publicQuiz(qz);
        }
      }),

      /** POST {aiBaseUrl}/quizzes/{id}/questions/{qid}/swap — replace one question (drafts only). → the new question (no answer) */
      swapQuestion: (id, questionId) => request('POST', `/quizzes/${encodeURIComponent(id)}/questions/${encodeURIComponent(questionId)}/swap`, {
        base: cfg.aiBaseUrl, latency: Math.round(cfg.mockAiLatencyMs / 2),
        mock: () => {
          const qz = myQuiz(id);
          if (!qz) return notFound('Quiz', id);
          if (qz.status !== 'draft') return new ApiError('Only a draft can be edited.', 409);
          const idx = qz.questions.findIndex(q => q.id === questionId);
          if (idx < 0) return notFound('Question', questionId);
          const old = qz.questions[idx];
          const gen = generateQuestionsFor({ courseId: qz.courseId, lectureIds: qz.lectureIds, count: 1, difficulty: old.difficulty, types: [old.type, ...qz.settings.types.filter(t => t !== old.type)], exclude: qz.questions.map(q => q.prompt) });
          if (!gen.questions.length) return invalid('No other question could be written — this material is used up.');
          qz.questions[idx] = gen.questions[0];
          return E.sanitizeQuestion(gen.questions[0]);
        }
      }),

      /** PATCH /api/quizzes/{id} → api/quizzes/save.php — a draft becomes a saved quiz ("Save for later" / "Start quiz"). */
      save: (id, { title } = {}) => request('PATCH', `/quizzes/${encodeURIComponent(id)}`, {
        body: { status: 'ready', title },
        mock: () => {
          const qz = myQuiz(id);
          if (!qz) return notFound('Quiz', id);
          if (title !== undefined && str(title)) qz.title = str(title).slice(0, 120);
          if (qz.status === 'draft') {
            qz.status = 'ready';
            logActivity('quiz_created', qz.courseId, `Created “${qz.title}” (${qz.questions.length} questions)`, qz.id);
          }
          return quizRow(qz);
        }
      }),

      /** DELETE /api/quizzes/{id} → api/quizzes/delete.php — also deletes its attempts (progress is recalculated). */
      remove: (id) => request('DELETE', `/quizzes/${encodeURIComponent(id)}`, {
        mock: () => {
          const qz = myQuiz(id);
          if (!qz) return notFound('Quiz', id);
          const removed = db.attempts.filter(a => a.quizId === id).length;
          db.quizzes = db.quizzes.filter(q => q.id !== id);
          db.attempts = db.attempts.filter(a => a.quizId !== id);
          return { ok: true, removedAttempts: removed };
        }
      })
    },

    attempts: {
      /**
       * POST /api/quizzes/{id}/attempts → api/attempts/start.php
       * Resumes the open attempt if there is one; otherwise starts a new one
       * (the first in the quiz's order, later ones shuffled — "Retry").
       * → { attempt, quiz } — quiz questions have NO answers.
       */
      start: (quizId, { fresh = false } = {}) => request('POST', `/quizzes/${encodeURIComponent(quizId)}/attempts`, {
        body: { fresh },
        mock: () => {
          const qz = myQuiz(quizId);
          if (!qz) return notFound('Quiz', quizId);
          if (!qz.questions.length) return invalid('This quiz has no questions.');
          if (qz.status === 'draft') { qz.status = 'ready'; logActivity('quiz_created', qz.courseId, `Created “${qz.title}” (${qz.questions.length} questions)`, qz.id); }
          const open = db.attempts.find(a => a.quizId === quizId && a.userId === me() && a.status === 'in_progress');
          if (open) return { attempt: open, quiz: publicQuiz(qz, open), resumed: true };
          const previous = db.attempts.filter(a => a.quizId === quizId && a.userId === me()).length;
          const id = nextId('att', db.attempts);
          const now = nowIso();
          const att = {
            id, quizId, userId: me(), status: 'in_progress', answers: {}, currentIndex: 0, flagged: [],
            order: previous ? E.shuffle(qz.questions.map(q => q.id), id) : qz.questions.map(q => q.id),
            shuffleOptions: previous > 0, startedAt: now,
            deadlineAt: qz.settings.timeLimitMin ? new Date(Date.now() + qz.settings.timeLimitMin * 60000).toISOString() : null,
            submittedAt: null, score: null, total: qz.questions.length, percent: null, perQuestion: []
          };
          db.attempts.push(att);
          return { attempt: att, quiz: publicQuiz(qz, att), resumed: false, fresh };
        }
      }),

      /**
       * GET /api/attempts/{id} → api/attempts/show.php
       * In progress → { attempt, quiz (no answers), expired }
       * Submitted   → { attempt, quiz (WITH answers + explanations), previous, byLecture, byTopic }
       */
      get: (id) => request('GET', `/attempts/${encodeURIComponent(id)}`, {
        mock: () => {
          const att = db.attempts.find(a => a.id === id && a.userId === me());
          const qz = att && myQuiz(att.quizId);
          if (!att || !qz) return notFound('Attempt', id);
          if (att.status !== 'submitted') {
            return { attempt: att, quiz: publicQuiz(qz, att), expired: !!(att.deadlineAt && att.deadlineAt < nowIso()) };
          }
          const byId = new Map(qz.questions.map(q => [q.id, q]));
          const group = (keyOf, label) => {
            const m = new Map();
            att.perQuestion.forEach(r => {
              const q = byId.get(r.questionId); if (!q) return;
              const k = keyOf(q); const g = m.get(k) || { key: k, points: 0, total: 0, ...label(q) };
              g.points += r.points; g.total += 1; m.set(k, g);
            });
            return [...m.values()].map(g => ({ ...g, percent: Math.round((g.points / g.total) * 100) })).sort((a, b) => a.percent - b.percent);
          };
          const previous = db.attempts.filter(a => a.quizId === qz.id && a.userId === me() && a.status === 'submitted' && a.submittedAt < att.submittedAt)
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] || null;
          const lec = (lid) => db.lectures.find(l => l.id === lid);
          return {
            attempt: att,
            quiz: { ...quizRow(qz), questions: att.order.map(qid => byId.get(qid)).filter(Boolean) },
            previous: previous && { id: previous.id, percent: previous.percent, score: previous.score, total: previous.total, submittedAt: previous.submittedAt },
            byLecture: group(q => q.lectureId, q => ({ lectureId: q.lectureId, title: (lec(q.lectureId) || {}).title || 'Removed lecture', lectureNumber: (lec(q.lectureId) || {}).lectureNumber || null })),
            byTopic: group(q => q.topic, q => ({ topic: q.topic }))
          };
        }
      }),

      /**
       * POST /api/attempts/{id}/viewed → api/attempts/viewed.php
       * Records the first time the results were opened (attempts.results_viewed_at)
       * and says whether this call was that first view — the results page only
       * celebrates then. Atomic on the server (UPDATE … WHERE results_viewed_at IS NULL).
       * → { firstView, resultsViewedAt } · 404 · 409 (not submitted yet)
       */
      markViewed: (id) => request('POST', `/attempts/${encodeURIComponent(id)}/viewed`, {
        latency: 0,
        mock: () => {
          const att = db.attempts.find(a => a.id === id && a.userId === me());
          if (!att || !myQuiz(att.quizId)) return notFound('Attempt', id);
          if (att.status !== 'submitted') return new ApiError('This attempt hasn’t been submitted yet.', 409);
          if (att.resultsViewedAt) return { firstView: false, resultsViewedAt: att.resultsViewedAt };
          att.resultsViewedAt = nowIso();
          return { firstView: true, resultsViewedAt: att.resultsViewedAt };
        }
      }),

      /** PATCH /api/attempts/{id} → api/attempts/save.php — autosave { answers, currentIndex, flagged } (in progress only). */
      save: (id, patch = {}) => request('PATCH', `/attempts/${encodeURIComponent(id)}`, {
        body: patch, latency: 0,
        mock: () => {
          const att = db.attempts.find(a => a.id === id && a.userId === me());
          const qz = att && myQuiz(att.quizId);
          if (!att || !qz) return notFound('Attempt', id);
          if (att.status !== 'in_progress') return new ApiError('This attempt was already submitted.', 409);
          const byId = new Map(qz.questions.map(q => [q.id, q]));
          if (patch.answers) {
            const clean = {};
            Object.entries(patch.answers).forEach(([qid, v]) => {
              const q = byId.get(qid); if (!q) return;
              if (q.type === 'multi') clean[qid] = Array.isArray(v) ? [...new Set(v.filter(o => q.options.some(x => x.id === o)))] : [];
              else if (q.type === 'short') clean[qid] = String(v ?? '').slice(0, E.SHORT_MAX);
              else clean[qid] = q.options.some(x => x.id === v) ? v : '';
            });
            att.answers = clean;
          }
          if (Number.isInteger(patch.currentIndex)) att.currentIndex = Math.max(0, Math.min(qz.questions.length - 1, patch.currentIndex));
          if (Array.isArray(patch.flagged)) att.flagged = patch.flagged.filter(q => byId.has(q));
          return { ok: true, savedAt: nowIso() };
        }
      }),

      /** POST /api/attempts/{id}/submit → api/attempts/submit.php — grades from stored answers vs correct answers. */
      submit: (id) => request('POST', `/attempts/${encodeURIComponent(id)}/submit`, {
        mock: () => {
          const att = db.attempts.find(a => a.id === id && a.userId === me());
          const qz = att && myQuiz(att.quizId);
          if (!att || !qz) return notFound('Attempt', id);
          if (att.status === 'submitted') return { id: att.id, percent: att.percent, score: att.score, total: att.total, alreadySubmitted: true };
          const g = E.gradeAttempt(qz.questions, att.answers);
          Object.assign(att, { status: 'submitted', submittedAt: nowIso(), score: g.score, total: g.total, percent: g.percent, perQuestion: g.perQuestion });
          logActivity('quiz_submitted', qz.courseId, attemptTitle(att), att.id);
          return { id: att.id, percent: att.percent, score: att.score, total: att.total };
        }
      }),

      /** GET /api/quizzes/{id}/attempts → api/attempts/index.php — summaries, newest first (no answers). */
      listByQuiz: (quizId) => request('GET', `/quizzes/${encodeURIComponent(quizId)}/attempts`, {
        mock: () => (myQuiz(quizId)
          ? db.attempts.filter(a => a.quizId === quizId && a.userId === me()).map(attemptSummary).sort(byNewest('startedAt'))
          : notFound('Quiz', quizId))
      }),

      /** GET /api/attempts?status=&courseId=&limit= — e.g. in-progress attempts for "Resume", recent attempts for tables. */
      list: ({ status = null, courseId = null, limit = 50 } = {}) => request('GET', `/attempts?${new URLSearchParams(Object.entries({ status, courseId, limit }).filter(([, v]) => v))}`, {
        mock: () => db.attempts
          .filter(a => a.userId === me() && myQuiz(a.quizId) && (!status || a.status === status) && (!courseId || quizById(a.quizId).courseId === courseId))
          .map(attemptSummary)
          .sort((a, b) => String(b.submittedAt || b.startedAt).localeCompare(String(a.submittedAt || a.startedAt)))
          .slice(0, limit)
      })
    },

    analytics: {
      /**
       * GET /api/analytics/summary?courseId=&from=&to= → api/analytics/summary.php
       * { averageScore, quizzesCompleted, coursesStudied, topicsToRevise, inProgress }
       *   averageScore    mean percent of submitted attempts in range
       *   coursesStudied  courses with any activity or attempt in range
       *   topicsToRevise  topics whose average in range is < 65%
       */
      summary: (f = {}) => request('GET', `/analytics/summary?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`, {
        mock: () => {
          const atts = submittedAttempts(f);
          const studied = new Set([
            ...atts.map(a => quizById(a.quizId).courseId),
            ...db.activity.filter(a => a.userId === me() && a.courseId && findCourse(a.courseId) && (!f.courseId || a.courseId === f.courseId) && (!f.from || a.createdAt >= f.from) && (!f.to || a.createdAt <= f.to)).map(a => a.courseId)
          ]);
          const average = avg(atts.map(a => a.percent));
          return {
            averageScore: average === null ? null : Math.round(average),
            quizzesCompleted: atts.length,
            coursesStudied: studied.size,
            topicsToRevise: topicSummary(f).filter(t => t.band === 'revise').length,
            inProgress: db.attempts.filter(a => a.userId === me() && a.status === 'in_progress' && myQuiz(a.quizId) && (!f.courseId || quizById(a.quizId).courseId === f.courseId)).length
          };
        }
      }),

      /** GET /api/analytics/performance → [{ courseId, code, title, color, points: [{ date, percent, attemptId, quizTitle }] }] */
      performanceOverTime: (f = {}) => request('GET', `/analytics/performance?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`, {
        mock: () => {
          const series = {};
          submittedAttempts(f).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).forEach(a => {
            const qz = quizById(a.quizId); const c = findCourse(qz.courseId);
            (series[c.id] = series[c.id] || { courseId: c.id, code: c.code, title: c.title, color: c.color, points: [] })
              .points.push({ date: a.submittedAt, percent: a.percent, attemptId: a.id, quizTitle: qz.title });
          });
          return Object.values(series);
        }
      }),

      /**
       * GET /api/analytics/courses → [{ courseId, code, title, color, progress, mastery, attempts }]
       * Same definitions as course cards, computed from attempts in range:
       * progress = ready lectures with ≥1 question attempted ÷ ready lectures; mastery = mean best per attempted lecture.
       */
      byCourse: (f = {}) => request('GET', `/analytics/courses?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`, {
        mock: () => {
          const results = lectureResults(f);
          return myCourses().filter(c => (!f.courseId || c.id === f.courseId) && (c.status !== 'archived' || f.courseId === c.id)).map(c => {
            const ready = courseLectures(c.id).filter(l => l.status === 'ready');
            const best = ready.map(l => lectureBestScore(l.id, results)).filter(x => x !== null);
            return {
              courseId: c.id, code: c.code, title: c.title, color: c.color,
              progress: ready.length ? Math.round((best.length / ready.length) * 100) : 0,
              mastery: best.length ? Math.round(avg(best)) : null,
              attempts: submittedAttempts({ ...f, courseId: c.id }).length
            };
          });
        }
      }),

      /** GET /api/analytics/topics → [{ topic, courseId, code, lectureId, average, best, attempts, scores, band }] sorted low → high */
      byTopic: (f = {}) => request('GET', `/analytics/topics?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`, {
        mock: () => topicSummary(f).map(t => ({ ...t, code: (findCourse(t.courseId) || {}).code })).sort((a, b) => a.average - b.average)
      }),

      /**
       * GET /api/analytics/activity → { days: [{ date: 'YYYY-MM-DD', total, byType: {…} }], types }
       * One entry per day in range (default last 30 days), from the activity log.
       */
      activity: (f = {}) => request('GET', `/analytics/activity?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`, {
        mock: () => {
          const to = f.to ? new Date(f.to) : new Date();
          const from = f.from ? new Date(f.from) : new Date(to.getTime() - 29 * 86400000);
          const TYPES = ['quiz_submitted', 'lecture_viewed', 'chat_message', 'lecture_uploaded', 'notes_generated'];
          const days = [];
          const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d.setDate(d.getDate() + 1)) {
            days.push({ date: key(d), total: 0, byType: Object.fromEntries(TYPES.map(t => [t, 0])) });
          }
          const idx = new Map(days.map((d, i) => [d.date, i]));
          db.activity.filter(a => a.userId === me() && TYPES.includes(a.type) && (!f.courseId || a.courseId === f.courseId)).forEach(a => {
            const i = idx.get(key(new Date(a.createdAt)));
            if (i === undefined) return;
            days[i].total += 1; days[i].byType[a.type] += 1;
          });
          return { days, types: TYPES };
        }
      })
    },

    activity: {
      /** GET /api/activity?limit= → api/activity/index.php — newest first, with course and link */
      list: ({ limit = 20 } = {}) => request('GET', `/activity?limit=${limit}`, {
        mock: () => {
          const uid = me();
          return db.activity.filter(a => a.userId === uid && !QUIET_ACTIVITY.includes(a.type)).sort(byNewest('createdAt')).slice(0, limit).map(enrichActivity);
        }
      })
    },

    dashboard: {
      /**
       * GET /api/dashboard/summary → api/dashboard/summary.php
       * One call for the student dashboard: greeting data, stats, the
       * course to continue, recent courses and activity, weak topics and
       * the next quiz. Archived courses are left out.
       */
      summary: () => request('GET', '/dashboard/summary', {
        mock: () => {
          const user = sessionUser();
          const courses = myCourses().filter(c => c.status !== 'archived').map(withStats).sort(byNewest('lastAccessedAt'));
          const ids = new Set(courses.map(c => c.id));
          const lectures = db.lectures.filter(l => ids.has(l.courseId));
          const rows = db.quizzes.filter(q => ids.has(q.courseId) && q.status === 'ready').map(quizRow);
          const atts = submittedAttempts().filter(a => ids.has(quizById(a.quizId).courseId));
          const waiting = rows.filter(r => r.status !== 'completed');
          const next = waiting.find(r => r.courseId === (courses[0] || {}).id) || waiting[0];
          const average = avg(atts.map(a => a.percent));
          return {
            user,
            weeklyGoal: weeklyGoal(user.id),
            stats: {
              courses: courses.length,
              archivedCourses: myCourses().length - courses.length,
              lectures: lectures.length,
              readyLectures: lectures.filter(l => l.status === 'ready').length,
              quizzesCompleted: atts.length,
              quizzesWaiting: waiting.length,
              averageScore: average === null ? null : Math.round(average)
            },
            continueCourse: courses[0] || null,
            recentCourses: courses.slice(0, 3),
            recentActivity: db.activity.filter(a => a.userId === user.id && !QUIET_ACTIVITY.includes(a.type)).sort(byNewest('createdAt')).slice(0, 5).map(enrichActivity),
            weakTopics: weakTopics(courses),
            nextQuiz: next || null
          };
        }
      })
    },

    notifications: {
      /** GET /api/notifications */
      list: () => request('GET', '/notifications', {
        mock: () => {
          const user = sessionUser();
          return db.notifications
            .filter(n => n.userId === user.id)
            .sort(byNewest('createdAt'));
        }
      }),
      /** PATCH /api/notifications/read-all */
      markAllRead: () => request('PATCH', '/notifications/read-all', {
        mock: () => {
          const user = sessionUser();
          db.notifications.forEach(n => { if (n.userId === user.id) n.isRead = true; });
          return { ok: true };
        }
      }),
      /** PATCH /api/notifications/{id} */
      markRead: (id) => request('PATCH', `/notifications/${id}`, {
        body: { isRead: true },
        mock: () => {
          const n = db.notifications.find(x => x.id === id && x.userId === me());
          if (!n) return notFound('Notification', id);
          n.isRead = true;
          return n;
        }
      })
    },

    tutor: {
      /**
       * GET /api/tutor/spaces → api/tutor/spaces.php
       * One AI Tutor space per course, computed live (nothing stored):
       * [{ course (with progress, mastery, lectureCount), conversationCount,
       *    lastConversation: { id, title, preview, updatedAt } | null,
       *    suggestion: { kind, label, prompt, lectureId } }]
       * Active courses first (most recently opened), archived last.
       */
      spaces: () => request('GET', '/tutor/spaces', {
        mock: () => {
          const uid = me();
          return myCourses()
            .map(withStats)
            .sort((a, b) => (a.status === 'archived') - (b.status === 'archived') || String(b.lastAccessedAt || '').localeCompare(String(a.lastAccessedAt || '')))
            .map(course => {
              const convs = db.conversations.filter(c => c.userId === uid && c.courseId === course.id).sort(byNewest('updatedAt'));
              const last = convs[0] ? enrichConversation(convs[0]) : null;
              return {
                course,
                conversationCount: convs.length,
                lastConversation: last && { id: last.id, title: last.title, preview: last.preview, updatedAt: last.updatedAt },
                suggestion: suggestionFor(buildLearnerContext(course.id))
              };
            });
        }
      }),

      /**
       * GET /api/tutor/courses/{id}/context → api/tutor/context.php
       * The learner context for one course plus its suggestion — the same
       * data the AI receives, shown in the space's context panel.
       */
      context: (courseId) => request('GET', `/tutor/courses/${encodeURIComponent(courseId)}/context`, {
        mock: () => {
          const lc = buildLearnerContext(courseId);
          return lc ? { ...lc, suggestion: suggestionFor(lc) } : notFound('Course', courseId);
        }
      })
    },

    conversations: {
      /**
       * GET /api/conversations?courseId= → api/conversations/index.php
       * The student's AI Tutor conversations, newest activity first,
       * with course, lecture title, message count and a preview.
       */
      list: ({ courseId } = {}) => request('GET', `/conversations${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`, {
        mock: () => {
          const uid = me();
          return db.conversations
            .filter(c => c.userId === uid && findCourse(c.courseId) && (!courseId || c.courseId === courseId))
            .sort(byNewest('updatedAt'))
            .map(enrichConversation);
        }
      }),

      /** GET /api/conversations/{id} — 404 when unknown or not yours */
      get: (id) => request('GET', `/conversations/${encodeURIComponent(id)}`, {
        mock: () => { const c = findConversation(id); return c ? enrichConversation(c) : notFound('Conversation', id); }
      }),

      /**
       * POST /api/conversations → api/conversations/create.php
       * body: { courseId, lectureId?, title? }. The course is fixed for the
       * conversation's lifetime. 201 → conversation · 404 · 422
       */
      create: ({ courseId, lectureId = null, title = '' } = {}) => request('POST', '/conversations', {
        body: { courseId, lectureId, title },
        mock: () => {
          const course = findCourse(courseId);
          if (!course) return invalid('Choose a course.', { courseId: 'Choose a course.' });
          if (lectureId && !db.lectures.some(l => l.id === lectureId && l.courseId === courseId)) {
            return invalid('That lecture isn’t in this course.', { lectureId: 'That lecture isn’t in this course.' });
          }
          const now = nowIso();
          const conv = { id: nextId('conv', db.conversations), userId: me(), courseId, lectureId: lectureId || null, title: str(title).slice(0, 80) || 'New conversation', createdAt: now, updatedAt: now };
          db.conversations.push(conv);
          return enrichConversation(conv);
        }
      }),

      /** PATCH /api/conversations/{id} → api/conversations/rename.php — body: { title } */
      rename: (id, title) => request('PATCH', `/conversations/${encodeURIComponent(id)}`, {
        body: { title },
        mock: () => {
          const c = findConversation(id);
          if (!c) return notFound('Conversation', id);
          const t = str(title);
          if (!t) return invalid('Enter a name.', { title: 'Enter a name for this conversation.' });
          if (t.length > 80) return invalid('Too long.', { title: 'Use 80 characters or fewer.' });
          c.title = t;
          return enrichConversation(c);
        }
      }),

      /** DELETE /api/conversations/{id} → api/conversations/delete.php — also deletes its messages */
      remove: (id) => request('DELETE', `/conversations/${encodeURIComponent(id)}`, {
        mock: () => {
          if (!findConversation(id)) return notFound('Conversation', id);
          db.conversations = db.conversations.filter(c => c.id !== id);
          db.messages = db.messages.filter(m => m.conversationId !== id);
          return { ok: true };
        }
      })
    },

    messages: {
      /** GET /api/conversations/{id}/messages → api/messages/index.php — oldest first, sources enriched with lecture titles */
      list: (conversationId) => request('GET', `/conversations/${encodeURIComponent(conversationId)}/messages`, {
        mock: () => (findConversation(conversationId)
          ? conversationMessages(conversationId).map(enrichMessage)
          : notFound('Conversation', conversationId))
      }),

      /**
       * PATCH /api/messages/{id} → keeps the part of an answer the student saw
       * before pressing Stop. With SSE streaming the server stores this itself
       * when the stream is cancelled. body: { content, stopped: true }
       */
      update: (id, { content, stopped = false } = {}) => request('PATCH', `/messages/${encodeURIComponent(id)}`, {
        body: { content, stopped },
        latency: 0,
        mock: () => {
          const m = db.messages.find(x => x.id === id);
          if (!m || m.role !== 'assistant' || !findConversation(m.conversationId)) return notFound('Message', id);
          m.content = String(content ?? m.content);
          m.stopped = !!stopped;
          return enrichMessage(m);
        }
      })
    },

    ai: {
      /**
       * POST {aiBaseUrl}/tutor/chat — FastAPI (the LLM key lives only there).
       * body: { conversationId, courseId, lectureId, message, history, learnerContext }
       *   learnerContext — the student's data for THIS course only (progress,
       *   mastery, per-lecture quiz attempts, weak topics, un-quizzed lectures,
       *   unstarted quizzes). FastAPI will build it server-side from MySQL, so
       *   production clients omit it; the mock builds it from the store when
       *   it isn't passed, and rejects one for another course (409).
       * → { message: { id, content, sources: [{ lectureId, page, snippet }],
       *                context: [{ type, label, link }] } }
       *   context = the lecture pages and learner data the answer used
       *   (shown as "Used:" chips; links are root-relative).
       * The real version will stream tokens over Server-Sent Events.
       *
       * Mock extras: creates the conversation when conversationId is empty
       * (returned as `conversation`), saves both messages, and accepts
       * replaceMessageId to regenerate or retry an assistant reply.
       * Errors: 409 if courseId differs from the conversation's course,
       * 422 empty / too long, 503 simulated failure ("/error" in the
       * message fails the first attempt; config.mockAiFailRate fails randomly).
       * A failed reply is stored with status 'error' and returned in
       * err.details.message so the page can show Retry.
       */
      chat: ({ conversationId = null, courseId = null, lectureId = null, message = '', history = [], learnerContext = null, replaceMessageId = null } = {}) => request('POST', '/tutor/chat', {
        base: cfg.aiBaseUrl,
        body: { conversationId, courseId, lectureId, message, history, ...(learnerContext ? { learnerContext } : {}) },
        latency: cfg.mockAiLatencyMs,
        mock: () => {
          if (!T.mockAI) return aiFailure();
          let conv = conversationId ? findConversation(conversationId) : null;
          if (conversationId && !conv) return notFound('Conversation', conversationId);
          if (conv && courseId && courseId !== conv.courseId) {
            return new ApiError('A conversation can’t change course. Start a new conversation instead.', 409);
          }
          const cId = conv ? conv.courseId : courseId;
          if (!findCourse(cId)) return invalid('Choose a course.', { courseId: 'Choose a course.' });
          if (lectureId && !db.lectures.some(l => l.id === lectureId && l.courseId === cId && l.status === 'ready')) {
            return invalid('That lecture isn’t a ready lecture in this course.', { lectureId: 'Choose a ready lecture from this course.' });
          }

          let text, userMessage = null, attempt = 0;
          if (replaceMessageId) {
            const old = conv && db.messages.find(m => m.id === replaceMessageId && m.conversationId === conv.id && m.role === 'assistant');
            if (!old) return notFound('Message', replaceMessageId);
            const before = conversationMessages(conv.id).filter(m => m.createdAt <= old.createdAt && m.role === 'user');
            const prompt = before[before.length - 1];
            if (!prompt) return invalid('Nothing to regenerate.');
            text = prompt.content;
            attempt = (old.attempt || 0) + 1;
            db.messages = db.messages.filter(m => m.id !== old.id);
          } else {
            text = str(message);
            if (!text) return invalid('Type a question first.', { message: 'Type a question first.' });
            if (text.length > MAX_MESSAGE) return invalid(`Keep questions under ${MAX_MESSAGE} characters.`, { message: `Use ${MAX_MESSAGE} characters or fewer.` });
            if (!conv) {
              const now = nowIso();
              conv = { id: nextId('conv', db.conversations), userId: me(), courseId: cId, lectureId: lectureId || null, title: clipTitle(text), createdAt: now, updatedAt: now };
              db.conversations.push(conv);
            }
            userMessage = addMessage(conv, { role: 'user', content: text });
          }
          conv.lectureId = lectureId || null;

          const prior = conversationMessages(conv.id).filter(m => m.id !== (userMessage && userMessage.id));
          const forced = !replaceMessageId && /(^|\s)\/error\b/i.test(text);
          if (forced || randomFail()) {
            const failed = addMessage(conv, { role: 'assistant', content: '', status: 'error', attempt });
            const err = aiFailure();
            err.details = { conversation: enrichConversation(conv), userMessage: userMessage && enrichMessage(userMessage), message: enrichMessage(failed) };
            return err;
          }
          if (learnerContext && learnerContext.courseId !== conv.courseId) {
            return new ApiError('Learner context must be for this conversation’s course.', 409);
          }
          logActivity('chat_message', conv.courseId, `Asked the AI Tutor: ${clipTitle(text)}`, conv.id);
          // "Quiz me on …" → the shared quiz generator makes a draft and the answer links its preview
          const reply = (T.mockAI.isQuizRequest(text) && !replaceMessageId && quizReply(conv, text))
            || generateReply(conv, text.replace(/(^|\s)\/error\b/gi, ' '), prior, attempt, learnerContext);
          const saved = addMessage(conv, { role: 'assistant', content: reply.content, sources: reply.sources, context: reply.context, intent: reply.intent, attempt });
          return { conversation: enrichConversation(conv), userMessage: userMessage && enrichMessage(userMessage), message: enrichMessage(saved) };
        }
      }),

      /**
       * POST {aiBaseUrl}/lectures/{id}/summary — FastAPI. body: { options }
       * Saves (replaces) the lecture's summary. → { id, lectureId, courseId, content, sources, createdAt }
       */
      summarize: ({ lectureId, options = {} } = {}) => request('POST', `/lectures/${encodeURIComponent(lectureId)}/summary`, {
        base: cfg.aiBaseUrl, body: { options }, latency: cfg.mockAiLatencyMs,
        mock: () => {
          const t = studyTarget(lectureId);
          if (t instanceof ApiError) return t;
          if (randomFail()) return aiFailure();
          const r = T.mockAI.summarize({ course: t.course, lecture: t.lecture, pages: t.pages });
          T.mockAI.assertCourseIsolation(r.sources, [t.lecture.id], t.course.code);
          db.summaries = db.summaries.filter(x => x.lectureId !== lectureId);
          const rec = { id: nextId('sum', db.summaries), lectureId, courseId: t.course.id, content: r.content, sources: r.sources, createdAt: nowIso() };
          db.summaries.push(rec);
          return { ...rec, sources: enrichSources(rec.sources) };
        }
      }),

      /**
       * POST {aiBaseUrl}/lectures/{id}/notes — FastAPI. body: { options }
       * Saves (replaces) the lecture's study notes (Markdown). → { id, lectureId, courseId, content, sources, createdAt }
       */
      studyNotes: ({ lectureId, options = {} } = {}) => request('POST', `/lectures/${encodeURIComponent(lectureId)}/notes`, {
        base: cfg.aiBaseUrl, body: { options }, latency: cfg.mockAiLatencyMs,
        mock: () => {
          const t = studyTarget(lectureId);
          if (t instanceof ApiError) return t;
          if (randomFail()) return aiFailure();
          const r = T.mockAI.studyNotes({ course: t.course, lecture: t.lecture, pages: t.pages });
          T.mockAI.assertCourseIsolation(r.sources, [t.lecture.id], t.course.code);
          db.notes = db.notes.filter(x => x.lectureId !== lectureId);
          const rec = { id: nextId('note', db.notes), lectureId, courseId: t.course.id, content: r.content, sources: r.sources, createdAt: nowIso() };
          db.notes.push(rec);
          logActivity('notes_generated', t.course.id, `Created study notes for “${t.lecture.title}”`, t.lecture.id);
          return { ...rec, sources: enrichSources(rec.sources) };
        }
      }),

      /**
       * POST {aiBaseUrl}/lectures/{id}/quiz — kept for the stage 4 contract.
       * Now a thin wrapper over quizzes.generate (the one shared generator):
       * returns a DRAFT quiz (no answers) for the preview page.
       */
      generateQuiz: ({ lectureId, options = {} } = {}) => {
        const l = db.lectures.find(x => x.id === lectureId);
        return T.api.quizzes.generate({ courseId: l && l.courseId, lectureIds: [lectureId], source: 'ai', count: options.count || 10, difficulty: options.difficulty || 'medium', types: options.types || ['mcq', 'true_false'], explanations: true });
      }
    },

    /**
     * Admin console (pages/admin/dashboard.html). Every method answers 403
     * unless the signed-in user's role is 'admin' — PHP checks the role in
     * MySQL on each request. Admins get account details and COUNTS only:
     * never chat messages, notes, lecture text or quiz answers.
     */
    admin: {
      /**
       * GET /api/admin/summary → api/admin/summary.php
       * { students, newStudents30d, deactivated, activeUsers, activeWindowDays,
       *   courses, archivedCourses, lectures, lecturesByStatus: { ready, inProgress, failed } }
       * activeUsers = active student accounts that signed in or had any
       * activity in the last 7 days.
       */
      summary: () => request('GET', '/admin/summary', {
        mock: () => {
          const denied = requireAdmin(); if (denied) return denied;
          const students = db.users.filter(u => u.role === 'student');
          const since = (days) => new Date(Date.now() - days * 86400000).toISOString();
          const active = students.filter(u => u.status === 'active' && lastActiveAt(u) >= since(7));
          const lectures = db.lectures;
          return {
            students: students.length,
            newStudents30d: students.filter(u => u.createdAt >= since(30)).length,
            deactivated: students.filter(u => u.status !== 'active').length,
            activeUsers: active.length,
            activeWindowDays: 7,
            courses: db.courses.length,
            archivedCourses: db.courses.filter(c => c.status === 'archived').length,
            lectures: lectures.length,
            lecturesByStatus: {
              ready: lectures.filter(l => l.status === 'ready').length,
              inProgress: lectures.filter(l => PIPELINE.includes(l.status)).length,
              failed: lectures.filter(l => l.status === 'failed').length
            }
          };
        }
      }),

      /**
       * GET /api/admin/users?q=&status= → api/admin/users.php
       * Student accounts with usage COUNTS (courses, lectures, quizzes taken,
       * AI Tutor conversations) — never their content. Newest accounts first.
       */
      users: ({ q = '', status = '' } = {}) => request('GET', `/admin/users?${new URLSearchParams(Object.entries({ q, status }).filter(([, v]) => v))}`, {
        mock: () => {
          const denied = requireAdmin(); if (denied) return denied;
          const term = str(q).toLowerCase();
          return db.users
            .filter(u => u.role === 'student')
            .filter(u => !status || u.status === status)
            .filter(u => !term || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term))
            .sort(byNewest('createdAt'))
            .map(adminUserRow);
        }
      }),

      /**
       * PATCH /api/admin/users/{id}/status → api/admin/user-status.php
       * body: { status: 'active'|'deactivated', reason } — reason required (5–300 chars),
       * stored in admin_actions with the admin's id. Deactivated students can't
       * sign in and their open sessions end. 403 · 404 · 409 (already in that state) · 422
       */
      setUserStatus: (id, { status, reason } = {}) => request('PATCH', `/admin/users/${encodeURIComponent(id)}/status`, {
        body: { status, reason },
        mock: () => {
          const denied = requireAdmin(); if (denied) return denied;
          const user = db.users.find(u => u.id === id && u.role === 'student');
          if (!user) return notFound('Student', id);
          const why = str(reason);
          const errors = {};
          if (!['active', 'deactivated'].includes(status)) errors.status = 'Choose activate or deactivate.';
          if (!why) errors.reason = 'Give a reason for this change.';
          else if (why.length < 5) errors.reason = 'Use at least 5 characters.';
          else if (why.length > 300) errors.reason = 'Use 300 characters or fewer.';
          if (Object.keys(errors).length) return invalid('Check the highlighted fields.', errors);
          if (user.status === status) return invalid(`This account is already ${status}.`, {}, 409);
          const from = user.status;
          user.status = status;
          user.statusChangedAt = nowIso();
          db.adminActions.push({ id: nextId('adm', db.adminActions), adminId: me(), userId: id, action: status === 'active' ? 'activate' : 'deactivate', fromStatus: from, toStatus: status, reason: why, createdAt: user.statusChangedAt });
          if (status !== 'active' && db.session.userId === id) db.session.userId = null;
          return adminUserRow(user);
        }
      }),

      /**
       * GET /api/admin/lectures → api/admin/lectures.php
       * Processing pipeline across all students: counts per status, plus the
       * uploads still processing and recent failures (title, size, course code,
       * student — never the lecture text).
       */
      lectures: () => request('GET', '/admin/lectures', {
        mock: () => {
          const denied = requireAdmin(); if (denied) return denied;
          const counts = Object.fromEntries(LECTURE_STATUSES.map(st => [st, db.lectures.filter(l => l.status === st).length]));
          const items = db.lectures
            .filter(l => l.status !== 'ready')
            .sort(byNewest('uploadedAt'))
            .slice(0, 20)
            .map(l => {
              const course = db.courses.find(c => c.id === l.courseId);
              const owner = course && userById(course.userId);
              return { id: l.id, title: l.title, status: l.status, fileSizeKb: l.fileSizeKb, uploadedAt: l.uploadedAt, course: course ? { id: course.id, code: course.code } : null, student: owner ? { id: owner.id, name: fullName(owner) } : null };
            });
          return { counts, items };
        }
      }),

      /**
       * GET /api/admin/activity?limit= → api/admin/activity.php
       * Recent events across all students as generic labels ("Asked the AI
       * Tutor", "Submitted a quiz") — no message text, scores or answers.
       */
      activity: ({ limit = 12 } = {}) => request('GET', `/admin/activity?limit=${limit}`, {
        mock: () => {
          const denied = requireAdmin(); if (denied) return denied;
          return db.activity
            .filter(a => (userById(a.userId) || {}).role === 'student')
            .sort(byNewest('createdAt'))
            .slice(0, Math.min(50, limit))
            .map(a => {
              const u = userById(a.userId);
              const course = a.courseId && db.courses.find(c => c.id === a.courseId);
              return { id: a.id, type: a.type, label: ADMIN_ACTIVITY_LABEL[a.type] || 'Activity', createdAt: a.createdAt, student: { id: u.id, name: fullName(u) }, course: course ? { code: course.code } : null };
            });
        }
      })
    },

    settings: {
      /** GET /api/settings → api/settings/show.php — defaults until the student saves */
      get: () => request('GET', '/settings', { mock: () => userSettings(me()) }),

      /**
       * PATCH /api/settings → api/settings/update.php
       * body: { notifications: { lectureReady, quizReady, weeklySummary, studyReminders },
       *         weeklyGoalDays (1–7), reducedMotion ('system'|'reduce') } — any subset
       * 200 → settings · 422 → validation errors
       */
      update: (changes = {}) => request('PATCH', '/settings', {
        body: changes,
        mock: () => {
          const errors = {};
          if (changes.weeklyGoalDays !== undefined && !(Number.isInteger(changes.weeklyGoalDays) && changes.weeklyGoalDays >= 1 && changes.weeklyGoalDays <= 7)) {
            errors.weeklyGoalDays = 'Choose between 1 and 7 days.';
          }
          if (changes.reducedMotion !== undefined && !['system', 'reduce'].includes(changes.reducedMotion)) {
            errors.reducedMotion = 'Choose a motion setting.';
          }
          if (Object.keys(errors).length) return invalid('Check the highlighted settings.', errors);
          const uid = me();
          let row = db.settings.find(x => x.userId === uid);
          if (!row) { row = { userId: uid }; db.settings.push(row); }
          const cur = userSettings(uid);
          if (changes.notifications) {
            row.notifications = { ...cur.notifications };
            Object.keys(DEFAULT_SETTINGS.notifications).forEach(k => {
              if (typeof changes.notifications[k] === 'boolean') row.notifications[k] = changes.notifications[k];
            });
          }
          if (changes.weeklyGoalDays !== undefined) row.weeklyGoalDays = changes.weeklyGoalDays;
          if (changes.reducedMotion !== undefined) row.reducedMotion = changes.reducedMotion;
          row.updatedAt = nowIso();
          return userSettings(uid);
        }
      })
    },

    account: {
      /**
       * GET /api/account/export → api/account/export.php
       * Everything stored about the signed-in student, as JSON (never passwords).
       */
      export: () => request('GET', '/account/export', {
        mock: () => {
          const uid = me();
          const courses = myCourses();
          const courseIds = new Set(courses.map(c => c.id));
          const lectures = db.lectures.filter(l => courseIds.has(l.courseId));
          const lectureIds = new Set(lectures.map(l => l.id));
          const quizzes = db.quizzes.filter(q => courseIds.has(q.courseId) && q.status !== 'draft');
          const convs = db.conversations.filter(c => c.userId === uid);
          const convIds = new Set(convs.map(c => c.id));
          return {
            exportedAt: nowIso(),
            format: 'TutorAI data export v1',
            profile: sessionUser(),
            settings: userSettings(uid),
            courses,
            lectures,
            lectureText: db.lectureContent.filter(c => lectureIds.has(c.lectureId)),
            quizzes,
            attempts: db.attempts.filter(a => a.userId === uid),
            conversations: convs,
            messages: db.messages.filter(m => convIds.has(m.conversationId)),
            summaries: db.summaries.filter(x => lectureIds.has(x.lectureId)),
            notes: db.notes.filter(x => lectureIds.has(x.lectureId)),
            activity: db.activity.filter(a => a.userId === uid),
            notifications: db.notifications.filter(n => n.userId === uid)
          };
        }
      }),

      /** DELETE /api/conversations → api/conversations/delete-all.php — every AI Tutor chat and its messages */
      deleteAllChats: () => request('DELETE', '/conversations', {
        mock: () => {
          const uid = me();
          const ids = new Set(db.conversations.filter(c => c.userId === uid).map(c => c.id));
          db.conversations = db.conversations.filter(c => !ids.has(c.id));
          db.messages = db.messages.filter(m => !ids.has(m.conversationId));
          return { deleted: ids.size };
        }
      }),

      /**
       * DELETE /api/account → api/account/delete.php
       * body: { confirm: 'DELETE' }. Removes the student and everything they own,
       * then ends the session. (Demo: only this browser's store is affected.)
       */
      remove: ({ confirm } = {}) => request('DELETE', '/account', {
        body: { confirm },
        mock: () => {
          if (confirm !== 'DELETE') return invalid('Type DELETE to confirm.', { confirm: 'Type DELETE to confirm.' });
          const uid = me();
          const courseIds = new Set(myCourses().map(c => c.id));
          const lectureIds = new Set(db.lectures.filter(l => courseIds.has(l.courseId)).map(l => l.id));
          const quizIds = new Set(db.quizzes.filter(q => courseIds.has(q.courseId)).map(q => q.id));
          const convIds = new Set(db.conversations.filter(c => c.userId === uid).map(c => c.id));
          db.messages = db.messages.filter(m => !convIds.has(m.conversationId));
          db.conversations = db.conversations.filter(c => c.userId !== uid);
          db.attempts = db.attempts.filter(a => a.userId !== uid && !quizIds.has(a.quizId));
          db.quizzes = db.quizzes.filter(q => !quizIds.has(q.id));
          ['lectureContent', 'summaries', 'notes'].forEach(t => { db[t] = db[t].filter(x => !lectureIds.has(x.lectureId)); });
          db.lectures = db.lectures.filter(l => !lectureIds.has(l.id));
          db.courses = db.courses.filter(c => !courseIds.has(c.id));
          ['activity', 'notifications', 'settings'].forEach(t => { db[t] = db[t].filter(x => x.userId !== uid); });
          db.users = db.users.filter(u => u.id !== uid);
          db.session.userId = null;
          return { ok: true };
        }
      })
    },

    dev: {
      /**
       * Mock only: throw away every change and restore mock-data.js.
       * No backend equivalent (rejects with 501 when useMockData is false).
       */
      resetMockData: () => {
        if (!cfg.useMockData) return Promise.reject(new ApiError('Reset is only available in mock mode.', 501));
        try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
        const keep = db.session.userId;
        db = seed();
        // Stay signed in if that account exists in the sample data
        if (keep && db.users.some(u => u.id === keep)) db.session.userId = keep;
        ensureContent();
        save();
        return wait(cfg.mockLatencyMs).then(() => ({ ok: true }));
      },
      /** Mock only: the raw store, for debugging in the console. */
      inspect: () => clone(db)
    }
  };
})(window.TutorAI);
