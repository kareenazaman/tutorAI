# TutorAI — Developer guide (v1.0.0)

**Learn. Practise. Improve.** An AI-powered study app for university and college students. Students add their courses, upload lecture PDFs, ask an AI Tutor that answers only from their own lecture notes, generate practice quizzes, and track progress and mastery.

This repository is the **complete static frontend**: HTML, CSS and plain JavaScript (Bootstrap 5, no build step). It runs today on a **mock backend** that lives in the browser (`services/api.js` + `data/mock-data.js`) and is ready to switch to the planned **PHP + MySQL** API and **FastAPI** AI service (see [API.md](API.md) and [schema.sql](schema.sql)). There are two roles: students use the app, and admins get a one-page console for accounts and counts.

## Run it

```bash
python3 dev-server.py           # then visit http://localhost:5500
python3 dev-server.py 8080      # or another port
```

`dev-server.py` is `python3 -m http.server` with caching turned off (changes show on a normal reload) and a 404 page for missing paths. Plain `python3 -m http.server 5500` also works; press **Cmd/Ctrl+Shift+R** if Chrome keeps old files. An internet connection is needed for the CDNs (Bootstrap, Lucide, Chart.js, marked, DOMPurify, KaTeX, highlight.js, Google Fonts). Port 8000 is left free for the FastAPI AI service.

### Demo accounts

| Role | Name | Email | Password |
|---|---|---|---|
| Student | Maya Chen | `maya.chen@university.ca` | `Practise2026!` |
| Admin | Kareena Zaman, Platform Owner | `owner@tutorai.app` | `Practise2026!` |

A fresh browser starts **signed out**: any app page sends you to the sign-in page, which shows both accounts. After signing in, each role lands on its own dashboard. Ten more sample students exist for the admin console (fictional `@student.example.edu` addresses; two are deactivated). You can also create your own account (it starts empty). Sample data lives in this browser only. **Reset demo data** in the account menu, or **Restore the sample data** on the sign-in page, puts it back.

## Pages

| Page | URL | What it's for |
|---|---|---|
| Launcher | `index.html` | Entry points for reviewers: sign in, the student app, the design system |
| Sign in | `pages/auth/login.html?next=` | Email + password, remember me, demo credentials, returns to `next` after sign-in |
| Create account | `pages/auth/register.html` | Name, email, password with strength meter, terms dialog; signs you in |
| Forgot / reset password | `pages/auth/forgot-password.html`, `reset-password.html?token=demo` | Request a link; set a new password (demo token `demo`) |
| Dashboard | `pages/student/dashboard.html` | Greeting, streak, **weekly goal**, continue learning, stats, courses, activity, revision suggestions |
| My Courses | `pages/student/courses.html?q=&term=&status=&sort=` | Search, filter, sort; add, edit, archive, delete courses |
| Course workspace | `pages/student/course.html?id=&tab=` | Tabs: overview, lectures, AI Tutor, quizzes, progress |
| Upload lecture | `pages/student/course-upload.html?id=` | PDF upload (≤ 20 MB) with simulated processing |
| Lecture workspace | `pages/student/lecture.html?id=&page=` | Extracted-text viewer, summary, study notes, practice quiz, Ask AI |
| AI Tutor | `pages/student/ai-tutor.html?course=&lecture=&c=` | One space per course: card row, conversations, chat, context panel |
| Quizzes | `pages/student/quizzes.html?course=&status=&source=` | Hub: stats, weak-topic practice, resume, retry, results |
| Create a quiz | `pages/student/quiz-create.html?course=&lecture=&draft=` | Describe it or build it, then preview, swap and regenerate |
| Take a quiz | `pages/student/quiz-attempt.html?id=&fresh=1` | Focus mode: autosave, resume, flags, keyboard, timer |
| Quiz results | `pages/student/quiz-results.html?attempt=` | Score ring, per-lecture/topic breakdown, review, next steps; a one-time celebration on a new attempt |
| My Progress | `pages/student/progress.html?course=&range=7d\|30d\|term` | Stat tiles, four charts with data tables, topics to revise, attempts |
| My Profile | `pages/student/profile.html` | Personal details, change password, account facts |
| Settings | `pages/student/settings.html#notifications\|goal\|appearance\|privacy\|danger` | Notifications, weekly goal, reduced motion, data export, delete chats, delete account |
| Not found | `pages/404.html` | Static 404 (served by `dev-server.py` for any missing path) |
| Design system | `pages/styleguide.html` | Every component, live (opens without signing in) |
| Admin Dashboard | `pages/admin/dashboard.html?q=&status=` | Admin only (dark shell): stat tiles, user management (search, status filter, activate/deactivate with a required reason), lecture processing, recent activity |

Every sidebar item is a finished page; there are no placeholder pages. Students who open the admin page get a friendly 403 page; admins who open a student page go to the admin dashboard.

## Structure

```
tutorai/
├── index.html                  Demo launcher
├── dev-server.py               No-cache dev server with a 404 page
├── docs/
│   ├── API.md                  Every api.js method → HTTP method, PHP/FastAPI endpoint, request, response
│   ├── schema.sql              Draft MySQL 8 schema matching the mock data model
│   └── QA-REPORT.md            Stage 6 review: checklist, bugs fixed, known limitations
├── pages/
│   ├── _template.html          Copy this to start a new page
│   ├── 404.html                Not found (static, no sign-in)
│   ├── styleguide.html         Every component, live
│   ├── admin/                  dashboard (the admin console, dark shell)
│   ├── auth/                   login, register, forgot-password, reset-password (auth layout)
│   └── student/                dashboard, courses, course, course-upload, lecture, ai-tutor,
│                               quizzes, quiz-create, quiz-attempt (focus layout), quiz-results,
│                               progress, profile, settings
└── assets/
    ├── css/
    │   ├── main.css            Entry point, imports the rest in order
    │   ├── tokens.css          Colours, type scale, spacing, radius, shadows, motion
    │   ├── base.css            Bootstrap theme bridge, typography, utilities, reduced motion
    │   ├── layout.css          App shell: sidebar, topbar, content, auth and focus layouts
    │   ├── components.css      Buttons, forms, cards, modals, tabs, badges, choice pills, chat, …
    │   └── pages.css           Page-specific styles, each scoped to .page-<name>
    ├── js/
    │   ├── core/
    │   │   ├── config.js       App settings and the mock/real data switch
    │   │   ├── utils.js        Escaping, dates, storage, URL helpers, reduced-motion preference
    │   │   ├── navigation.js   Student and admin menus (single source)
    │   │   ├── auth.js         requireAuth() / requireRole() / redirectIfSignedIn(): UX-only checks
    │   │   ├── shell.js        Builds the app layout (sidebar + topbar) around each page
    │   │   ├── auth-layout.js  Split-screen layout for pages/auth/*
    │   │   ├── focus-layout.js Distraction-free layout (no sidebar/topbar) for the quiz player
    │   │   ├── validation.js   Validators, inline errors, form binder, strength meter
    │   │   ├── markdown.js     renderMarkdown(): marked → highlight.js → KaTeX → DOMPurify
    │   │   ├── motion.js       Web Animations helpers: countUp, ring, pop, fadeIn, confetti
    │   │   └── chart-theme.js  Chart.js defaults in TutorAI colours
    │   ├── components/         sidebar, topbar, notifications, palette, ui,
    │   │                       course-ui (course card, lecture status, score badges),
    │   │                       course-chat (a course's AI Tutor space: full page and course tab)
    │   ├── data/mock-data.js   SEED data for the mock store (demo only)
    │   ├── data/lecture-content.js  SEED extracted text for each sample lecture
    │   ├── services/api.js     API layer + mock store: the only thing pages talk to
    │   ├── services/mock-ai.js Stand-in for FastAPI: retrieval, answer templates, quiz generator
    │   ├── services/quiz-engine.js  Pure grading, sanitising and stats (the rules PHP will mirror)
    │   └── pages/              One script per page (settings.js, not-found.js, quiz-*.js, …)
    └── img/                    logo-mark.svg, logo-full.svg (icons come from Lucide 1.73.0)
```

