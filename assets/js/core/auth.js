/**
 * TutorAI — client-side auth guard
 * ------------------------------------------------------------------
 * IMPORTANT: this is a USER-EXPERIENCE check only, not security.
 * Anyone can edit browser JavaScript, so hiding a page here protects
 * nothing. The PHP API enforces sessions server-side: every endpoint
 * except /api/auth/* checks $_SESSION['user_id'] and answers 401 when
 * it is missing, and only returns rows the signed-in student owns.
 *
 * What this file does:
 *   • requireAuth()       app pages (data-shell / data-layout="focus"):
 *                         signed-out visitors go to the sign-in page,
 *                         with ?next= so they come back afterwards.
 *   • redirectIfSignedIn() sign-in / create-account pages: a signed-in
 *                         student goes straight to the dashboard.
 *   • safeNext(value)     only same-site relative app paths are followed.
 *
 * base.css hides app pages until html.tai-auth-ok is set, so signed-out
 * visitors never see a flash of app content.
 * A page can opt out with <body data-auth="optional"> (the style guide).
 */
(function (T) {
  'use strict';

  const reveal = () => document.documentElement.classList.add('tai-auth-ok');

  const LOGIN = 'pages/auth/login.html';
  const HOME = 'pages/student/dashboard.html';

  /** Current page as a project-relative path, e.g. "pages/student/course.html?id=crs_2001". */
  function currentPath() {
    const rootUrl = new URL(T.utils.url(''), window.location.href);
    const here = window.location.pathname + window.location.search + window.location.hash;
    return here.startsWith(rootUrl.pathname) ? here.slice(rootUrl.pathname.length) : '';
  }

  /** Accept only relative app paths such as "pages/student/…" (no protocol, host or "//"). */
  function safeNext(value) {
    const v = String(value || '');
    return /^pages\/student\/[\w-]+\.html([?#][^\s]*)?$/.test(v) ? v : null;
  }

  async function session() {
    try { return (await T.api.auth.session()).user || null; } catch (e) { return null; }
  }

  /** Resolves with the signed-in user, or redirects to sign-in and resolves null. */
  async function requireAuth() {
    if (document.body && document.body.dataset.auth === 'optional') { reveal(); return session(); }
    const user = await session();
    if (user) { reveal(); return user; }
    const next = safeNext(currentPath());
    window.location.replace(T.utils.url(LOGIN) + (next ? `?next=${encodeURIComponent(next)}` : ''));
    return null;
  }

  /** On sign-in pages: skip the form when a session already exists. */
  async function redirectIfSignedIn() {
    const user = await session();
    if (user) {
      const next = safeNext(new URLSearchParams(window.location.search).get('next'));
      window.location.replace(T.utils.url(next || HOME));
      return user;
    }
    reveal();
    return null;
  }

  T.auth = { requireAuth, redirectIfSignedIn, safeNext, HOME, LOGIN };
})(window.TutorAI);
