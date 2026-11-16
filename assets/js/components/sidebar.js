/**
 * TutorAI — Sidebar component
 * Renders the student sidebar from TutorAI.navigation.
 */
(function (T) {
  'use strict';

  const { escape, url } = T.utils;
  T.components = T.components || {};

  function navItem(item, activeId) {
    const active = item.id === activeId;
    return `
      <li>
        <a class="tai-nav-link${active ? ' is-active' : ''}"
           href="${escape(url(item.href))}"
           data-nav-id="${escape(item.id)}"
           data-bs-title="${escape(item.label)}"
           ${active ? 'aria-current="page"' : ''}>
          ${T.ui.icon(item.icon)}
          <span class="tai-nav-link__label">${escape(item.label)}</span>
          ${item.badge ? `<span class="tai-nav-link__badge">${escape(item.badge)}</span>` : ''}
        </a>
      </li>`;
  }

  function footer() {
    return `
      <div class="tai-sidebar-card">
        <div class="tai-sidebar-card__title">${T.ui.icon('sparkles', 'icon-sm')}Stuck on a concept?</div>
        Ask the AI Tutor to explain it using your own course notes.
        <a href="${escape(url('pages/student/ai-tutor.html'))}" class="btn btn-primary btn-sm w-100">Ask AI Tutor</a>
      </div>`;
  }

  T.components.Sidebar = {
    render({ role, activeId }) {
      const nav = T.navigation[role];
      const sections = nav.sections.map(section => `
        <div class="tai-nav-section">
          <p class="tai-nav-section__title">${escape(section.label)}</p>
          <ul class="tai-nav-list">${section.items.map(i => navItem(i, activeId)).join('')}</ul>
        </div>`).join('');

      return `
        <aside class="tai-sidebar tai-sidebar--${role}" id="tai-sidebar" aria-label="${escape(nav.label)} navigation">
          <div class="tai-sidebar__brand">
            <a class="tai-brand" href="${escape(url(nav.home))}" aria-label="TutorAI home">
              <img class="tai-brand__mark" src="${escape(url('assets/img/logo-mark.svg'))}" alt="" width="34" height="34">
              <span class="tai-brand__text">
                <span class="tai-brand__name">TutorAI</span>
                <span class="tai-brand__tag">${escape(T.config.tagline)}</span>
              </span>
            </a>
            <button type="button" class="btn btn-ghost btn-icon btn-sm tai-sidebar__close" data-action="close-sidebar" aria-label="Close menu">
              ${T.ui.icon('x')}
            </button>
          </div>
          <nav class="tai-sidebar__nav">${sections}</nav>
          <div class="tai-sidebar__footer">${footer()}</div>
        </aside>`;
    }
  };
})(window.TutorAI);
