# TutorAI v1.0.0 — QA report (Stage 6)

Review date: 16 Nov 2026 · Build: static frontend on the mock backend (`config.useMockData = true`) · Browser: Chrome (desktop), served by `dev-server.py`.

**Legend:** ✅ pass (checked, nothing to change) · 🔧 fixed in this stage (now passes) · ⚠️ known limitation (see the last section)

## How it was checked

| Method | What it covered |
|---|---|
| Hands-on in Chrome | Sign in, register, sign out, guard redirects, settings, export, delete chats, delete account, course create/edit/delete, lecture upload, quiz resume, retry, timer auto-submit, leave-warning, 404, terms dialog |
| Scripted page sweeps (same-origin iframes, every page) | Console errors and warnings; horizontal overflow at 1440, 1024, 768 and 390 px; text contrast (WCAG AA: 4.5:1, or 3:1 for large text); form labels, button and link names, image `alt`, positive `tabindex`, duplicate ids; internal links (every `href` fetched) |
| Node data tests (the real `api.js` with a stubbed `localStorage`) | Session and 401s; settings validation; export; delete chats / account cascade; migration from a Stage 4 store; Stage 5 scoring, resume, retry, per-lecture credit and analytics; AI Tutor course isolation (30 cross-course probes); live-mode request shapes (multipart upload); scan of stored keys for passwords or tokens |

## Checklist by page

Columns follow the Part C checklist. 1 complete · 2 links and buttons · 3 layout, header, breadcrumbs · 5 navigation flow · 8 persists · 9 validation and loading/empty/error states · 10 accessibility · 11 responsive · 12 console clean. Items 4, 6, 7 and 13 are covered in the next section.

| Page | 1 | 2 | 3 | 5 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|
| Launcher `index.html` | ✅ | 🔧 | ✅ | ✅ | n/a | n/a | 🔧 | ✅ | ✅ |
| Sign in | ✅ | 🔧 | ✅ | 🔧 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create account | ✅ | 🔧 | ✅ | 🔧 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Forgot / reset password | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| My Courses | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| Course workspace (5 tabs) | ✅ | 🔧 | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| Upload lecture | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | 🔧 | ✅ | ✅ |
| Lecture workspace | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| AI Tutor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| Quizzes hub | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| Create a quiz | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | 🔧 | ✅ | ✅ |
| Take a quiz (focus mode) | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quiz results | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | 🔧 | ✅ | ✅ |
| My Progress | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | 🔧 | ✅ |
| My Profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ | ✅ |
| Settings (new) | 🔧 | 🔧 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 404 (new) | 🔧 | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ | ✅ |
| Design system | ✅ | 🔧 | ✅ | ✅ | n/a | n/a | 🔧 | ✅ | ✅ |
| Admin Dashboard (restored) | 🔧 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔧 | ✅ |

The 🔧 marks under 10 are mostly the site-wide contrast fix (muted text on pastel tiles). Each 🔧 is explained under "Bugs fixed".

## Cross-cutting checks

