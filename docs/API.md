# TutorAI API contract

Every page gets its data through `TutorAI.api` (`assets/js/services/api.js`). Each method below has a mock handler today (`config.useMockData = true`). With `useMockData = false` it calls the endpoint shown instead, and the pages don't change.

- **PHP + MySQL**: `config.apiBaseUrl` (default `/api`), e.g. `/api/courses` → `api/courses/index.php`.
- **FastAPI (AI)**: `config.aiBaseUrl` (default `http://localhost:8000`). The LLM key lives only here, never in the frontend.

IDs are prefixed strings (`usr_1001`, `crs_2001`, `lec_3001`, `qz_4001`, `q_…`, `att_…`, `conv_…`, `msg_…`, `act_…`, `ntf_…`). The schema is in [`schema.sql`](schema.sql).

## Conventions

| | |
|---|---|
| Auth | PHP session cookie (`credentials: 'include'`). Every endpoint except `/api/auth/*` returns **401** without a session (or if the account has been deactivated, which also ends the session). Student endpoints only return rows the signed-in student owns (**404** for someone else's id, so ids can't be probed). FastAPI checks the same session (it forwards the cookie to `GET /api/auth/session`, or reads a shared session store) and answers 401 the same way. |
| Roles | `users.role` is `student` or `admin`, read from MySQL on every request (never trusted from the client). Every `/api/admin/*` endpoint returns **403** unless the role is `admin`. `core/auth.js` only mirrors this for the UX. |
| Request body | JSON (`Content-Type: application/json`), except the lecture upload, which is `multipart/form-data`. |
| Success | `200`/`201` with `{ "success": true, "data": … }`. `api.js` unwraps `data`. |
| Errors | `{ "success": false, "message": "…", "errors": { "field": "message" } }`, with status `401` (signed out), `403`, `404`, `409` (conflict, e.g. duplicate), `410` (expired link), `413` (file too large), `422` (validation), `503` (AI unavailable). `validation.js` puts `errors.*` messages under the matching form fields. |
| Field names | JSON uses camelCase (`lectureNumber`). HTML form `name`s are snake_case (`lecture_number`), which is what PHP reads from `$_POST`. Each page script maps one to the other. |
| Dates | ISO-8601 UTC strings. |
| Computed values | Course `progress`/`mastery`, quiz status and best score, topic averages and weekly goal progress are calculated on every request and never stored. The definitions are in [GUIDE.md](GUIDE.md#analytics-definitions). |

Notation: `user` = `{ id, role, firstName, lastName, email, institution, program, yearOfStudy, bio, avatarUrl, avatarColor, status, createdAt, lastLoginAt }`, plus `title` for admins (no password fields, ever). `status` is `active` or `deactivated`.

---

## Auth: `api.auth`

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `login({ email, password, remember })` | POST | `/api/auth/login` → `auth/login.php` | `{ email, password, remember }` | `user`. Regenerates the session id. **401** with one generic message (never says which field was wrong). **403** if the account is deactivated. The client sends the user to their role's home (`pages/student/dashboard.html` or `pages/admin/dashboard.html`), or to `?next=` if it belongs to that role. |
| `register({ firstName, lastName, email, password, acceptTerms })` | POST | `/api/auth/register` → `auth/register.php` | same | **201** `user`. Stores `password_hash()` and signs in. **409** email taken, **422** validation. |
| `requestPasswordReset({ email })` | POST | `/api/auth/forgot-password` → `auth/forgot-password.php` | `{ email }` | Always `{ ok: true }` (no account enumeration). Emails a single-use link; only the token's hash is stored. |
| `resetPassword({ token, password })` | POST | `/api/auth/reset-password` → `auth/reset-password.php` | `{ token, password }` | `{ ok: true }`. **410** invalid or expired token. |
| `logout()` | POST | `/api/auth/logout` → `auth/logout.php` | none | `{ ok: true }`. Destroys the session. |
| `session()` | GET | `/api/auth/session` → `auth/session.php` | none | `{ user }` (including `role`), or `{ user: null }` when signed out or deactivated (never 401). Used by `core/auth.js` (`requireAuth` / `requireRole`), a UX check only. |

## Profile: `api.users`

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `me()` | GET | `/api/users/me` → `users/me.php` | none | `user` |
| `updateProfile(changes)` | PATCH | `/api/users/me` → `users/update-profile.php` | any of `{ firstName, lastName, email, institution, program, yearOfStudy, bio }` | `user`. **409** email taken, **422**. |
| `changePassword({ currentPassword, newPassword })` | POST | `/api/users/me/password` → `users/change-password.php` | same | `{ ok: true }`. **422** wrong current password or password reused. |

## Settings & account: `api.settings`, `api.account`

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `settings.get()` | GET | `/api/settings` → `settings/show.php` | none | `{ notifications: { lectureReady, quizReady, weeklySummary, studyReminders }, weeklyGoalDays, reducedMotion, updatedAt }` (defaults if never saved) |
| `settings.update(changes)` | PATCH | `/api/settings` → `settings/update.php` | any subset of the above (`weeklyGoalDays` 1–7, `reducedMotion` `'system'`/`'reduce'`) | settings. **422** out of range. |
| `account.export()` | GET | `/api/account/export` → `account/export.php` | none | `{ exportedAt, format, profile, settings, courses, lectures, lectureText, quizzes, attempts, conversations, messages, summaries, notes, activity, notifications }`. Never includes passwords. |
| `account.deleteAllChats()` | DELETE | `/api/conversations` → `conversations/delete-all.php` | none | `{ deleted }` (conversations removed, with their messages) |
| `account.remove({ confirm })` | DELETE | `/api/account` → `account/delete.php` | `{ confirm: "DELETE" }` | `{ ok: true }`. Deletes the user (cascades to all their data and files) and ends the session. **422** without the confirmation. |

## Courses: `api.courses`

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `list()` | GET | `/api/courses` → `courses/index.php` | none | `course[]`, most recently opened first. Each course is `{ id, code, title, instructor, term, color, description, status, createdAt, lastAccessedAt }` plus computed `lectureCount, readyLectureCount, attemptedLectureCount, quizCount, completedQuizCount, averageScore, progress, mastery`. |
| `get(id)` | GET | `/api/courses/{id}` → `courses/show.php` | none | `course`. **404**. |
| `markAccessed(id)` | POST | `/api/courses/{id}/access` → `courses/access.php` | none | `course` (sets `lastAccessedAt`) |
| `create(data)` | POST | `/api/courses` → `courses/create.php` | `{ code, title, instructor, term, color, description }` | **201** `course`. **409** code already used by this student, **422**. |
| `update(id, changes)` | PATCH | `/api/courses/{id}` → `courses/update.php` | any of the create fields, plus `status` | `course`. **404 / 409 / 422**. |
| `remove(id)` | DELETE | `/api/courses/{id}` → `courses/delete.php` | none | `{ ok, removed: { lectures, quizzes, conversations } }`. Cascades (see schema). |

## Lectures: `api.lectures`

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `list(courseId)` | GET | `/api/courses/{courseId}/lectures` → `lectures/index.php` | none | `lecture[]` `{ id, courseId, title, lectureNumber, topic, description, fileName, fileSizeKb, pageCount, status, uploadedAt, bestScore }` |
| `get(id)` | GET | `/api/lectures/{id}` → `lectures/show.php` | none | `lecture` with `course`, saved `summary`, `notes` and the quizzes that use it |
| `pages(id)` | GET | `/api/lectures/{id}/pages` → `lectures/pages.php` | none | `{ lectureId, generated, pages: [{ page, heading, text }] }` (Markdown) |
| `markViewed(id)` | POST | `/api/lectures/{id}/view` → `lectures/view.php` | none | `{ ok }`. Logs `lecture_viewed` at most every 30 minutes. |
| `create(courseId, data)` | POST | `/api/courses/{courseId}/lectures` → `lectures/upload.php` | **`multipart/form-data`**: `lecture_file` (PDF, ≤ 20 MB), `title`, `lecture_number`, `description` | **201** `lecture` with `status: 'uploading'`. **409** number already used, **413** too large, **422** not a PDF / empty / validation. |
| `updateStatus(id, status)` | PATCH | `/api/lectures/{id}/status` → `lectures/status.php` | `{ status }` | `lecture`. In production the server runs the pipeline (`uploading → extracting → processing → ready \| failed`) and the page polls `GET /api/lectures/{id}`; the mock lets the upload page drive it. |
| `remove(id)` | DELETE | `/api/lectures/{id}` → `lectures/delete.php` | none | `{ ok }`. Also cancels an upload in progress. |

## Quizzes: `api.quizzes`

Questions are sent **without** `correct`, `explanation`, `model` or `keywords` everywhere except a submitted attempt's results.

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `list({ courseId, status, source })` | GET | `/api/quizzes?courseId=&status=&source=` → `quizzes/index.php` | none | Saved quizzes (no drafts) with computed `status` (`not_started`/`in_progress`/`completed`), `attemptCount, bestScore, lastScore, lastTakenAt, inProgressAttemptId, latestAttemptId`. No questions. |
| `get(id)` | GET | `/api/quizzes/{id}` → `quizzes/show.php` | none | quiz metadata and questions without answers (drafts included, for the preview) |
| `parse({ text, courseId })` | POST | **FastAPI** `/quizzes/parse` | `{ text, courseId? }`, e.g. "Quiz me on joins, 10 hard questions" | `{ courseId, lectureIds, count, difficulty, types, focusTerms, understood[], label }` |
| `generate(opts)` | POST | **FastAPI** `/quizzes/generate` | `{ courseId, lectureIds[], count (5/10/15/20), difficulty, types[], explanations, timeLimitMin, source ('lecture'/'ai'/'weak-topics'/'retry'), focusTerms[], topics[], fromAttemptId, title }` | **draft** quiz (no answers), plus `notice` if fewer questions could be written. **422** no ready lectures, lecture from another course, no types. |
| `regenerate(id)` | POST | **FastAPI** `/quizzes/{id}/regenerate` | none | the draft with new questions (drafts only) |
| `swapQuestion(id, questionId)` | POST | **FastAPI** `/quizzes/{id}/questions/{qid}/swap` | none | the replacement question (no answer) |
| `save(id, { title })` | PATCH | `/api/quizzes/{id}` → `quizzes/save.php` | `{ status: 'ready', title }` | quiz (draft → saved) |
| `remove(id)` | DELETE | `/api/quizzes/{id}` → `quizzes/delete.php` | none | `{ ok }`. Deletes its attempts, so progress is recalculated. |

## Attempts: `api.attempts`

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `start(quizId, { fresh })` | POST | `/api/quizzes/{id}/attempts` → `attempts/start.php` | `{ fresh }` | `{ attempt, quiz (no answers), resumed }`. Resumes the open attempt, otherwise starts a new one (retries shuffle the order). Sets `deadlineAt` for timed quizzes. |
| `get(id)` | GET | `/api/attempts/{id}` → `attempts/show.php` | none | In progress: `{ attempt, quiz (no answers), expired }`. Submitted: `{ attempt, quiz (with answers and explanations), previous, byLecture, byTopic }`. |
| `markViewed(id)` | POST | `/api/attempts/{id}/viewed` → `attempts/viewed.php` | none | `{ firstView, resultsViewedAt }`. Sets `results_viewed_at` the first time only (`UPDATE … WHERE results_viewed_at IS NULL`), so the results page celebrates once per attempt. **409** if not submitted. |
| `save(id, patch)` | PATCH | `/api/attempts/{id}` → `attempts/save.php` | `{ answers: { qid: value }, currentIndex, flagged[] }` | `{ ok }` (autosave). **409** if already submitted. |
| `submit(id)` | POST | `/api/attempts/{id}/submit` → `attempts/submit.php` | none | `{ id, score, total, percent }`. Grades on the server from stored answers (rules in [GUIDE.md](GUIDE.md#grading-rules-servicesquiz-enginejs)). Logs `quiz_submitted`. |
| `listByQuiz(quizId)` | GET | `/api/quizzes/{id}/attempts` → `attempts/index.php` | none | attempt summaries, newest first (no answers) |
| `list({ status, courseId, limit })` | GET | `/api/attempts?status=&courseId=&limit=` | none | attempt summaries (Resume banners, recent attempts tables) |

## Analytics & dashboard: `api.analytics`, `api.dashboard`, `api.activity`

All analytics calls take a filter `f = { courseId?, from?, to? }` (ISO dates).

| Method | HTTP | Endpoint | Response |
|---|---|---|---|
| `analytics.summary(f)` | GET | `/api/analytics/summary` | `{ averageScore, quizzesCompleted, coursesStudied, topicsToRevise, inProgress }` |
| `analytics.performanceOverTime(f)` | GET | `/api/analytics/performance` | `[{ courseId, code, title, color, points: [{ date, percent, attemptId, quizTitle }] }]` |
| `analytics.byCourse(f)` | GET | `/api/analytics/courses` | `[{ courseId, code, title, color, progress, mastery, attempts }]` |
| `analytics.byTopic(f)` | GET | `/api/analytics/topics` | `[{ topic, courseId, code, lectureId, average, best, attempts, scores, band }]`, lowest first |
| `analytics.activity(f)` | GET | `/api/analytics/activity` | `{ days: [{ date, total, byType }], types }` |
| `dashboard.summary()` | GET | `/api/dashboard/summary` | `{ user, weeklyGoal: { goalDays, studiedDays, weekStart }, stats, continueCourse, recentCourses, recentActivity, weakTopics, nextQuiz }` |
| `activity.list({ limit })` | GET | `/api/activity?limit=` | `[{ id, type, courseId, refId, title, createdAt, course, link }]` |

## Notifications: `api.notifications`

| Method | HTTP | Endpoint | Response |
|---|---|---|---|
| `list()` | GET | `/api/notifications` | `[{ id, type, title, message, link, isRead, createdAt }]`, newest first |
| `markAllRead()` | PATCH | `/api/notifications/read-all` | `{ ok }` |
| `markRead(id)` | PATCH | `/api/notifications/{id}` | the notification (`{ isRead: true }`) |

Notifications are created by the server (for example, a lecture reaching `ready`) only if the student's settings allow that type.

## AI Tutor: `api.tutor`, `api.conversations`, `api.messages`, `api.ai`

Every AI request is scoped to **one course**: answers use only that course's ready lecture text and the student's results in that course. Any lecture or conversation from another course is rejected (**422**/**409**).

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `tutor.spaces()` | GET | `/api/tutor/spaces` | none | `[{ course, conversationCount, lastConversation, suggestion: { kind, label, prompt, lectureId } }]` |
| `tutor.context(courseId)` | GET | `/api/tutor/courses/{id}/context` | none | the learner context the AI receives for that course (progress, mastery, per-lecture results, weak topics) |
| `conversations.list({ courseId })` | GET | `/api/conversations?courseId=` | none | conversations with course, lecture title, message count and preview |
| `conversations.get(id)` | GET | `/api/conversations/{id}` | none | conversation |
| `conversations.create({ courseId, lectureId, title })` | POST | `/api/conversations` | same | **201** conversation. **422** lecture not in this course. |
| `conversations.rename(id, title)` | PATCH | `/api/conversations/{id}` | `{ title }` (≤ 80) | conversation |
| `conversations.remove(id)` | DELETE | `/api/conversations/{id}` | none | `{ ok }` (messages cascade) |
| `messages.list(conversationId)` | GET | `/api/conversations/{id}/messages` | none | `[{ id, role, content, sources, status, stopped, createdAt }]`, oldest first |
| `messages.update(id, { content, stopped })` | PATCH | `/api/messages/{id}` | `{ content, stopped: true }` | message. Keeps the part of an answer shown before Stop. |
| `ai.chat({ conversationId, courseId, lectureId, message, history })` | POST | **FastAPI** `/tutor/chat` | same (`learnerContext` is built server-side in production) | `{ message: { id, content, sources: [{ lectureId, page, snippet }], context: [{ type, label, link }] }, conversation? }`. Will stream over Server-Sent Events. **409** course mismatch, **422** empty / too long (2,000 characters), **503** AI failure (the failed reply is stored with `status: 'error'` so the page can show Retry). A "quiz me on…" message creates a draft quiz and replies with a preview link. |
| `ai.summarize({ lectureId, options })` | POST | **FastAPI** `/lectures/{id}/summary` | `{ options }` | `{ id, lectureId, courseId, content, sources, createdAt }` (replaces the saved summary) |
| `ai.studyNotes({ lectureId, options })` | POST | **FastAPI** `/lectures/{id}/notes` | `{ options }` | same shape. Logs `notes_generated`. |
| `ai.generateQuiz({ lectureId, options })` | POST | (wrapper) | `{ count, difficulty, types }` | calls `quizzes.generate` for that lecture and returns the draft (lecture page → preview) |

## Admin console: `api.admin`

Admin only (**403** otherwise). Admins see account details and **counts**, never chat messages, notes, lecture text, quiz questions or answers.

| Method | HTTP | Endpoint | Request | Response |
|---|---|---|---|---|
| `summary()` | GET | `/api/admin/summary` → `admin/summary.php` | none | `{ students, newStudents30d, deactivated, activeUsers, activeWindowDays, courses, archivedCourses, lectures, lecturesByStatus: { ready, inProgress, failed } }`. `activeUsers` = active students who signed in or had any activity in the last 7 days. |
| `users({ q, status })` | GET | `/api/admin/users?q=&status=` → `admin/users.php` | `q` matches name or email; `status` is `active`/`deactivated` | `[{ id, firstName, lastName, email, avatarColor, institution, program, status, createdAt, lastLoginAt, lastActiveAt, counts: { courses, lectures, quizzesTaken, conversations }, lastStatusChange: { action, reason, at } \| null }]`, students only, newest first |
| `setUserStatus(id, { status, reason })` | PATCH | `/api/admin/users/{id}/status` → `admin/user-status.php` | `{ status: 'active' \| 'deactivated', reason }` (reason required, 5–300 characters) | the updated row. Writes `admin_actions` (admin id, from/to, reason). Deactivating ends that student's session. **404** not a student (admins can't be changed here), **409** already in that state, **422** missing or invalid reason. |
| `lectures()` | GET | `/api/admin/lectures` → `admin/lectures.php` | none | `{ counts: { uploading, extracting, processing, ready, failed }, items: [{ id, title, status, fileSizeKb, uploadedAt, course: { id, code }, student: { id, name } }] }`. Items are lectures that aren't ready (in the pipeline or failed), newest first, at most 20. |
| `activity({ limit })` | GET | `/api/admin/activity?limit=` → `admin/activity.php` | `limit` ≤ 50 | `[{ id, type, label, createdAt, student: { id, name }, course: { code } \| null }]`. `label` is generic ("Asked the AI Tutor", "Submitted a quiz"); no titles, message text or scores. |

## Mock only: `api.dev`

| Method | Purpose |
|---|---|
| `resetMockData()` | Restore the sample data (profile menu → Reset demo data, or the sign-in page). Rejects with 501 when `useMockData` is false. |
| `inspect()` | The raw mock store, for the console. |