## How a page works

Each page declares who it is. `shell.js` injects the sidebar, topbar, notifications and profile menu around `<main id="page-content">`.

```html
<body data-shell="student" data-page="courses" data-root="../../">
  <main id="page-content"> …page content only… </main>
```

| Attribute | Purpose |
|---|---|
| `data-shell` | `student` or `admin`: picks the sidebar and the role `core/auth.js` requires. App pages stay hidden until the check passes. |
| `data-page` | The page's own id. Matches an `id` in `navigation.js` to highlight the nav link and set the title. |
| `data-nav` | Optional: highlight a different nav item. `course.html` uses `data-nav="courses"`. |
| `data-root` | Path back to the project root |
| `data-title` | Optional title override |
| `data-search="false"` | Hides topbar search |
| `data-auth="optional"` | Page opens without signing in (only the style guide) |

Page scripts wait for the shell:

```js
document.addEventListener('tutorai:ready', async (event) => {
  'use strict';
  const user = event.detail.user;
  const courses = await TutorAI.api.courses.list();
});
```

Don't combine `'use strict'` with a destructured parameter such as `({ detail }) =>`. That's a syntax error and the whole script silently fails.

Deeper pages replace the breadcrumb trail (the last item is the current page; earlier items link):

```js
TutorAI.shell.setCrumbs([
  { label: 'My Courses', href: TutorAI.utils.url('pages/student/courses.html') },
  { label: 'COMP 3610', href: '…/course.html?id=crs_2001' },
  { label: 'Upload' }
]);
```

## Accounts, settings and backend readiness (stage 6)

### Roles

