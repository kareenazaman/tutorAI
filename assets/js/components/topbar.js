/**
 * TutorAI — Topbar component
 * Menu toggle, page title, search, notifications and profile menu.
 * User + notification data are filled in by the shell once loaded.
 */
(function (T) {
  'use strict';

  const { escape, url, initials, fullName } = T.utils;
  T.components = T.components || {};

  function profileMenu() {
    return `
      <li><a class="dropdown-item" href="${escape(url('pages/student/profile.html'))}">${T.ui.icon('user')}My Profile</a></li>
      <li><a class="dropdown-item" href="${escape(url('pages/student/settings.html'))}">${T.ui.icon('settings')}Settings</a></li>
      <li><a class="dropdown-item" href="${escape(url('pages/student/progress.html'))}">${T.ui.icon('chart-line')}My Progress</a></li>
      ${T.config.useMockData ? `<li><hr class="dropdown-divider"></li>
      <li><button type="button" class="dropdown-item" data-action="reset-demo-data">${T.ui.icon('rotate-ccw')}Reset demo data</button></li>` : ''}`;
  }

  T.components.Topbar = {
    render({ role, title, crumb, showSearch = true }) {
      const nav = T.navigation[role];
      return `
        <header class="tai-topbar" role="banner">
          <button type="button" class="btn btn-ghost btn-icon" data-action="toggle-sidebar"
                  aria-controls="tai-sidebar" aria-expanded="true" aria-label="Toggle navigation">
            ${T.ui.icon('panel-left')}
          </button>

          <nav class="tai-crumbs" aria-label="Breadcrumb">
            ${crumb ? `<span class="tai-crumbs__parent">${escape(crumb)}</span>${T.ui.icon('chevron-right')}` : ''}
            <span class="tai-crumbs__current" aria-current="page">${escape(title)}</span>
          </nav>

          ${showSearch ? `
          <button type="button" class="tai-topbar__search" data-action="open-palette" aria-label="Search (Ctrl K)">
            ${T.ui.icon('search', 'icon-sm')}
            <span class="tai-topbar__search-text tai-truncate">${escape(nav.searchPlaceholder)}</span>
            <kbd class="tai-kbd d-none d-lg-inline" data-search-kbd>Ctrl K</kbd>
          </button>` : ''}

          <div class="tai-topbar__actions">
            ${showSearch ? `
            <button type="button" class="btn btn-ghost btn-icon tai-topbar__search-toggle d-none" data-action="open-palette" aria-label="Search">
              ${T.ui.icon('search')}
            </button>` : ''}

            <div class="dropdown">
              <button type="button" class="btn btn-ghost btn-icon tai-bell" data-bs-toggle="dropdown"
                      data-bs-auto-close="outside" aria-expanded="false" aria-label="Notifications">
                ${T.ui.icon('bell')}
                <span class="tai-bell__count" data-notification-count data-count="0"></span>
              </button>
              <div class="dropdown-menu dropdown-menu-end tai-dropdown-panel">
                <div class="tai-dropdown-panel__header">
                  <p class="tai-dropdown-panel__title">Notifications</p>
                  <button type="button" class="btn btn-link btn-sm" data-action="mark-all-read">Mark all as read</button>
                </div>
                <div class="tai-dropdown-panel__body" data-notification-list>
                  ${T.ui.skeleton('list', 3)}
                </div>
                <div class="tai-dropdown-panel__footer">
                  <a class="btn btn-ghost btn-sm w-100" href="${escape(url('pages/student/settings.html#notifications'))}">${T.ui.icon('settings', 'icon-sm')}Notification settings</a>
                </div>
              </div>
            </div>

            <div class="dropdown">
              <button type="button" class="tai-profile-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account menu">
                <span class="tai-avatar" data-user-avatar></span>
                <span class="tai-profile-btn__text">
                  <span class="tai-profile-btn__name" data-user-name>&nbsp;</span>
                  <span class="tai-profile-btn__role">Student</span>
                </span>
                ${T.ui.icon('chevron-down')}
              </button>
              <ul class="dropdown-menu dropdown-menu-end" style="min-width:15rem">
                <li class="tai-profile-menu__head">
                  <span class="tai-avatar tai-avatar--lg" data-user-avatar></span>
                  <span class="d-block min-w-0">
                    <span class="d-block tai-profile-menu__name tai-truncate" data-user-name>&nbsp;</span>
                    <span class="d-block tai-profile-menu__email tai-truncate" data-user-email>&nbsp;</span>
                  </span>
                </li>
                <li><hr class="dropdown-divider"></li>
                ${profileMenu()}
                <li><hr class="dropdown-divider"></li>
                <li><button type="button" class="dropdown-item text-danger" data-action="sign-out">${T.ui.icon('log-out')}Sign out</button></li>
              </ul>
            </div>
          </div>
        </header>`;
    },

    /** Fill user details into every [data-user-*] slot. */
    setUser(scope, user) {
      const name = fullName(user);
      scope.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = name; });
      scope.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = user.email || ''; });
      scope.querySelectorAll('[data-user-avatar]').forEach(el => {
        Array.from(el.classList).filter(c => c.startsWith('tai-avatar--') && c !== 'tai-avatar--lg' && c !== 'tai-avatar--sm' && c !== 'tai-avatar--xl')
          .forEach(c => el.classList.remove(c));
        el.classList.add(`tai-avatar--${user.avatarColor || 'lavender'}`);
        el.innerHTML = user.avatarUrl
          ? `<img src="${escape(user.avatarUrl)}" alt="">`
          : escape(initials(user.firstName, user.lastName));
      });
    }
  };
})(window.TutorAI);
