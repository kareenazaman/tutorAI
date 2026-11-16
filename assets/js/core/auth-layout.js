/**
 * TutorAI — Auth layout
 * ------------------------------------------------------------------
 * The split-screen layout shared by every sign-in page (login, register,
 * forgot / reset password). It is the auth counterpart of shell.js:
 * a page only declares itself and provides the form.
 *
 *   <body data-layout="auth" data-page="login" data-root="../../">
 *     <main id="page-content"> …heading + form only… </main>
 *
 * The layout adds the logo, the demo-mode note, the footer and the
 * pastel bento panel (desktop only), then fires 'tutorai:ready'.
 */
(function (T) {
  'use strict';

  const { url, escape } = T.utils;

  function panel() {
    return `
      <aside class="tai-auth__aside" aria-label="About TutorAI">
        <div class="tai-auth__panel">
          <div class="tai-tile tai-tile--lavender tai-auth__hero">
            <span class="tai-chip">${T.ui.icon('sparkles')}AI study companion</span>
            <h2 class="tai-auth__tagline tai-display">Learn. Practise. <em>Improve.</em></h2>
            <p class="tai-auth__lead">Turn your own lecture notes into explanations, practice quizzes and a clear picture of your progress.</p>
            <span class="tai-tile__deco">${T.ui.icon('graduation-cap')}</span>
          </div>

          <div class="tai-tile tai-tile--powder">
            <span class="tai-icon-tile tai-icon-tile--glass">${T.ui.icon('messages-square')}</span>
            <h3 class="tai-tile__title">AI Tutor</h3>
            <p class="tai-tile__meta">Answers grounded in your course documents.</p>
            <span class="tai-tile__deco">${T.ui.icon('sparkles')}</span>
          </div>

          <div class="tai-tile tai-tile--butter">
            <span class="tai-icon-tile tai-icon-tile--glass">${T.ui.icon('list-checks')}</span>
            <h3 class="tai-tile__title">Practice quizzes</h3>
            <p class="tai-tile__meta">Generated from each lecture in seconds.</p>
            <span class="tai-tile__deco">${T.ui.icon('list-checks')}</span>
          </div>

          <div class="tai-tile tai-tile--sage tai-auth__progress">
            <div class="d-flex align-items-center justify-content-between gap-3">
              <span class="tai-tile__label">${T.ui.icon('chart-line')}Weekly progress</span>
              <span class="tai-auth__progress-value" data-count-to="68" data-count-suffix="%">0%</span>
            </div>
            <div class="tai-meter" role="presentation"><span data-meter="68"></span></div>
          </div>
        </div>
      </aside>`;
  }

  function build() {
    const body = document.body;
    const content = document.getElementById('page-content') || document.createElement('main');
    content.id = 'page-content';
    content.classList.add('tai-auth__content', 'tai-enter');
    content.setAttribute('tabindex', '-1');

    const layout = document.createElement('div');
    layout.className = 'tai-auth';
    layout.innerHTML = `
      <a class="visually-hidden-focusable btn btn-primary position-fixed m-2" style="z-index:2000" href="#page-content">Skip to content</a>
      <div class="tai-auth__main">
        <header class="tai-auth__top">
          <a class="tai-auth__logo" href="${escape(url('index.html'))}" aria-label="TutorAI home">
            <img src="${escape(url('assets/img/logo-full.svg'))}" alt="TutorAI" width="134" height="32">
          </a>
          <span class="tai-badge tai-badge--butter tai-auth__demo" title="Sign-in is simulated with mock data until the PHP backend is connected.">
            ${T.ui.icon('flask-conical')}Demo mode — authentication not connected
          </span>
        </header>
        <div class="tai-auth__body"></div>
        <footer class="tai-auth__foot">
          <span>© ${new Date().getFullYear()} TutorAI</span>
          <span>${escape(T.config.tagline)}</span>
        </footer>
      </div>
      ${panel()}`;

    layout.querySelector('.tai-auth__body').appendChild(content);
    body.prepend(layout);
    body.classList.add('page-auth');
  }

  function init() {
    if (document.body.dataset.layout !== 'auth') return;
    build();
    T.ui.enhance(document);
    document.dispatchEvent(new CustomEvent('tutorai:ready', { detail: { layout: 'auth', page: document.body.dataset.page } }));
  }

  T.authLayout = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.TutorAI);
