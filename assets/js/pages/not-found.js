/**
 * TutorAI — 404 page (pages/404.html)
 * Draws the icons and offers "Go back" when there is somewhere to go back to.
 * No other TutorAI scripts load here, so the page works even if they fail.
 */
(function () {
  'use strict';
  if (window.lucide) window.lucide.createIcons();
  const back = document.querySelector('[data-action="back"]');
  if (back && window.history.length > 1 && document.referrer) {
    back.hidden = false;
    back.addEventListener('click', () => window.history.back());
  }
})();
