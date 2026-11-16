/**
 * TutorAI — style guide page script
 * Demonstrates the JS-driven components (toasts, confirm, empty and
 * loading states). Also a good reference for how page scripts should
 * use TutorAI.ui rather than writing markup by hand.
 */
(function (T) {
  'use strict';

  const TOASTS = {
    success: { title: 'Course added', message: 'Database Systems is now in your workspace.' },
    info:    { title: 'Heads up', message: 'Your weekly summary is ready to view.' },
    warning: { title: 'Quiz closes soon', message: '“HTTP & REST fundamentals” is due tomorrow.' },
    danger:  { title: 'Upload failed', message: 'Files must be under 20 MB.' },
    ai:      { title: 'Quiz generated', message: '8 practice questions from Lecture 8 are ready.' }
  };

  function init() {
    const $ = (s) => document.querySelector(s);

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toast]');
      if (!btn) return;
      const variant = btn.dataset.toast;
      T.ui.toast({ ...TOASTS[variant], variant });
    });

    $('#sg-confirm').addEventListener('click', async () => {
      const ok = await T.ui.confirm({
        title: 'Remove this course?',
        message: 'Its documents and quiz history will be removed from your workspace.',
        confirmLabel: 'Remove course',
        danger: true
      });
      T.ui.toast(ok
        ? { title: 'Course removed', variant: 'success' }
        : { title: 'Kept your course', variant: 'info' });
    });

    const loadBtn = $('#sg-loading-btn');
    loadBtn.addEventListener('click', () => {
      T.ui.setButtonLoading(loadBtn, true);
      setTimeout(() => T.ui.setButtonLoading(loadBtn, false), 1600);
    });

    $('#sg-empty-full').innerHTML = T.ui.emptyState({
      icon: 'book-open',
      title: 'No courses yet',
      text: 'Add your first course and upload lecture notes. TutorAI will use them to explain concepts and build practice quizzes.',
      actions: [
        { label: 'Add course', icon: 'plus', variant: 'primary' },
        { label: 'Learn how it works', variant: 'secondary' }
      ]
    });
    $('#sg-empty-compact').innerHTML = T.ui.emptyState({
      icon: 'list-checks',
      tone: 'sage',
      title: 'No quizzes taken',
      text: 'Your quiz history will appear here.',
      compact: true
    });

    $('#sg-skel-card').innerHTML = T.ui.skeleton('card');
    $('#sg-skel-list').innerHTML = T.ui.skeleton('list', 3);

    const overlayBtn = $('#sg-overlay-btn');
    overlayBtn.addEventListener('click', () => {
      const card = overlayBtn.closest('.tai-card');
      const overlay = T.utils.toElement(`<div class="tai-loading-overlay">${T.ui.spinner({ label: 'Refreshing…' })}</div>`);
      card.appendChild(overlay);
      setTimeout(() => overlay.remove(), 1500);
    });

    const SW = [
      ['White', '#FFFFFF'], ['Ink black', '#18181B'], ['Gray 50', '#F7F7F5'], ['Border', '#ECECE8'], ['Muted text', '#6B6B76'], ['Faint text', '#A1A1AA'],
      ['Lavender', '#E9E3FA', '#3B2A75'], ['Powder blue', '#DCEBFB', '#1F4A7A'], ['Mint', '#D8F0E3', '#1E5B3E'],
      ['Pink', '#FBE1E4', '#8A2E3E'], ['Butter', '#FFF1B8', '#6B4F00'], ['Peach', '#FFE4D1', '#8A3F12']
    ];
    $('#sg-swatches').innerHTML = SW.map(([name, hex, ink]) => `
      <div class="col-6 col-md-4 col-xl-2">
        <div class="tai-swatch">
          <div class="tai-swatch__color" style="background:${hex};${ink ? `color:${ink};` : ''}display:flex;align-items:flex-end;padding:10px;font-family:var(--tai-font-display);font-size:1.5rem">${ink ? 'Aa' : ''}</div>
          <div class="tai-swatch__meta"><div class="tai-swatch__name">${name}</div><div class="tai-swatch__hex">${hex}${ink ? ' / ' + ink : ''}</div></div>
        </div>
      </div>`).join('');

    T.ui.enhance(document.getElementById('page-content'));
  }

  document.addEventListener('tutorai:ready', init, { once: true });
})(window.TutorAI);
