/**
 * TutorAI — Settings (pages/student/settings.html)
 * ------------------------------------------------------------------
 * PHP: GET/PATCH /api/settings, GET /api/account/export,
 *      DELETE /api/conversations, DELETE /api/account.
 * Notifications, goal and motion save as soon as they change (PATCH with
 * just that field); a failed save puts the control back and says why.
 * Form field names (notify_lecture_ready, weekly_goal_days, reduced_motion,
 * confirm) are what the PHP endpoints read.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';

  const T = window.TutorAI;
  const V = T.validation;
  const { $, $$ } = T.utils;
  const root = document.getElementById('page-content');
  const live = $('[data-live]', root);
  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };

  const NOTIFY_FIELDS = {
    notify_lecture_ready: 'lectureReady',
    notify_quiz_ready: 'quizReady',
    notify_weekly_summary: 'weeklySummary',
    notify_study_reminders: 'studyReminders'
  };

  let settings;
  let goal = null;

  /* ---- Load -------------------------------------------------------------- */
  try {
    const [s, dash, convs] = await Promise.all([
      T.api.settings.get(),
      T.api.dashboard.summary().catch(() => null),
      T.api.conversations.list().catch(() => null)
    ]);
    settings = s;
    goal = dash && dash.weeklyGoal;
    renderChatCount(convs);
  } catch (err) {
    root.removeAttribute('aria-busy');
    $('.row', root).innerHTML = `<div class="col-12"><div class="tai-card">${T.ui.emptyState({
      icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your settings', text: err.message,
      actions: [{ label: 'Try again', variant: 'secondary', icon: 'rotate-ccw', href: window.location.href }]
    })}</div></div>`;
    T.ui.icons(root);
    return;
  }
  fill();
  root.removeAttribute('aria-busy');

  function fill() {
    const n = $('[data-settings-form="notifications"]', root);
    Object.entries(NOTIFY_FIELDS).forEach(([name, key]) => { n.elements[name].checked = !!settings.notifications[key]; });
    $$('input[name="weekly_goal_days"]', root).forEach(i => { i.checked = Number(i.value) === settings.weeklyGoalDays; });
    $$('input[name="reduced_motion"]', root).forEach(i => { i.checked = i.value === settings.reducedMotion; });
    $$('[data-settings-form] input', root).forEach(i => { i.disabled = false; });
    renderGoal();
    const deviceReduces = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('[data-device-motion]', root).textContent = `Uses your device’s setting — currently ${deviceReduces ? 'reduced motion' : 'full motion'}.`;
  }

  function renderGoal() {
    const el = $('[data-goal-status]', root);
    const target = settings.weeklyGoalDays;
    if (!goal) { el.textContent = `Goal: ${target} study day${target === 1 ? '' : 's'} a week.`; return; }
    const done = Math.min(goal.studiedDays, 7);
    el.innerHTML = `${T.ui.icon(done >= target ? 'circle-check' : 'target', 'icon-sm')}
      <span>This week: <strong>${done} of ${target}</strong> study day${target === 1 ? '' : 's'}${done >= target ? ' — goal reached.' : '.'}</span>`;
    T.ui.icons(el);
  }

  function renderChatCount(convs) {
    if (!convs) return;
    const el = $('[data-chat-count]', root);
    el.textContent = convs.length
      ? `You have ${convs.length} conversation${convs.length === 1 ? '' : 's'} across your courses. Each is deleted with its messages.`
      : 'You don’t have any AI Tutor conversations.';
    $('[data-action="delete-chats"]', root).disabled = !convs.length;
  }

  /* ---- Auto-save --------------------------------------------------------- */
  const savedTimers = {};
  function flashSaved(key) {
    const badge = $(`[data-saved="${key}"]`, root);
    badge.hidden = false;
    clearTimeout(savedTimers[key]);
    savedTimers[key] = setTimeout(() => { badge.hidden = true; }, 2200);
  }

  async function save(key, changes, revert) {
    const form = $(`[data-settings-form="${key}"]`, root);
    form.setAttribute('aria-busy', 'true');
    try {
      settings = await T.api.settings.update(changes);
      flashSaved(key);
      announce('Settings saved.');
      return true;
    } catch (err) {
      revert();
      T.ui.toast({ title: 'Couldn’t save that setting', message: err.message, variant: 'danger' });
      announce(`Couldn’t save: ${err.message}`);
      return false;
    } finally {
      form.removeAttribute('aria-busy');
    }
  }

  $('[data-settings-form="notifications"]', root).addEventListener('change', (e) => {
    const key = NOTIFY_FIELDS[e.target.name];
    if (!key) return;
    const input = e.target;
    save('notifications', { notifications: { [key]: input.checked } }, () => { input.checked = !input.checked; });
  });

  $('[data-settings-form="goal"]', root).addEventListener('change', async (e) => {
    if (e.target.name !== 'weekly_goal_days') return;
    const before = settings.weeklyGoalDays;
    const ok = await save('goal', { weeklyGoalDays: Number(e.target.value) }, () => {
      $$('input[name="weekly_goal_days"]', root).forEach(i => { i.checked = Number(i.value) === before; });
    });
    if (ok) renderGoal();
  });

  $('[data-settings-form="appearance"]', root).addEventListener('change', async (e) => {
    if (e.target.name !== 'reduced_motion') return;
    const before = settings.reducedMotion;
    const ok = await save('appearance', { reducedMotion: e.target.value }, () => {
      $$('input[name="reduced_motion"]', root).forEach(i => { i.checked = i.value === before; });
    });
    if (ok) T.utils.applyMotion(settings.reducedMotion);   // takes effect now, and on every page load on this device
  });

  // Forms only auto-save; Enter in a field must not reload the page
  $$('[data-settings-form]', root).forEach(f => f.addEventListener('submit', (e) => e.preventDefault()));

  /* ---- Privacy ----------------------------------------------------------- */
  $('[data-action="export"]', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    T.ui.setButtonLoading(btn, true);
    try {
      const data = await T.api.account.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href, download: `tutorai-data-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      T.ui.toast({ title: 'Your data is downloading', message: `${data.courses.length} courses, ${data.attempts.length} quiz attempts and ${data.conversations.length} chats.`, variant: 'success' });
    } catch (err) {
      T.ui.toast({ title: 'Couldn’t prepare your data', message: err.message, variant: 'danger' });
    } finally {
      T.ui.setButtonLoading(btn, false);
    }
  });

  $('[data-action="delete-chats"]', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = await T.ui.confirm({
      title: 'Delete all AI Tutor chats?',
      message: 'Every conversation in every course will be deleted, with its messages. Your courses, lectures, notes and quiz results stay. This can’t be undone.',
      confirmLabel: 'Delete all chats',
      danger: true
    });
    if (!ok) return;
    T.ui.setButtonLoading(btn, true);
    let done = false;
    try {
      const { deleted } = await T.api.account.deleteAllChats();
      done = true;
      T.ui.toast({ title: 'Chats deleted', message: `${deleted} conversation${deleted === 1 ? '' : 's'} removed.`, variant: 'success' });
      announce('All AI Tutor chats deleted.');
    } catch (err) {
      T.ui.toast({ title: 'Couldn’t delete your chats', message: err.message, variant: 'danger' });
    } finally {
      T.ui.setButtonLoading(btn, false);
    }
    if (done) renderChatCount([]);   // after the loading state, which re-enables the button
  });

  /* ---- Danger zone ------------------------------------------------------- */
  const modalEl = document.getElementById('delete-account-modal');
  const delForm = document.getElementById('delete-account-form');
  const delBtn = $('button[type="submit"]', delForm);
  modalEl.addEventListener('shown.bs.modal', () => delForm.elements.confirm.focus());
  modalEl.addEventListener('hidden.bs.modal', () => { accountForm.reset(); V.clearFormAlert(delForm); });

  const accountForm = V.bind(delForm, {
    confirm: [V.required('Type DELETE to confirm.'), (v) => (v.trim() === 'DELETE' ? null : 'Type DELETE in capital letters.')]
  }, {
    onSubmit: async (values) => {
      T.ui.setButtonLoading(delBtn, true);
      try {
        await T.api.account.remove({ confirm: values.confirm.trim() });
        T.utils.storage.remove(T.config.storageKeys.rememberedEmail);
        window.location.replace(T.utils.url('pages/auth/login.html?deleted=1'));
      } catch (err) {
        if (!accountForm.showServerErrors(err)) V.formAlert(delForm, { title: 'Couldn’t delete your account', message: err.message });
        T.ui.setButtonLoading(delBtn, false);
      }
    }
  });

  // Deep link: settings.html#notifications (from the bell) scrolls and focuses that card
  if (window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      target.focus({ preventScroll: true });
    }
  }
});