| # | Check | Result |
|---|---|---|
| 4 | Sign in → dashboard (or back to `?next=`), register → signed in, forgot/reset, sign out | 🔧 Before this stage the mock session was always "signed in", so sign-out didn't really sign out and there was no guard. Now: a real `{ userId }` session, `requireAuth()` on every app page (focus mode included), `redirectIfSignedIn()` on sign-in and create-account, and safe `next` redirects. |
| 6 | AI Tutor stays course-specific | ✅ Re-run: 6 prompts × 5 courses (30 answers). 0 sources and 0 mentions from another course. Chat, conversation or quiz requests with another course's lecture → 422. Learner context only lists the course's own lectures. |
| 7 | Scoring, retry, resume, timer, per-lecture credit; analytics, dashboard, AI suggestions update | ✅ Stored score = regraded score. Resume restores answers, position and flags. Retry keeps the old attempt. A 2-lecture quiz credits each lecture separately (40% / 100%). Progress 75 → 100 after a new attempt. 🔧 The timer auto-submit works; the results page now shows "Submitted when time ran out" every time (it was a one-time tab flag) and counts unanswered questions separately. |
| 8 | Profile and settings persist | ✅ Profile (Stage 2 tests). Settings survive a reload and are applied on the next page load (motion) and on the dashboard (goal). |
| 9 | Forms validate; async loading/empty/error states | ✅ Every form validates inline (`validation.js`), and server errors map to fields. 🔧 Quiz creation's lecture list could hang on a failed load; it now shows an error with Try again. |
| 10 | Keyboard, focus, labels, live regions, contrast ≥ 4.5:1, reduced motion | 🔧 Contrast: 6 failing colour pairs fixed through two tokens. 🔧 Focus ring also visible in forced-colours mode. 🔧 Reduced motion: an in-app setting plus the OS setting, now also stopping chart animation and JS smooth scrolling. ✅ Labels, names, alt text, tabindex and duplicate ids: 0 issues on every page. |
| 11 | No overflow at 1440 / 1024 / 768 / 390; charts readable; forms fit; viewer and tutor adapt | ✅ 0 pages overflow at any width. 🔧 The topic chart clipped long labels; they now show on two lines (topic + course) and are shortened with the full name in the tooltip. |
| 12 | No console errors or warnings; dead code and unused files removed; libraries only where used | ✅ 0 messages on all pages. 🔧 Removed: the placeholder-page renderer, an unreachable quiz toast, the unused `search.query` endpoint, the empty `assets/icons/`, commented-out script blocks, and `validation.js` on 4 pages that have no forms. Lucide pinned to 1.73.0 (was `@latest`). |
| 13 | Quiz leave-warning only while a save is pending | 🔧 A change counter: the warning shows only when a change is waiting for its debounce, a save is in flight, or the last save failed. Verified: leaving right after a saved answer is silent; leaving mid-typing warns. |

## Part A: admin side (removed, then restored as one page)

Stage 6 first removed the old admin console (6 placeholder pages). The assignment requires an admin page, so a **minimal admin side** was rebuilt against the current code, using the baseline commit (`8c07f0f`) only as reference: one page, `pages/admin/dashboard.html`, in the dark admin shell. See "Admin console" below.

## Bugs fixed in this stage

