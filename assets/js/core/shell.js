/**
 * TutorAI — Application shell
 * ------------------------------------------------------------------
 * Wraps a page's <main id="page-content"> with the sidebar and topbar.
 * A page only declares who it is:
 *
 *   <body data-shell="student" data-page="courses" data-root="../../">
 *     <main id="page-content"> …page markup… </main>
 *
 * Optional body attributes
 *   data-nav="courses"     highlight a different nav item than data-page
 *                          (e.g. course.html lives under "My Courses")
 *   data-title="…"         override the topbar title
 *   data-search="false"    hide the topbar search control
 *
 * Pages can wait for the shell with:
 *   document.addEventListener('tutorai:ready', e => { e.detail.user … })
 *
 * Deeper pages can replace the breadcrumb trail:
 *   TutorAI.shell.setCrumbs([{ label: 'My Courses', href }, { label: 'COMP 3610', href }, { label: 'Upload' }])
 */
(function (T) {
  'use strict';

  const { $, $$, storage, isMobileLayout } = T.utils;
  const KEY = T.config.storageKeys.sidebarCollapsed;
  const C = T.components;

  let app;       // .tai-app root
  let role;      // always 'student' (navigation key)
  let tooltips = [];

  /* ---- Build -------------------------------------------------------------- */
  function build() {
    const body = document.body;
    role = body.dataset.shell;
    const pageId = body.dataset.page || '';
    const navId = body.dataset.nav || pageId;
    const match = T.navigation.find(role, navId);
    const title = body.dataset.title || (match && match.item.label) || '';
    const crumb = match ? match.section.label : T.navigation[role].label;
    const showSearch = body.dataset.search !== 'false';

    const content = document.getElementById('page-content') || document.createElement('main');
    content.id = 'page-content';
    content.classList.add('tai-content');
    content.setAttribute('tabindex', '-1');
    if (!content.hasAttribute('data-no-enter')) content.classList.add('tai-enter');

    app = document.createElement('div');
    app.className = `tai-app tai-app--${role} tai-no-transition`;
    app.id = 'tai-app';
    app.innerHTML = `
      <a class="visually-hidden-focusable btn btn-primary position-fixed m-2" style="z-index:2000" href="#page-content">Skip to content</a>
      ${C.Sidebar.render({ role, activeId: navId })}
      <div class="tai-sidebar-backdrop" data-action="close-sidebar" aria-hidden="true"></div>
      <div class="tai-main">
        ${C.Topbar.render({ role, title, crumb, showSearch })}
      </div>`;

    $('.tai-main', app).appendChild(content);
    body.prepend(app);

    if (title && !document.title.includes(title)) {
      document.title = `${title} · TutorAI`;
    }
  }

  /* ---- Sidebar state ------------------------------------------------------ */
  function isCollapsed() { return app.classList.contains('is-collapsed'); }

  function setCollapsed(collapsed, persist = true) {
    app.classList.toggle('is-collapsed', collapsed);
    if (persist) storage.set(KEY, collapsed);
    syncToggleState();
    syncTooltips();
  }

  function setDrawer(open) {
    app.classList.toggle('is-sidebar-open', open);
    document.body.classList.toggle('tai-lock-scroll', open);
    syncToggleState();
    if (open) {
      const active = $('.tai-nav-link.is-active', app) || $('.tai-nav-link', app);
      active && active.focus({ preventScroll: true });
    }
  }

  function syncToggleState() {
    const btn = $('[data-action="toggle-sidebar"]', app);
    if (!btn) return;
    const expanded = isMobileLayout() ? app.classList.contains('is-sidebar-open') : !isCollapsed();
    btn.setAttribute('aria-expanded', String(expanded));
  }

  /** Tooltips on nav links only make sense on the collapsed icon rail. */
  function syncTooltips() {
    tooltips.forEach(t => t.dispose());
    tooltips = [];
    if (!(window.bootstrap && bootstrap.Tooltip)) return;
    if (!isCollapsed() || isMobileLayout()) return;
    tooltips = $$('.tai-nav-link', app).map(el => new bootstrap.Tooltip(el, {
      placement: 'right', trigger: 'hover focus', container: 'body', offset: [0, 12]
    }));
  }

  function initSidebarState() {
    const stored = storage.get(KEY, null);
    const preferRail = window.matchMedia(`(max-width: ${T.config.breakpoints.rail}px)`).matches;
    setCollapsed(stored === null ? preferRail : !!stored, false);
  }

  /* ---- Events ------------------------------------------------------------- */
  function bindEvents() {
    app.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'toggle-sidebar') {
        isMobileLayout() ? setDrawer(!app.classList.contains('is-sidebar-open')) : setCollapsed(!isCollapsed());
      } else if (action === 'close-sidebar') {
        setDrawer(false);
      } else if (action === 'open-palette') {
        C.Palette.open();
      } else if (action === 'mark-all-read') {
        markAllRead(target);
      } else if (action === 'sign-out') {
        signOut(target);
      } else if (action === 'reset-demo-data') {
        resetDemoData();
      }
    });

    // Close the drawer after choosing a link on mobile
    $$('.tai-nav-link', app).forEach(link => link.addEventListener('click', () => {
      if (isMobileLayout()) setDrawer(false);
    }));

    const kbd = $('[data-search-kbd]', app);
    if (kbd && /Mac|iPhone|iPad/.test(navigator.platform)) kbd.textContent = '⌘ K';

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && app.classList.contains('is-sidebar-open')) setDrawer(false);
    });

    // Moving between layouts: clean up drawer/rail state
    let wasMobile = isMobileLayout();
    window.addEventListener('resize', T.utils.debounce(() => {
      const mobile = isMobileLayout();
      if (mobile !== wasMobile) {
        wasMobile = mobile;
        setDrawer(false);
        syncTooltips();
        syncToggleState();
      }
    }, 120));
  }

  /* ---- Data --------------------------------------------------------------- */
  async function loadNotifications() {
    const listEl = $('[data-notification-list]', app);
    try {
      const items = await T.api.notifications.list();
      renderNotifications(items);
    } catch (err) {
      listEl.innerHTML = T.ui.emptyState({ icon: 'circle-alert', title: 'Could not load notifications', text: err.message, compact: true, tone: 'pink' });
      T.ui.icons(listEl);
    }
  }

  function renderNotifications(items) {
    const listEl = $('[data-notification-list]', app);
    const countEl = $('[data-notification-count]', app);
    const unread = C.Notifications.unreadCount(items);
    listEl.innerHTML = C.Notifications.list(items);
    countEl.textContent = unread > 9 ? '9+' : (unread || '');
    countEl.dataset.count = String(unread);
    $('.tai-bell', app).setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    $('[data-action="mark-all-read"]', app).disabled = unread === 0;
    T.ui.icons(listEl);
  }

  async function markAllRead(button) {
    T.ui.setButtonLoading(button, true);
    let items = null;
    try {
      await T.api.notifications.markAllRead();
      items = await T.api.notifications.list();
    } catch (err) {
      T.ui.toast({ title: 'Could not update notifications', message: err.message, variant: 'danger' });
    } finally {
      T.ui.setButtonLoading(button, false);
    }
    if (items) renderNotifications(items);
  }

  async function signOut(button) {
    T.ui.setButtonLoading(button, true);
    try { await T.api.auth.logout(); } catch (e) { /* sign out locally regardless */ }
    window.location.href = T.utils.url('pages/auth/login.html');
  }

  async function resetDemoData() {
    const ok = await T.ui.confirm({
      title: 'Reset demo data?',
      message: 'Every course, lecture and profile change you made in this browser will be replaced with the original sample data.',
      confirmLabel: 'Reset demo data',
      danger: true
    });
    if (!ok) return;
    try {
      await T.api.dev.resetMockData();
      T.ui.toast({ title: 'Demo data reset', message: 'Reloading with the original sample data…', variant: 'success' });
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      T.ui.toast({ title: 'Could not reset demo data', message: err.message, variant: 'danger' });
    }
  }

  /**
   * Replace the breadcrumb trail. The last item is the current page;
   * earlier items with an href become links (hidden on small screens).
   */
  function setCrumbs(items = []) {
    const nav = app && $('.tai-crumbs', app);
    if (!nav || !items.length) return;
    const { escape } = T.utils;
    const sep = T.ui.icon('chevron-right');
    nav.innerHTML = items.map((it, i) => {
      if (i === items.length - 1) return `<span class="tai-crumbs__current" aria-current="page">${escape(it.label)}</span>`;
      const inner = it.href
        ? `<a class="tai-crumbs__parent tai-crumbs__link" href="${escape(it.href)}">${escape(it.label)}</a>`
        : `<span class="tai-crumbs__parent">${escape(it.label)}</span>`;
      return inner + sep;
    }).join('');
    T.ui.icons(nav);
    const current = items[items.length - 1].label;
    if (current) document.title = `${current} · TutorAI`;
  }

  /** Refresh the topbar name, email and avatar (e.g. after a profile edit). */
  function setUser(user) {
    if (app && user) C.Topbar.setUser(app, user);
  }

  async function loadUser() {
    const user = await T.api.users.me();
    C.Topbar.setUser(app, user);
    return user;
  }

  /* ---- Boot --------------------------------------------------------------- */
  async function init() {
    if (!document.body.dataset.shell || !T.navigation[document.body.dataset.shell]) return;
    // UX-only sign-in check (core/auth.js). The PHP API enforces sessions server-side.
    const signedIn = await T.auth.requireAuth();
    if (!signedIn && document.body.dataset.auth !== 'optional') return;
    build();
    initSidebarState();
    bindEvents();
    if (C.Palette) C.Palette.init(role);
    T.ui.enhance(app);
    requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('tai-no-transition')));

    const [user] = await Promise.all([loadUser().catch(() => null), loadNotifications()]);
    document.dispatchEvent(new CustomEvent('tutorai:ready', { detail: { role, user } }));
  }

  T.shell = { init, setCollapsed, setDrawer, setUser, setCrumbs };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.TutorAI);