`users.role` is `student` or `admin`. Sign-up always creates students. The admin side is deliberately small: one page, `pages/admin/dashboard.html` (see [Admin console](#admin-console)). Stores from earlier stages are upgraded in place: the admin account and the sample students are added (with fresh ids where needed), an older admin record takes the new details, `suspended` becomes `deactivated`, and the signed-in user stays signed in. If a migration ever fails, the stored data is kept as it was rather than reseeded.

### Sign-in and the session

- The mock store holds `session: { userId }`, standing in for the PHP session cookie. A **fresh browser starts signed out**. `auth.login` and `auth.register` set it; `auth.logout` and `account.remove` clear it.
- While signed out, every API call outside `/auth/*` fails with **401**, as the PHP API will.
- `core/auth.js`:
  - `requireRole(role)` runs before the shell (and the focus layout) builds a page. Signed-out visitors go to `pages/auth/login.html?next=<page>` and come back after signing in. A student opening the admin page gets a friendly **403** page ("Go to my dashboard" / "Sign in as admin"); an admin opening a student page goes to the admin dashboard.
  - `next` must be a `pages/student/*.html` or `pages/admin/*.html` path **for the signed-in user's role**, so sign-in can't be turned into an open redirect.
  - `redirectIfSignedIn()` sends a signed-in user from the sign-in and create-account pages to their role's dashboard.
  - App pages are hidden by CSS from the first paint until the check passes, so nothing flashes.
  - **These checks are UX only.** Anyone can edit browser JavaScript; PHP enforces sessions, roles and ownership on every request.
- **Deactivated accounts** can't sign in (403, "This account has been deactivated…"). A student who is deactivated while signed in loses the session on their next request.
- Seed rows (quizzes, attempts, chats, activity) are created for the demo student (`mockData.demoUserId`), whoever is signed in.

### Results celebration (`core/motion.js`)

On the **first view of a new attempt** (`attempts.markViewed()` sets `resultsViewedAt` and returns `firstView`):

- The score ring fills from 0 while the percentage counts up (1.3s, ease-out).
- **≥ 80%:** when the ring finishes, about 35 confetti pieces in the TutorAI pastels and black burst from behind the ring (Web Animations API), then are removed (~1.6s).
- **100%:** a bigger burst (50 pieces) and a "Perfect score" chip that pops in.
- **Below 80%:** no confetti; the rest of the results fade in gently.

Reopening results shows the final score straight away; a retry is a new attempt, so it can celebrate again. Seeded and older attempts count as already seen. With reduced motion (device setting or Settings → Appearance) everything is shown in its final state. Confetti is drawn in a fixed `pointer-events: none` layer (`.tai-confetti`), so it never scrolls the page, shifts layout or blocks clicks.

`TutorAI.motion` is reusable: `countUp(el, to)`, `ring(circle, percent)`, `pop(el)`, `fadeIn(elements)`, `confetti(originEl, { count, power })`, `reduced()`. Load `core/motion.js` after `components/ui.js`.

### Admin console

One page, `pages/admin/dashboard.html`, in the dark admin shell. The sidebar has **Admin Dashboard** and **Sign out**; the top bar shows the admin's title ("Platform Owner"). The command-palette search is hidden.

| Section | Data |
|---|---|
| Stat tiles | Students (new in 30 days, deactivated), **active users** (active students who signed in or had activity in the last 7 days), courses (archived), lectures (ready / processing / failed). All computed from the store on each load. |
| User management | Students only, newest first: name, email, program, joined, last active, usage **counts** (courses, lectures, quizzes taken, AI Tutor chats), status. Search (name or email) and status filter, both kept in the URL. **Activate / Deactivate** opens a confirm dialog with a **required reason** (5–300 characters), saved to `admin_actions` with the admin's id. Rows become labelled cards below 992px. |
| Lecture processing | Counts per status and the lectures that aren't ready (title, size, course code, student, time). |
| Recent activity | The last 10 events as generic labels ("Uploaded a lecture", "Asked the AI Tutor"). No titles, message text or scores. |

**Privacy rule:** the admin API returns account details and counts only. It never returns chat messages, notes, summaries, lecture text, quiz questions, answers or scores per question. The Node tests check every admin response for these fields.

### Settings (`user_settings`)

| Setting | Values | Used by |
|---|---|---|
| Notifications | `lectureReady`, `quizReady`, `weeklySummary`, `studyReminders` (booleans) | A notification is only created if its type is on (`lecture` → `lectureReady`, `quiz` → `quizReady`, `progress` → `weeklySummary`, `reminder` → `studyReminders`). The bell menu links here. |
| Weekly study goal | `weeklyGoalDays` 1–7 (default 4) | Dashboard chip "N/goal days this week". A study day is any day (Monday start) with a logged activity: reading a lecture, an AI Tutor message, a quiz submission, an upload, generated notes. |
| Appearance | `reducedMotion`: `system` (follow the device) or `reduce` (always) | Sets `html[data-motion="reduce"]` from the first paint (a per-device copy is kept in localStorage `tai.pref.motion`). That turns off CSS animations, count-ups, chart animation and smooth scrolling. The device's own reduced-motion setting is always respected. |

Changes save immediately (`PATCH /api/settings` with just that field). A failed save puts the control back and explains why. Privacy: **Download my data** (`account.export()` → a JSON file, never passwords), **Delete all my AI chats** (with confirmation). Danger zone: **Delete account** (type `DELETE`). It removes the student and everything they own, signs out, and the sign-in page confirms it.

### Not found

`pages/404.html` is a static page in the design system (no shell, no sign-in). `dev-server.py` returns it with status 404 for any missing path. On Apache use `ErrorDocument 404 /pages/404.html`.

### Accessibility

- Text colour tokens pass WCAG AA everywhere: `--tai-text-muted` (#5F5F69) is at least 5:1 on white and every pastel, and `--tai-text-faint` (#6E6E78) at least 4.5:1 on white and the sidebar grey.
- Focus: `:focus-visible` draws the focus ring as a box-shadow, plus a transparent outline that shows up in Windows high-contrast mode.
- Every field has a label and every icon button has a name. Live regions announce saves, quiz progress and results. Dialogs trap focus (Bootstrap).
- Reduced motion: the device setting or Settings → Appearance.

### PHP / MySQL readiness

| Check | Where |
|---|---|
| Data models in one place | `data/mock-data.js` (seed), `services/api.js` (store, rules, endpoints), `services/quiz-engine.js` (grading); MySQL version in `docs/schema.sql` |
| Mock data kept out of the UI | Pages only call `TutorAI.api.*`; nothing reads `mockData` except `api.js` |
| Form names match fields | snake_case `name`s (`full_name`, `lecture_number`, `weekly_goal_days`, `confirm`, …) are what PHP reads; each page maps them to the camelCase JSON in `docs/API.md` |
| Uploads | The upload form is `multipart/form-data`; in live mode `lectures.create` sends `FormData` (`lecture_file`, `title`, `lecture_number`, `description`) |
| IDs | Prefixed everywhere (`usr_ crs_ lec_ qz_ q_ att_ conv_ msg_ act_ ntf_ sum_ note_ adm_`); `nextId()` never reuses a number |
| No secrets in the browser | localStorage holds only the mock store (`scrub()` drops any password/token/secret key), the remembered email, sidebar state and the motion preference. No API keys anywhere. |
| Admin sees counts only | `api.admin.*` returns account details and counts; the Node tests scan every admin response for content fields |
| Demo features are labelled | Sign-in badge "Demo mode", demo-credentials note, upload "Demo mode: files are not uploaded or read", "Preview of extracted text (demo)", generated pages marked "Demo content", "Demo response" on AI replies, "AI feedback (demo)" on short answers, Settings "Demo" note, Reset demo data |

## Quizzes and learning analytics (stage 5)

| Page | What it does |
|---|---|
| `pages/student/quizzes.html` | Quiz hub. Stat tiles (completed, average, in progress) and a **Practise weak topics** tile that writes a quiz from topics under 65%. Resume banner for unfinished attempts. List filters for course, status and source are kept in the URL (`?course=&status=&source=`). Each row has Start, Resume, Retry, Results and Delete (with a confirm step). |
| `pages/student/quiz-create.html?course=&lecture=` | Two ways to create a quiz, both using the same generator. **Describe it** takes a sentence ("Quiz me on joins and indexing, 10 hard questions") and fills in the builder. **Build it** lets you pick lectures (or all), number of questions (5/10/15/20), difficulty, question types, explanations on or off, and an optional time limit, with a live estimate. Both lead to a **preview** (`?draft=qz_…`) with Swap per question, Regenerate all, Save for later and Start quiz. |
| `pages/student/quiz-attempt.html?id=qz_…` | Focus mode: `data-layout="focus"` (`core/focus-layout.js`), with no sidebar or topbar, just a slim header. Shows one question at a time (multiple choice, multiple select, true/false or short answer), a navigator grid, flag for review, keys **1–4** and **← / →**, autosave on every change, resume after reload, and a leave-page warning. **Submit** lists unanswered and flagged questions before confirming. A time limit submits the attempt when it runs out. `&fresh=1` starts a new attempt ("Retry"). |
| `pages/student/quiz-results.html?attempt=att_…` | Score hero with a count-up, compared with the previous attempt. Breakdown by lecture and by topic. Question review with All / Incorrect / Flagged filters, explanations (Markdown), and a source link to the lecture page. Short answers get **AI feedback (demo)** with the key ideas you covered. Next steps: Retry, Practise what I missed, Review lecture, Ask AI Tutor. |
| `pages/student/progress.html?course=&range=7d\|30d\|term` | Analytics. Stat tiles and four Chart.js charts: scores over time per course, mastery vs progress per course, topic averages coloured by band, and study activity per day. Each chart has a legend, tooltips, an empty state and a **Show data** table. Below them: **Topics to revise** (Practise / Ask AI) and recent attempts. |

The create, attempt and results pages highlight **Quizzes** in the sidebar and set breadcrumbs. Quizzes can also be created from the AI Tutor ("quiz me on gradient descent, 5 hard questions" replies with a link to the preview) and from the lecture page's **Generate quiz** button. Both use `quizzes.generate`, so every route ends at the same preview.

### Data model

| Entity | Fields | Notes |
|---|---|---|
| `quizzes` (`qz_`) | `id, courseId, title, source, lectureIds[], difficulty, settings{count, types[], explanations, timeLimitMin}, status, createdAt, questions[]` | `status`: `draft` → `ready` (saved or started) or `archived`. `source`: `lecture` \| `ai` \| `weak-topics` \| `retry` (Practise what I missed). Drafts more than a day old are deleted. A quiz's state for display (not started, in progress, completed, best score, last score) is calculated from its attempts and never stored. |
| question (`q_`) | `id, type, prompt, options[{id, text}], correct, explanation, lectureId, page, topic, difficulty` | `type`: `mcq` \| `multi` \| `true_false` \| `short`. A short answer stores `correct: { model, keywords[] }`. **Each question has its own `lectureId`**, so a quiz that spans two lectures credits each lecture separately. |
| `attempts` (`att_`) | `id, quizId, userId, status, answers{qid: value}, currentIndex, flagged[], order[], shuffleOptions, startedAt, deadlineAt, submittedAt, score, total, percent, perQuestion[]` | `status`: `in_progress` \| `submitted`. There is at most one open attempt per quiz. A retry creates a new attempt in a shuffled order; earlier attempts are kept. |
| `activity` (`act_`) | `id, userId, type, courseId, refId, title, createdAt` | `type`: `quiz_submitted` \| `quiz_created` \| `lecture_viewed` \| `chat_message` \| `lecture_uploaded` \| `notes_generated` (plus the stage 3 course events). `refId` points at the attempt, lecture or quiz. `lecture_viewed` and `chat_message` are counted in streaks and charts but hidden from "Recent activity". |

**Answers never reach the attempt page.** Until an attempt is submitted, `quizzes.get`, `attempts.start` and `attempts.get` return questions passed through `quizEngine.sanitizeQuestion`, which removes `correct`, `explanation` and short-answer `model`/`keywords`. Grading happens in the API (`attempts.submit`), comparing the stored answers with the stored correct answers. Only a **submitted** attempt's `attempts.get` includes answers and explanations. (In mock mode the store in localStorage plays the server, so it holds the answers, just as the PHP database will.)

**Migration.** Stores from stages 3–4 are upgraded in place (`meta.schema = 5`); nothing is wiped. Each old quiz keeps its id and gets questions (taken from its old questions, or generated from its lecture). A completed quiz becomes a submitted attempt rebuilt from its recorded score, rounded to the nearest score the question count allows, so 92% on 12 questions becomes 11/12 = 92% but may differ slightly on other counts. `quiz_completed` activity becomes `quiz_submitted` with a `refId`.

### Grading rules (`services/quiz-engine.js`)

| Type | Answer | Points |
|---|---|---|
| Multiple choice, true/false | one option id | 1 if right, else 0 |
| Multiple select | array of option ids | 1 only if exactly the right set (all or nothing) |
| Short answer | text, up to 600 characters | Keyword marking (a demo stand-in for AI marking): `required = min(3, keywords)`. **1** if at least `required` keywords match, **0.5** if at least half of them match, otherwise **0**. Matching ignores case and simple word endings. |

Unanswered questions score 0. `percent = round(score ÷ total × 100)`. The same engine grades seeded, migrated and live attempts, so seeded scores always match their answers.

### Analytics definitions

One set of bands is used everywhere (results, hub, course tabs, progress page, AI suggestions): **strong ≥ 80 · okay 65–79 · revise < 65**. (Before stage 5 the revision threshold was 75%; it is now 65% in every view.)

- **Progress (coverage)**: ready lectures that have at least one question in a submitted attempt ÷ ready lectures. A question counts toward the lecture it came from, not the quiz.
- **Lecture score** for one attempt: the points from that lecture's questions ÷ the number of those questions. **Mastery** is the mean, across attempted ready lectures, of each lecture's **best** score.
- **Topic average**: the mean of the per-attempt topic percentages (a topic is the lecture's topic, e.g. "Normalization"). Topics under 65% appear in **Topics to revise**, dashboard recommendations and the AI Tutor's suggestions.
- **Average score**: the mean `percent` of submitted attempts in the filter, retakes included.
- **Quiz performance over time**: one point per course per day, the mean percent of that day's attempts.
- **Study activity**: events per day, grouped by type (quizzes submitted, lectures read, AI Tutor messages, uploads, notes).
- **Ranges**: `7d` = today and the 6 days before; `30d` = today and the 29 days before; `term` = from the start of the current term (Jan, May or Sep 1) to now. Every analytics call takes `{ courseId?, from, to }`.

### API methods (stage 5)

| Method | Planned endpoint |
|---|---|
| `quizzes.list({ courseId, status, source })` | `GET /api/quizzes` (summaries with attempt stats; never questions) |
| `quizzes.get(id)` | `GET /api/quizzes/{id}` (questions without answers) |
| `quizzes.parse({ text, courseId })` | `POST {aiBaseUrl}/quizzes/parse` → `{ courseId, lectureIds, count, difficulty, types, focusTerms, understood[] }` |
| `quizzes.generate(opts)` | `POST {aiBaseUrl}/quizzes/generate` → a draft (`{ courseId, lectureIds[], count, difficulty, types[], explanations, timeLimitMin, source, focusTerms[], topics[], title }`; 422 for no lectures, no types, or lectures that aren't ready) |
| `quizzes.regenerate(id)` / `quizzes.swapQuestion(id, qid)` | `POST {aiBaseUrl}/quizzes/{id}/regenerate`, `…/questions/{qid}/swap` (drafts only) |
| `quizzes.save(id, { title })` | `PATCH /api/quizzes/{id}` (draft → ready) |
| `quizzes.remove(id)` | `DELETE /api/quizzes/{id}` (also deletes its attempts) |
| `attempts.start(quizId, { fresh })` | `POST /api/quizzes/{id}/attempts` (resumes the open attempt, or starts a new one) |
| `attempts.get(id)` | `GET /api/attempts/{id}` (answers only once submitted, plus `previous`, `byLecture`, `byTopic`) |
| `attempts.save(id, { answers, currentIndex, flagged })` | `PATCH /api/attempts/{id}` (autosave) |
| `attempts.submit(id)` | `POST /api/attempts/{id}/submit` (grades; logs `quiz_submitted`) |
| `attempts.listByQuiz(quizId)` / `attempts.list({ status, courseId, limit })` | `GET /api/quizzes/{id}/attempts`, `GET /api/attempts` |
| `analytics.summary(f)` | `GET /api/analytics/summary` → `{ averageScore, quizzesCompleted, coursesStudied, topicsToRevise, inProgress }` |
| `analytics.performanceOverTime(f)` | `GET /api/analytics/performance` |
| `analytics.byCourse(f)` | `GET /api/analytics/courses` → `{ progress, mastery, attempts }` per course |
| `analytics.byTopic(f)` | `GET /api/analytics/topics` (lowest first, with `band`) |
| `analytics.activity(f)` | `GET /api/analytics/activity` → `{ days: [{ date, total, byType }] }` |
| `lectures.markViewed(id)` | `POST /api/lectures/{id}/view` (logs `lecture_viewed`) |

`ai.generateQuiz` (lecture page) and `ai.chat` quiz requests now create drafts through `quizzes.generate`. Course deletes cascade to quizzes and attempts.

## AI Tutor course spaces (stages 4.1–4.2)

### Page layout (stage 4.2)

`ai-tutor.html` is one view — there is no separate grid:

1. **Title + one-line subtitle** (“Pick a course — each space only reads…”). No eyebrow; the breadcrumb already says *AI Tutor › COMP 3610*.
2. **A row of compact course cards** (~180×100px, 164×96 on phones): pastel background, course code, title (one line, ellipsis), mastery chip and chat count. One card per existing course, from `tutor.spaces()` — a course added in My Courses appears automatically; there is no “Add course” card. The row scrolls sideways with fade edges that only show where cards are cut off.
   - Cards are `<button aria-pressed>` in a `role="group"`. **←/→** (and ↑/↓, Home/End) move focus with a roving tab stop; **Enter/Space** selects. The selected card has a 2px black border and a slight lift.
   - Selecting a card swaps the space below **without a reload** (short fade), pushes `?course=…`, and keeps keyboard focus in the row. Back/forward and reload restore the selection. Chat counts refresh when a chat is created or deleted.
   - **Default:** the course of the most recent conversation, else the most recently opened course, else the first. An unknown `?course=` falls back to that with a notice; `?c=conv_…` alone selects the conversation's own course.
3. **The selected course's space** (`components/course-chat.js`, `variant: 'full'`): left — **New chat**, lecture scope, this course's chats with a one-line preview; centre — the chat; right — **Suggested**, progress and mastery (with lecture count), weak topics, lectures, sources for the latest answer. The detail that used to sit on the big cards (last chat preview, suggestion, lecture count) now lives here, so cards and panels don't repeat each other. The welcome screen only shows the suggestion when the right panel is a drawer (< 1200px).
4. **No courses:** the empty state (link to My Courses) replaces the row.

| Width | Card row | Space |
|---|---|---|
| ≥ 1200 | fits or scrolls with fades | list · chat · context |
| 768–1199 | scrolls with fades | list · chat; context in a **Context** drawer |
| < 768 | scrolls with fades at the top | chat full width; chats and context are drawers |

On desktop and tablet the page is locked to the viewport height so the chat scrolls inside; on phones and short screens the page scrolls.

`course.html?id=…&tab=ai-tutor` still embeds the same space (`variant: 'embedded'`) with **Open full screen** → `ai-tutor.html?course=…&c=…`. New mount option: `autofocus` (default `true`; the card row passes `false` when switching so focus stays on the cards).

There is no course selector any more: a conversation's course is fixed by the space it was created in, and the API still returns **409** if a request tries to change it. The lecture scope stays optional and can change between messages. The lecture workspace's **Ask AI about this lecture** opens the course space scoped to that lecture.

**One implementation, one data source.** `components/course-chat.js` (`TutorAI.components.CourseChat.mount(el, { courseId, variant: 'full' | 'embedded', conversationId, lectureId, prefill, ask, onStateChange })`) is used by both pages. Both read and write the same `conversations` / `messages` through the API, so a chat started or continued in either place is the same chat — immediately, after a reload, and in other browser tabs (the store fires `tutorai:store-changed` when another tab writes, and the component refreshes).

| Width | Spaces grid | Full space | Course tab |
|---|---|---|---|
| ≥ 1200 | 3 columns | list · chat · context | list · chat (+ strip) |
| 768–1199 | 2 columns | context → **Context** drawer | list → drawer below 992 |
| < 768 | 1 column | chat full screen; conversations and context are drawers | list is a drawer; the strip drops weak-topic chips |

### Answers use relevant learner data

`mock-ai.js` now works in two steps (`chat()` = `respond(buildContext(…))`):

1. **Context — `buildContext({ course, pages, message, history, lectureId, learner })`.** Retrieves matching pages from the conversation's course only, then adds learner facts **only when they relate to what was asked**:
   - quiz results and missed (weak, < 65%) topics for the matched lectures, ranked by relevance (the top page's lecture first, then a topic-name match);
   - for “test my understanding”: your last score on that lecture, or that it isn't quizzed yet;
   - a waiting (unstarted) quiz for the matched lecture;
   - for **“What should I study?” / “how am I doing?” / “ready for the exam?”** (intent `plan`): progress, mastery, weak topics, un-quizzed lectures and waiting quizzes → a numbered study plan.

   Nothing is invented: if the material has no quiz data, no results are mentioned. Example: *“How do PHP sessions work?”* in COMP 3610 → “on Sessions & authentication you scored **58%** — your lowest topic”; *“Explain joins in SQL”* in COMP 3410 → mentions the **74%** Relational algebra quiz from the same lecture; *“Explain the law of total probability”* (88% / 94%) → no learner note.
2. **Response — `respond(context, { variant })`.** Builds the Markdown answer, cites lecture pages, adds a short **“From your quiz results / progress”** paragraph with links, and returns the context it used.

Each assistant message saves **`context: [{ type, label, link, ref }]`** (`type`: `lecture` | `quiz` | `topic` | `progress`; `link` is root-relative; `ref` holds the lecture/quiz id). It's shown under the answer as **Used:** chips (e.g. *Lecture 3 p.2*, *Quiz: Sessions & cookies (58%)*) that link to the page or quiz. Older messages without `context` fall back to their sources. The isolation check now also throws if any context `ref` points at another course's lecture or quiz.

### Learner context & new endpoints

`api.js` builds the learner context for one course (`buildLearnerContext(courseId)`): `{ courseId, code, progress, mastery, readyLectureCount, attemptedLectureCount, lectures: [{ id, title, lectureNumber, status, bestScore, attempts: [{ quizId, title, topic, score, completedAt }] }], weakTopics: [{ topic, lectureId, averageScore, scores, quizIds, quizTitles }], unquizzedLectures, unstartedQuizzes }`.

| Method | Endpoint | Notes |
|---|---|---|
| `ai.chat({ …, learnerContext })` | `POST {aiBaseUrl}/tutor/chat` | `learnerContext` is part of the request contract, but **FastAPI will build it server-side from MySQL**, so production clients omit it. The mock builds it from the store when absent and rejects one for another course (409). Response message adds `context`. |
| `tutor.spaces()` | `GET /api/tutor/spaces` | Cards: course (with progress, mastery, lectureCount), conversationCount, lastConversation, suggestion. |
| `tutor.context(courseId)` | `GET /api/tutor/courses/{id}/context` | The learner context + suggestion (the space's context panel). |

**Suggestions** (first that applies): lowest weak topic (*“Review Lecture 3: your lowest score (58%)”*, or *“… your lowest topic (59% avg)”* for repeated attempts) → a ready lecture with no quiz (*“Lecture 8 isn't quizzed yet”*) → a waiting quiz → *“Summarize Lecture N”*; with no ready lectures, *“Upload a lecture to start chatting”* links to the upload page.

### Polish

- AI Tutor and lecture workspace use the full content width; the chat column grows (messages up to 920px wide).
- `.form-select` everywhere keeps text clear of the chevron (`padding-right` + ellipsis).
- The sidebar “Stuck on a concept?” card is hidden on the AI Tutor page.
- The composer shows no scrollbar until it reaches its 200px max height.
- The context panel always shows progress, weak topics and lectures — sources are added after the first answer.
- `course.html` now also loads the Markdown libraries, `lecture-content.js`, `mock-ai.js` and `course-chat.js` for its AI Tutor tab.

## AI learning experience (stage 4)

| Page | What it does |
|---|---|
| `pages/student/lecture.html?id=lec_…&page=N` | **Lecture workspace.** Left: course and its lectures (non-ready ones shown with their status, not openable). Centre: the extracted text as paper sheets, labelled *Preview of extracted text — demo*, with prev/next, a page box, `?page=` in the URL, ←/→ keys, zoom −/+/Fit (50–200%, remembered) and document info. Right: study tools — **Generate summary**, **Create study notes** (copy, download `.md`), **Generate quiz** (5/10 questions, easy/medium/hard; saved and linked), **Ask AI about this lecture**. Citation links in results jump to that page in place. Missing / not-ready lectures get a clear empty state. |
| `pages/student/ai-tutor.html?course=&lecture=&c=` | **AI Tutor** *(stage 4 version — see stage 4.1 above: the course selector was replaced by course spaces)*. Left: New conversation, course (required), lecture (optional, "All lectures in this course"), recent conversations grouped Today / This week / Older with rename and delete. Centre: welcome + four suggested prompts, messages, composer (auto-grows, Enter sends, Shift+Enter new line, 2000-character limit, disabled while sending), typing indicator, word-by-word reveal with **Stop**, per-message **Copy** and **Regenerate**. Right: course, lecture and the **sources for the latest answer** (lecture, page, snippet → opens `lecture.html` at that page). `?q=` prefills the composer; `?topic=` prefills "Explain … simply". |

Both pages highlight the right nav item (`lecture.html` uses `data-nav="courses"`), set breadcrumbs (My Courses › COMP 3610 › lecture), and use Bootstrap's responsive offcanvas for small screens:

| Width | Lecture workspace | AI Tutor |
|---|---|---|
| ≥ 1200 | three panels | three panels |
| 768–1199 | lecture list → dropdown; tools beside (≥992) or below the viewer | context panel → **Context** drawer |
| < 768 | viewer full width; **Lectures** and **Study tools** open as bottom sheets; narrower paper so Fit stays readable | conversations/course and context become drawers |

The course page's Lectures tab links each ready lecture to `lecture.html`; `course.html?…&tab=quizzes&quiz=qz_…` highlights a saved quiz (AI quizzes carry an **AI** badge).

### Rules the AI follows

- **Course isolation.** `api.js` builds the page list from the conversation's course only (`coursePages(courseId, lectureId)`) and passes nothing else to the mock AI. After every answer, summary and notes, `mockAI.assertCourseIsolation()` re-checks each source and **throws** if one belongs to another course.
- **A conversation never changes course.** `ai.chat` returns **409** if `courseId` differs from the conversation's. In the UI, picking another course while a conversation has messages asks first, then starts a new conversation (the old one is kept).
- **No API keys in the frontend.** The LLM key will live only in FastAPI; the store scrubs any `password` / `token` / `secret` / `apiKey` field before saving.
- **Every assistant message shows a "Demo response" badge.**

### Content model (mock store additions)

| Table | Fields | Notes |
|---|---|---|
| `lectureContent` | `lectureId, generated, pages: [{ page, heading, text }]` | Extracted text, Markdown (maths in `$…$`/`$$…$$`, code in fences). Seeded from `data/lecture-content.js`. Lectures uploaded in the browser get **generated placeholder pages labelled "Demo content"** (4–12, from file size); `generated: true`. `lecture.pageCount` matches the pages. |
| `conversations` (`conv_`) | `id, userId, courseId, lectureId \| null, title, createdAt, updatedAt` | Title = first question (60 chars); rename up to 80. |
| `messages` (`msg_`) | `id, conversationId, role ('user'\|'assistant'), content (Markdown), sources [{ lectureId, page, snippet }], status ('complete'\|'error'), createdAt` | Mock extras: `intent`, `attempt` (regenerate count), `stopped`. Responses add `lectureTitle`/`lectureNumber` to each source. |
| `summaries` (`sum_`) | `id, lectureId, courseId, content, sources, createdAt` | One per lecture; regenerating replaces it. |
| `notes` (`note_`) | `id, lectureId, courseId, content, sources, createdAt` | One per lecture; Markdown, downloadable. |
| `quizzes` (existing) | + `source: 'ai', lectureId, questions: [{ id, prompt, options[4], answerIndex, explanation, page }], createdAt` | `quizzes.list` omits `questions`; `quizzes.get(id)` includes them for the Quizzes stage. |

Cascades: deleting a course also deletes its lecture text, summaries, notes, conversations and messages. Deleting a lecture deletes its text, summary and notes; conversations scoped to it fall back to "all lectures"; old citations to it show "Lecture removed".

**Migration:** stage 3 stores are upgraded in place (missing tables added) — nothing is wiped. Lecture text and two sample conversations are filled in the first time a page that loads `lecture-content.js` and `mock-ai.js` runs (the lecture and AI Tutor pages). **Reset demo data** restores everything.

### Mock AI (`services/mock-ai.js`)

Pure functions with no network calls: `chat`, `summarize`, `studyNotes`, `generateQuiz`, `assertCourseIsolation`.

- **Retrieval:** keyword match over the given pages only — headings count 4×, lecture title 2×, body 1× — then the top 2–3 pages. Short follow-ups borrow terms from the previous question.
- **Intents** (from the wording): *explain* (default), *summarize*, *example* (uses a code block from the lecture when the course is technical, or a worked maths example), *test my understanding* (2–3 questions with answers hidden in `<details>`). Maths answers include the relevant `$$…$$` formula.
- **Citations** are Markdown links like `[Lecture 6, p. 5](lecture.html?id=lec_3004&page=5)`; `sources` lists the same pages with a snippet.
- **No match:** it says it couldn't find the topic in this course's lectures and lists what it can help with — it never answers from another course.
- **Errors:** a message containing `/error` fails its first attempt (Retry succeeds); `config.mockAiFailRate` (0–1) fails any AI call at random. Failed replies are stored with `status: 'error'` and show **Retry**. `config.mockAiLatencyMs` (900) sets the wait before the reply appears.
- **Streaming:** the API returns the whole message (as the contract says); the page reveals it word by word. **Stop** saves what was shown via `messages.update` and marks it *Stopped*. The real version will stream tokens over SSE.

### API contract (stage 4)

| Method | Endpoint | Returns |
|---|---|---|
| `ai.chat({ conversationId, courseId, lectureId, message, history, learnerContext })` | `POST {aiBaseUrl}/tutor/chat` (FastAPI; SSE later) | `{ message: { id, content, sources: [{ lectureId, page, snippet }] } }` — mock also returns `conversation` (created when `conversationId` is empty) and `userMessage`. `replaceMessageId` regenerates/retries. Errors: 409 course change, 422 empty/too long, 503 simulated failure (`err.details.message` is the stored error reply). |
| `ai.summarize({ lectureId, options })` | `POST {aiBaseUrl}/lectures/{id}/summary` | summary record |
| `ai.studyNotes({ lectureId, options })` | `POST {aiBaseUrl}/lectures/{id}/notes` | notes record |
| `ai.generateQuiz({ lectureId, options: { count, difficulty } })` | `POST {aiBaseUrl}/lectures/{id}/quiz` | quiz with `source: 'ai'` and `questions` |
| `conversations.list({ courseId? })` | `GET /api/conversations` | with course, lecture title, message count, preview |
| `conversations.get(id)` / `create({ courseId, lectureId, title })` / `rename(id, title)` / `remove(id)` | `GET` / `POST /api/conversations` / `PATCH` / `DELETE /api/conversations/{id}` | |
| `messages.list(conversationId)` | `GET /api/conversations/{id}/messages` | oldest first |
| `messages.update(id, { content, stopped })` | `PATCH /api/messages/{id}` | keeps a stopped answer |
| `lectures.get(id)` | `GET /api/lectures/{id}` | lecture + course + saved summary, notes and AI quizzes |
| `lectures.pages(id)` | `GET /api/lectures/{id}/pages` | `{ lectureId, generated, pages }` |
| `quizzes.get(id)` | `GET /api/quizzes/{id}` | quiz including `questions` |

### Markdown and libraries

`TutorAI.markdown.renderMarkdown(text)` (also `TutorAI.renderMarkdown`) returns **sanitized** HTML: maths is protected from the Markdown parser, `marked` parses GFM, code blocks get highlight.js colours, a language label and a **Copy** button, maths is rendered with `katex.renderToString`, and **DOMPurify sanitizes the result every time** (scripts, `on*` attributes, `javascript:` links, iframes and forms are removed; external links get `rel="noopener noreferrer"`). User messages are never parsed as Markdown — they are shown as escaped text. If a library fails to load, rendering degrades to escaped plain text; it never returns unsanitized HTML.

Loaded on `lecture.html`, `ai-tutor.html` and (since 4.1, for its AI Tutor tab) `course.html`, pinned:

| Library | Version | Purpose |
|---|---|---|
| marked | 12.0.2 | Markdown → HTML |
| DOMPurify | 3.1.6 | Sanitizing all rendered HTML |
| KaTeX | 0.16.11 (+ CSS) | Inline `$…$` and block `$$…$$` maths |
| highlight.js | 11.9.0 (+ GitHub theme) | Code highlighting |

KaTeX's auto-render extension isn't loaded: `renderMarkdown` must return a finished string, and maths has to be shielded from Markdown before parsing, so `katex.renderToString` is used on the protected segments instead.

`validation.js` now supports radio groups (`form.elements[name]` as a `RadioNodeList`): the value is the checked option and errors attach to the first radio.

## Academic workspace (stage 3)

| Page | What it does |
|---|---|
| `pages/student/dashboard.html` | Greeting hero (date, study streak), Continue learning (last opened course), stat tiles (courses, lectures, quizzes completed, average score), top 3 course cards, recent activity, recommended revision, quick actions. One call: `dashboard.summary()`. |
| `pages/student/courses.html` | Search (title or code), term and status filters, sort (recent, name, progress), all kept in the URL: `?q=&term=&status=&sort=`. Add/Edit share one modal; Delete confirms and names the course. Deep links: `?new=1`, `?edit=crs_2001`. |
| `pages/student/course.html?id=…&tab=…` | Cover header with progress and mastery, Upload lecture. Tabs: `overview`, `lectures` (search, delete, `&lecture=lec_…` highlights a row), `ai-tutor` (suggested questions → `ai-tutor.html?course=…&q=…`), `quizzes`, `progress` (progress and mastery tiles, best score per lecture, Chart.js scores over time, topic mastery). Tabs switch without reloading; back and forward work. Opening the page updates `lastAccessedAt`. |
| `pages/student/course-upload.html?id=…` | Drag-and-drop or Browse, one PDF up to 20 MB (extension + MIME type, empty and too-large checks). Title and lecture number are prefilled from the file name. Simulated Uploading → Extracting text → Processing → Ready stepper; Cancel while uploading. Without `?id=` it asks which course. |

Missing or unknown course ids show **Course not found** with a link back to My Courses. 

### Data model

| Entity | Fields | Notes |
|---|---|---|
| `courses` (`crs_`) | `id, userId, code, title, instructor, term, color, description, status, createdAt, lastAccessedAt` | `status`: `active` \| `archived`. `color`: `lavender` \| `powder` \| `sage` \| `butter` \| `pink` \| `peach`. Codes are unique per student. |
| `lectures` (`lec_`) | `id, courseId, title, lectureNumber, description, fileName, fileSizeKb, pageCount, status, uploadedAt` | `status`: `uploading` → `extracting` → `processing` → `ready`, or `failed`. Replaces stage 1 "documents". |
| `quizzes` (`qz_`) | *Replaced in stage 5* | See [Quizzes and learning analytics](#quizzes-and-learning-analytics-stage-5): quizzes now hold questions, and scores live on attempts. |
| `activity` (`act_`) | `id, userId, type, courseId, title, createdAt` | Written by the API on create/update/delete/upload. |

**Calculated, never stored** (added to every course response):
- `lectureCount` (all lectures), `readyLectureCount`, `attemptedLectureCount`, `quizCount`, `completedQuizCount`, `averageScore`.
- **`progress` = coverage**: the percentage of the course's **ready** lectures that have at least one completed quiz attempt, `round(attempted ÷ ready × 100)`. It's `0` when no lecture is ready. Uploading, failed and still-processing lectures don't count.
- **`mastery`**: the average, across those **attempted** ready lectures, of each lecture's **best** quiz score (0–100). It's `null` (shown as "—") until a lecture has been attempted. Unattempted lectures don't pull mastery down; they lower progress instead.
- `averageScore` is different again: the plain mean of every completed quiz in the course, retakes included.
- Each lecture from `lectures.list()` carries `bestScore` (or `null`), so the Progress tab's "By lecture" list shows exactly where both numbers come from.

Example: a course with 4 ready lectures, best scores 92, 80, 58 and one not quizzed → progress **75%** (3 of 4), mastery **77%** ((92 + 80 + 58) ÷ 3).

Where they appear: course cards (progress bar with "3 of 4 lectures quizzed", mastery badge), the course header (two bars side by side), the Progress tab (two tiles plus a per-lecture list), and the dashboard's Continue learning tile. The My Courses **Progress** sort orders by progress, then mastery.

**Recommended revision** lists topics averaging under 65% (lowest first; was 75% before stage 5). The **study streak** counts consecutive days with activity or a completed quiz, ending today (or yesterday).

**Deletes cascade**: deleting a course deletes its lectures and quizzes (and notifications that link to it); activity history is kept without the link. Deleting a lecture keeps its quizzes but unlinks them.

### Mock store

`mock-data.js` is only **seed** data. On first load `api.js` copies it into a store in localStorage under **`tai.mockdb.v1`**, and every non-GET call saves the store, so changes carry across pages, reloads and tabs.

- **Never holds passwords.** Auth fixtures (demo password, reset token) stay in memory, and the store is scrubbed of any `password`/`token`/`secret` key before saving.
- **IDs are never reused** after a delete (per-prefix sequences in `meta.sequences`, like `AUTO_INCREMENT`).
- **Uploads abandoned mid-pipeline** (tab closed) are marked `failed` after 10 minutes.
- **Reset:** profile menu → **Reset demo data** (student shell, mock mode only), or `await TutorAI.api.dev.resetMockData()` in the console. `TutorAI.api.dev.inspect()` returns the raw store.
- Bump the key (e.g. `tai.mockdb.v2`) in `config.js` if the seed's shape changes; old stores are then ignored and reseeded.

### API methods (stage 3)

| Method | Planned endpoint |
|---|---|
| `courses.list()` | `GET /api/courses` (with calculated `progress`, `mastery` and counts, most recently accessed first) |
| `courses.get(id)` | `GET /api/courses/{id}` |
| `courses.markAccessed(id)` | `POST /api/courses/{id}/access` (sets `lastAccessedAt`) |
| `courses.create(data)` | `POST /api/courses` (409 duplicate code, 422 validation) |
| `courses.update(id, changes)` | `PATCH /api/courses/{id}` |
| `courses.remove(id)` | `DELETE /api/courses/{id}` (cascades) |
| `lectures.list(courseId)` | `GET /api/courses/{courseId}/lectures` (each with calculated `bestScore`) |
| `lectures.create(courseId, data)` | `POST /api/courses/{courseId}/lectures` (multipart: `lecture_file`, `title`, `lecture_number`, `description`; 409 number taken, 413 too large) |
| `lectures.updateStatus(id, status)` | `PATCH /api/lectures/{id}/status` (server-driven in production; the page polls) |
| `lectures.remove(id)` | `DELETE /api/lectures/{id}` (also cancels an upload) |
| `quizzes.list(courseId?)` | `GET /api/quizzes?courseId=` (now takes a filter object; see stage 5) |
| `activity.list({ limit })` | `GET /api/activity?limit=` |
| `dashboard.summary()` | `GET /api/dashboard/summary` |
| `dev.resetMockData()` | mock only |

Shared course UI lives in `components/course-ui.js`: `TutorAI.components.CourseCard.render(course, { menu })` and `TutorAI.components.CourseUI` (`lectureStatus`, `scoreBadge`, `masteryBadge`, `coverageText`, `courseUrl`, `uploadUrl`, `iconFor`, `COLORS`).

## Authentication pages (stage 2)

| Page | What it does |
|---|---|
| `pages/auth/login.html` | Email + password (show/hide), remember me, forgot-password link, loading button, demo credentials. Goes to `?next=` (a safe app path) or the dashboard. |
| `pages/auth/register.html` | Full name, email, password with live strength meter and checklist, confirm password, terms. Shows a success state with the new `usr_` id. |
| `pages/auth/forgot-password.html` | Email → "If an account exists, we've sent a link" state, plus a demo link to the reset page. |
| `pages/auth/reset-password.html?token=…` | New password + confirm with strength meter → success state. No token, or a token the API rejects, shows "invalid or expired link". |
| `pages/student/profile.html` | Header card, view/edit personal details, change password, account information. |

**Demo credentials** (mock mode): student `maya.chen@university.ca`, admin `owner@tutorai.app`, password `Practise2026!` for both.
Reset token: `demo`. Any email works for "forgot password".

**Mock errors to try**

| Where | Input | Result |
|---|---|---|
| Login | wrong password or unknown email | "Incorrect email or password" (401) |
| Register, profile | `taken@tutorai.app` (or another user's email) | "This email is already registered" on the email field (409) |
| Reset password | `?token=` anything but `demo` | Invalid / expired link state (410) |
| Change password | wrong current password | Inline error on "Current password" (422) |

### Auth layout

Auth pages don't use the app shell. They declare `data-layout="auth"` and `auth-layout.js` adds the logo, the
"Demo mode — authentication not connected" note, the footer and the pastel bento panel, then fires `tutorai:ready`.

```html
<body class="page-login" data-layout="auth" data-page="login" data-root="../../">
  <main id="page-content"> …heading + form only… </main>
```

Below 992px the panel is hidden and the form fills the screen. Copy an existing `pages/auth/*.html` file to add another auth page.

### Forms and validation

Every form uses `method="post"`, `novalidate`, an `action` matching its planned endpoint, and `name` attributes that
match the future PHP `$_POST` fields (`full_name`, `email`, `password`, `confirm_password`, `terms`, `remember`,
`current_password`, `new_password`, `institution`, `program`, `year_of_study`, `bio`, `token`). Page scripts convert
these to the camelCase JSON fields the API uses.

Wrap each control in `.tai-field`. Then bind the form with `TutorAI.validation`:

```js
const V = TutorAI.validation;
const form = V.bind(document.getElementById('register-form'), {
  email:            [V.required('Enter your email address.'), V.email()],
  password:         [V.required('Create a password.'), V.strongPassword('fair')],
  confirm_password: [V.required('Confirm your password.'), V.match('password', 'Passwords do not match.')]
}, {
  fieldMap: { acceptTerms: 'terms' },          // API error key → form field name
  onSubmit: async (values, form) => {
    try { await TutorAI.api.auth.register({ … }); }
    catch (err) { form.showServerErrors(err) || V.formAlert(form.form, { message: err.message }); }
  }
});
V.strengthMeter(document.getElementById('register-password'));
```

- Validators: `required`, `email`, `minLength(n)`, `maxLength(n)`, `match(otherField)`, `strongPassword(min)`; `passwordStrength(value)` returns `{ level, score, checks }`.
- Fields validate on blur and on submit, re-check as you type once an error is showing, and the first invalid field gets focus.
- Errors render as `#{id}-error` and are linked with `aria-invalid` and `aria-describedby`. `showError` / `clearError` work on any field.
- `formAlert(form, { variant, title, message })` fills the form's `[data-form-status]` slot with an alert.
- Password show/hide: wrap the input in `.tai-password` with a `[data-password-toggle]` button. `TutorAI.ui.enhance()` wires it up.

**Strength levels:** weak (under 8 characters, or 2 or fewer checks), fair (8+ characters and 3 checks), strong (all 4). New passwords must be at least fair.

### API methods (mock now, PHP later)

| Method | Planned endpoint |
|---|---|
| `auth.login({ email, password, remember })` | `POST /api/auth/login` |
| `auth.register({ firstName, lastName, email, password, acceptTerms })` | `POST /api/auth/register` |
| `auth.requestPasswordReset({ email })` | `POST /api/auth/forgot-password` (always 200, no account enumeration) |
| `auth.resetPassword({ token, password })` | `POST /api/auth/reset-password` |
| `auth.logout()` | `POST /api/auth/logout` |
| `users.updateProfile(changes)` | `PATCH /api/users/me` |
| `users.changePassword({ currentPassword, newPassword })` | `POST /api/users/me/password` |

Validation errors use `{ "message": "…", "errors": { "email": "…" } }` with status 422 (409 for duplicates), keyed by the camelCase field. `ApiError.details.errors` carries this to the page.

### Storage rules

- **Passwords are never stored** in localStorage, sessionStorage or anywhere else. Forms clear password fields after each attempt.
- "Remember me" keeps only the email, in localStorage (`tai.auth.email`).
- In mock mode, profile edits and the last-login time are saved in the mock store (`tai.mockdb.v1`, see above) like every other change. (Stage 2 used sessionStorage; stage 3 moved them into the store.)
- Topbar **Sign out** calls `auth.logout()` (clears the session) and opens `pages/auth/login.html`.

## Reusable JS components

```js
TutorAI.ui.toast({ title: 'Saved', message: 'Your changes are live.', variant: 'success' }); // success|info|warning|danger|ai
TutorAI.ui.emptyState({ icon: 'book-open', title: 'No courses yet', text: '…', actions: [{ label: 'Add course', icon: 'plus' }] });
TutorAI.ui.skeleton('card' | 'list' | 'text', count);
TutorAI.ui.spinner({ label: 'Loading…' });
TutorAI.ui.setButtonLoading(button, true);
await TutorAI.ui.confirm({ title: 'Remove course?', confirmLabel: 'Remove', danger: true });
TutorAI.ui.pageHeader({ eyebrow, title, subtitle, actions });
TutorAI.ui.icons(scope); // render Lucide icons after inserting HTML
TutorAI.ui.passwordToggles(scope); // show/hide buttons in .tai-password fields (run by enhance)
TutorAI.shell.setUser(user); // refresh the topbar name and avatar after a profile edit
```

## Backend compatibility

- **Data and presentation are separate.** Pages call `TutorAI.api.*`, never `mockData`.
- **One switch.** Set `useMockData: false` in `config.js` and `api.js` calls the real endpoints. Each method lists its planned endpoint.
  - PHP + MySQL: `apiBaseUrl` (`/api`), e.g. `GET /api/courses`
  - FastAPI (AI): `aiBaseUrl` (`http://localhost:8000`), e.g. `POST /tutor/chat`, `POST /lectures/{id}/summary`
- **Response envelope:** `{ "success": true, "data": … }`. Errors: `{ "message": "…" }` with an HTTP status code.
- **ID convention:** prefixed strings mapping to MySQL primary keys: `usr_1001`, `crs_2001`, `lec_3001`, `qz_4001`, `ntf_5001`, `act_7001`, `conv_1`, `msg_1`, `sum_1`, `note_1`.
- **Field names:** camelCase in JSON (`firstName`), snake_case in MySQL (`first_name`). PHP converts between them.
- **Dates:** ISO-8601 UTC strings.
- **Shared layout with PHP:** the `<head>` and script tags in `_template.html` can move into `includes/head.php` and `includes/scripts.php` once PHP is added.

Not implemented yet, by design: real sessions and password hashing (PHP), the MySQL database ([schema.sql](schema.sql)), real file uploads and PDF text extraction, the real LLM (FastAPI). In mock mode these are simulated and data lives in the browser's mock store. The full contract is in [API.md](API.md).

## Responsive behaviour

| Width | Sidebar |
|---|---|
| ≥ 1200px | Full. The topbar button collapses it to an icon rail (remembered in localStorage). |
| 992–1199px | Icon rail by default, with tooltips |
| < 992px | Off-canvas drawer with backdrop. Esc or a link closes it. |
| < 768px | Search becomes an icon that opens the command palette |

Keyboard: `Ctrl/⌘ + K` opens the command palette. `Esc` closes the drawer and search. A skip link is available for keyboard users.

## Design rules: "pastels with black"

- **White canvas, ink-black structure.** Text, primary buttons, the active nav pill and feature tiles use `#18181B`.
- **Pastels are big blocks, never tiny accents.** Lavender, powder blue, mint, pink, butter and peach fill whole tiles and covers. Text on a pastel uses its ink tone (`--tai-lavender-ink` etc.).
- **DM Serif Display** is for big numbers, page titles, hero greetings and tile titles. Everything else uses Inter.
- **Pill buttons.** One black primary per view. `btn-soft` (lavender) is for AI actions.
- **Everything clickable moves.** Cards lift, tile arrows rotate, numbers count up, bars fill, tabs slide.

### Cards

```html
<!-- Bento grid of pastel tiles -->
<div class="tai-bento">
  <a class="tai-tile tai-tile--lavender tai-tile--interactive span-6" href="…">
    <div class="tai-tile__top"><span class="tai-tile__label">…</span><span class="tai-tile__arrow"><i data-lucide="arrow-up-right"></i></span></div>
    <h3 class="tai-tile__title">…</h3>
    <span class="tai-tile__deco"><i data-lucide="sparkles"></i></span>
  </a>
  <div class="tai-tile tai-tile--butter span-3">
    <div class="tai-tile__value" data-count-to="82" data-count-suffix="%">0%</div>
  </div>
</div>

<!-- Course card with pastel cover -->
<a class="tai-course-card" style="--cover:var(--tai-powder);--cover-ink:var(--tai-powder-ink)">…</a>
```

Tile colours: `lavender`, `powder`, `sage`, `butter`, `pink`, `peach`, `white`, `dark`. Spans: `span-3/4/5/6/7/8`, `row-2`.

### Motion helpers (run by the shell automatically)

| Markup | Effect |
|---|---|
| `data-count-to="82" data-count-suffix="%"` | Number counts up |
| `<span data-meter="68">` in `.tai-meter` or `.progress-bar` | Bar fills |
| `.tai-segmented[data-segmented]` | Sliding tab indicator |
| `data-reveal` | Fades in on scroll |
| page content | Children fade up in sequence on load (`data-no-enter` on `<main>` to opt out) |

After injecting HTML from JS, call `TutorAI.ui.enhance(container)`.

### Command palette

`Ctrl/⌘ + K` or the top bar search opens a palette that jumps to pages, courses and actions. Items come from `navigation.js` and `TutorAI.api`, so new pages and courses show up automatically.