1. **No real sign-out or sign-in guard.** The mock session was fixed per shell. Now there is one `{ userId }` session, the API answers 401 when signed out, `core/auth.js` guards the pages, and the sign-in page shows why you were sent there.
2. **Register opened the sample student's data.** A new account is now signed in as itself and starts empty.
3. **Quiz leave-warning fired even when everything was saved** (item 13).
4. **Timer submission label disappeared after a reload** (one-time tab flag). It's now derived from `submittedAt ≥ deadlineAt`. Unanswered questions were counted as "incorrect"; they're now listed separately.
5. **My Progress date-range buttons didn't work.** The segmented control's event didn't bubble to the page. Fixed in the shared component; the other two uses still work.
6. **Short-answer feedback said "partial credit (0 point)"** for 1 of 3 key ideas. It now says how many ideas earn partial credit.
7. **AI Tutor quiz reply said "focusing on *gradient, descent*".** It now uses the parsed topic ("gradient descent").
8. **Text contrast below 4.5:1.** Sidebar section titles 2.39:1, and muted text on pastel tiles 4.2–4.4:1. Fixed via `--tai-text-faint` #6E6E78 and `--tai-text-muted` #5F5F69.
9. **Topic chart clipped long labels** ("TTP methods & …").
10. **Live-mode uploads would have sent JSON without the PDF.** `lectures.create` now sends `multipart/form-data` with `lecture_file`, matching the form.
11. **"Delete all chats" button re-enabled itself** after deleting everything.
12. **Upload didn't read "01 Intro.pdf" as lecture 1**, and gave "Week3_notes" as a title. Both fixed.
13. **Placeholder feedback:** "Coming soon" toasts for Terms/Privacy and "View all notifications". Replaced with a terms dialog and a link to Settings → Notifications.
14. **Stale copy:** the Profile note said changes last "for this browser tab only"; the sign-in badge said "authentication not connected".
15. **Dead link** in the style guide (a demo tile pointed to a page that doesn't exist).
16. **Dialogs missing `.modal-body`** padding (terms, delete account).
17. **Dashboard goal chip** took the hero's purple instead of the chip ink.

## Part D: PHP/MySQL readiness

| Check | Result |
|---|---|
| Data models in one place | ✅ `data/mock-data.js` (seed), `services/api.js` (store, rules, endpoint contract), `services/quiz-engine.js` (grading). MySQL draft in `docs/schema.sql`. |
| Mock data kept out of the UI | ✅ Only `api.js` reads `TutorAI.mockData`; pages call `TutorAI.api.*`. |
| All data access through `api.js` | ✅ No page uses `fetch` or `localStorage` for app data (`localStorage` holds only UI preferences). |
| Form names match fields | ✅ snake_case `name`s match the PHP fields in `docs/API.md`; server errors map back to fields. |
| Uploads use `multipart/form-data` | 🔧 Form ✅; the live-mode request is now multipart too (bug 10). |
| ID prefixes consistent | ✅ `usr_ crs_ lec_ qz_ q_ att_ conv_ msg_ act_ ntf_ sum_ note_`, never reused. |
| No passwords or tokens in localStorage | ✅ A scan of the stored keys finds none; the demo password string doesn't appear. Matches for "token" or "password" are lecture text (e.g. "bearer token", `password_hash`). |
| Every mock feature labelled as demo | ✅ Sign-in badge and credentials, upload notice, "Preview of extracted text — demo", "Demo content" pages, "Demo response" on AI answers, "AI feedback (demo)", Settings "Demo" note, terms "Demo" badge, Reset demo data. |
| Schema and API docs | ✅ `docs/schema.sql` (18 tables, including `admin_actions`: PKs, FKs with cascade rules, indexes, enums, a FULLTEXT key for retrieval). `docs/API.md` (every `api.js` method → HTTP method, PHP/FastAPI endpoint, request, response). |

## Admin console (restored)

**What it is:** one page with stat tiles (students, active users, courses, lectures), user management (search, status filter, activate/deactivate with a confirm dialog and a required reason), lecture processing status and recent activity. The demo admin is "Kareena Zaman, Platform Owner" (`owner@tutorai.app`). Ten fictional students were added to the seed; no passwords are stored for anyone.

| Check | Result |
|---|---|
| Role guard | ✅ Student → admin page: friendly 403 page (no shell, focus on the heading). Admin → any student page or the quiz player: sent to the admin dashboard. Signed-out → sign-in with `?next=`, then back to the admin page (with its filters). |
| Role-based redirect after login | ✅ Admin lands on the admin dashboard, students on theirs. `next` is only followed if it belongs to the user's role. |
| API role enforcement | ✅ A student calling any `api.admin.*` method gets 403. |
| Admin sees counts only | ✅ Every admin response was scanned for `content`, `answers`, `messages`, `password`, `prompt`, `correct`: none found. Activity uses generic labels. |
| Activate / deactivate | ✅ Empty reason → inline error; < 5 characters → 422; already in that state → 409; admins can't be changed (404). The success toast and live region announce it, focus returns to the row's button, and the change is written to `admin_actions` with the reason. |
| Deactivated users can't sign in | ✅ Login → 403 "This account has been deactivated…" (the form now titles it "Account deactivated"). A student deactivated while signed in loses the session on their next request. |
| Both demo accounts on the sign-in page | ✅ |
| Migration | ✅ A Stage 4 store (old admin record) and a Stage 6 store (student only, with an id collision) both keep the user's data and sign-in, gain the admin and sample students, and get no duplicate ids. |
| 1440 / 768 / 390 | ✅ Headless Chrome sweep of **every** page at all three widths, as the right role: 0 console messages, 0 overflow, 0 contrast failures, 0 unlabelled fields or unnamed buttons. |

**Bugs found and fixed while restoring it**

1. **A failed store migration silently reseeded the store**, wiping the user's data. The new migration called a helper defined later in the file; the loader's catch then started fresh. Fixed the call, and the loader now keeps the stored data if a migration ever fails.
2. **Visually hidden table headers could widen the page** (+101px at 768). The absolutely positioned label escaped the table's scroll container. `.tai-table-wrap` is now `position: relative`, which fixes this for every table.
3. **The user table squeezed Status and Action off-screen at tablet width**; rows now become labelled cards below 992px.
4. A deactivated user's sign-in error was titled "Something went wrong". It now says "Account deactivated".
5. Activity labels lower-cased "AI" ("asked the ai tutor").

**How it was tested:** the Claude-in-Chrome connection dropped during this round, so the checks above ran in headless Chrome, driven over the DevTools protocol from Node (real page loads, clicks and form submits; screenshots reviewed at 1440, 768 and 390), plus Node tests of the API.

## Results celebration

Added to `quiz-results.html` with `core/motion.js` (Web Animations API, no new libraries). The score ring is new: the hero previously showed only a counting percentage, so the ring now sits in that spot with the percentage inside it, using the tile's existing ink and pastel colours.

| Check (headless Chrome, sampled over time) | Result |
|---|---|
| 100%, first view | ✅ Ring and count-up run together (20% at 0.9s, 96% at 1.65s, done ~1.9s). The burst starts when the ring finishes: 50 pieces, lasting 1.58s, then the layer is removed. The "Perfect score" chip pops in. |
| 83%, first view / retry at 83% | ✅ 35 pieces each time (a retry is a new attempt). |
| 50% | ✅ Ring fills, no confetti, results fade in. |
| Reopened results, seeded attempt | ✅ Final score shown at once, no confetti. |
| Settings → Reduce motion; OS prefers-reduced-motion | ✅ Final score at once, no confetti or chip animation. |
| No scrolling, layout shift or blocked clicks | ✅ 0 horizontal overflow throughout; the hero's position never changes; `elementFromPoint` at the ring centre hits the score, not the confetti (`pointer-events: none`). |
| 1440 / 768 / 390 | ✅ No console messages during or after the burst. |

## Known limitations (what is mocked, and why)

| Area | Today (demo) | Why | Production plan |
|---|---|---|---|
| Accounts and sessions | `session.userId` in the browser's mock store; one demo password accepted for every account; nothing sent anywhere | No server in this build | PHP sessions (httpOnly cookie), `password_hash()`, CSRF tokens on writes, rate-limited login |
| Roles and the admin console | Role checks run in the mock API and `core/auth.js`. Deactivating someone only affects this browser's store, so an open session elsewhere isn't ended. | No server | PHP reads `users.role` on every `/api/admin/*` call; deactivation deletes that user's server sessions |
| Sign-in guard | `core/auth.js` hides pages and redirects | UX only: client checks can always be bypassed | PHP checks the session and ownership on every request (401/404) |
| Database | localStorage (`tai.mockdb.v1`), one browser only, ~5 MB | Static hosting | MySQL 8 using `docs/schema.sql` (**not yet run against a MySQL server**: none was available during review) |
| Lecture upload | File checked (type, size), never read or stored; processing steps simulated; uploaded lectures get labelled placeholder pages | No backend storage or PDF parser | `upload.php` stores the PDF outside the web root; a worker extracts text into `lecture_pages` |
| AI Tutor, summaries, notes, quiz writing | `services/mock-ai.js`: keyword retrieval and templates; answers labelled "Demo response" | No LLM key in the frontend, by design | FastAPI with retrieval over `lecture_pages`, streaming answers over SSE |
| Short-answer marking | Keyword matching (1 / 0.5 / 0) labelled "AI feedback (demo)" | Deterministic stand-in | LLM rubric grading in FastAPI, using the same response shape |
| Email | Forgot-password shows a confirmation; no email is sent (demo reset token `demo`) | No mail server | PHP mailer, single-use hashed tokens (`password_resets`) |
| Notifications | Created by the mock (e.g. lecture ready), filtered by Settings | No background jobs | Server events plus a weekly summary job |
| Account deletion / export | Affects this browser's store only | Mock store | `DELETE /api/account` (cascades), `GET /api/account/export` |

### Testing caveats

- Widths were measured by loading every page in same-origin iframes at 1440, 1024, 768 and 390 px (scroll width vs. viewport) and by screenshots at desktop width. The test window couldn't be narrowed to 390 px, so phone layouts were checked by measurement here, plus Stage 5's phone-width screenshots.
- Accessibility was checked with automated scripts (contrast, labels, names) and keyboard spot checks (quiz keys 1–4 and ←/→, dialogs, the skip link). Not tested with a real screen reader.
- Only Chrome was used. Firefox and Safari weren't tested in this pass.
- `docs/schema.sql` was reviewed by hand against the mock model but not executed.
