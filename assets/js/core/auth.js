/**
 * TutorAI — client-side auth guard
 * ------------------------------------------------------------------
 * IMPORTANT: this is a USER-EXPERIENCE check only, not security.
 * Anyone can edit browser JavaScript, so hiding a page here protects
 * nothing. The PHP API enforces sessions AND roles server-side: every
 * endpoint except /api/auth/* checks $_SESSION['user_id'] (401 when
 * missing), every /api/admin/* endpoint checks the user's role in MySQL
 * (403 unless 'admin'), and student endpoints only return rows the
 * signed-in student owns.
 *
 * What this file does:
 *   • requireAuth()        any app page: signed-out visitors go to the
 *                          sign-in page, with ?next= to come back.
 *   • requireRole(role)    requireAuth() plus the role check:
 *                            admin page + student → friendly 403 page
 *                            student page + admin → the admin dashboard
 *   • redirectIfSignedIn() sign-in / create-account pages: a signed-in
 *                          user goes straight to their home page.
 *   • homeFor(user)        the dashboard for that user's role.
 *   • safeNext(value, role) only same-site relative app paths for that
 *                          role are followed (no open redirects).
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
  const ADMIN_HOME = 'pages/admin/dashboard.html';
  const homeFor = (user) => (user && user.role === 'admin' ? ADMIN_HOME : HOME);

  /** Current page as a project-relative path, e.g. "pages/student/course.html?id=crs_2001". */
  function currentPath() {
    const rootUrl = new URL(T.utils.url(''), window.location.href);
    const here = window.location.pathname + window.location.search + window.location.hash;
    return here.startsWith(rootUrl.pathname) ? here.slice(rootUrl.pathname.length) : '';
  }

  /**
   * Accept only relative app paths (no protocol, host or "//"):
   * "pages/student/…" for students, "pages/admin/…" for admins.
   * Without a role, either is accepted (checked again after sign-in).
   */
  function safeNext(value, role = null) {
    const m = /^pages\/(student|admin)\/[\w-]+\.html([?#][^\s]*)?$/.exec(String(value || ''));
    if (!m) return null;
    return !role || m[1] === role ? m[0] : null;
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

  /**
   * App pages for one role. Resolves with the user only when the role matches;
   * otherwise shows the 403 page (admin pages) or redirects (student pages)
   * and resolves null.
   */
  async function requireRole(role) {
    const user = await requireAuth();
    if (!user || document.body.dataset.auth === 'optional') return user;
    if (user.role === role) return user;
    if (role === 'admin') { forbidden(user); return null; }
    window.location.replace(T.utils.url(homeFor(user)));   // an admin opening a student page
    return null;
  }

  /** Friendly 403: replaces the page (the shell is never built). */
  function forbidden(user) {
    const { escape, url } = T.utils;
    document.title = 'Admins only · TutorAI';
    document.body.className = 'page-404';
    document.body.innerHTML = `
      <main class="nf" id="page-content">
        <a href="${escape(url('index.html'))}" class="nf__brand"><img src="${escape(url('assets/img/logo-full.svg'))}" alt="TutorAI home" height="36" width="151"></a>
        <section class="tai-tile tai-tile--butter nf__tile" aria-labelledby="nf-title">
          <p class="nf__code" aria-hidden="true">403</p>
          <h1 class="tai-display nf__title" id="nf-title">This page is for <em>admins</em>.</h1>
          <p class="nf__lead">You’re signed in as ${escape(user.firstName || 'a student')}, a student account. The admin console manages TutorAI accounts, so it needs an administrator sign-in.</p>
          <div class="nf__actions">
            <a class="btn btn-primary btn-lg" href="${escape(url(HOME))}">${T.ui.icon('layout-dashboard')}<span>Go to my dashboard</span></a>
            <button type="button" class="btn btn-secondary btn-lg" data-action="switch-account">${T.ui.icon('log-out')}<span>Sign in as admin</span></button>
          </div>
          <span class="tai-tile__deco" aria-hidden="true">${T.ui.icon('shield')}</span>
        </section>
      </main>`;
    T.ui.icons(document.body);
    document.body.querySelector('[data-action="switch-account"]').addEventListener('click', async (e) => {
      T.ui.setButtonLoading(e.currentTarget, true);
      try { await T.api.auth.logout(); } catch (err) { /* sign out locally regardless */ }
      window.location.replace(T.utils.url(`${LOGIN}?next=${encodeURIComponent(ADMIN_HOME)}`));
    });
    reveal();
    document.getElementById('nf-title').setAttribute('tabindex', '-1');
    document.getElementById('nf-title').focus();
  }

  /** On sign-in pages: skip the form when a session already exists. */
  async function redirectIfSignedIn() {
    const user = await session();
    if (user) {
      const next = safeNext(new URLSearchParams(window.location.search).get('next'), user.role);
      window.location.replace(T.utils.url(next || homeFor(user)));
      return user;
    }
    reveal();
    return null;
  }

  T.auth = { requireAuth, requireRole, redirectIfSignedIn, homeFor, safeNext, HOME, ADMIN_HOME, LOGIN };
})(window.TutorAI);
