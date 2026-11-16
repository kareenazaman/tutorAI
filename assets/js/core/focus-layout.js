/**
 * TutorAI — Focus layout (distraction-free pages, e.g. taking a quiz)
 * ------------------------------------------------------------------
 * No sidebar or topbar: the page renders its own slim header.
 *
 *   <body data-layout="focus" data-page="quiz-attempt" data-root="../../">
 *     <main id="page-content"> … </main>
 *
 * Runs TutorAI.ui.enhance() and fires 'tutorai:ready' like the shell does,
 * so page scripts are written the same way.
 */
(function (T) {
  'use strict';

  async function init() {
    if (document.body.dataset.layout !== 'focus') return;
    // UX-only sign-in check (core/auth.js); signed-out visitors are sent to sign in
    const user = await T.auth.requireAuth();
    if (!user) return;
    document.body.classList.add('tai-focus');
    const main = document.getElementById('page-content');
    if (main) main.setAttribute('tabindex', '-1');
    T.ui.enhance(document);
    document.dispatchEvent(new CustomEvent('tutorai:ready', { detail: { layout: 'focus', role: 'student', user } }));
  }

  T.focusLayout = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.TutorAI);
