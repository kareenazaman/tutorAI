/**
 * TutorAI — Admin Dashboard (pages/admin/dashboard.html?q=&status=)
 * ------------------------------------------------------------------
 * PHP: GET /api/admin/summary, /api/admin/users, /api/admin/lectures,
 *      /api/admin/activity; PATCH /api/admin/users/{id}/status.
 * Every call answers 403 unless the session's user is an admin (the shell
 * has already shown students a 403 page via core/auth.js requireRole).
 * The admin sees account details and COUNTS only — no chats, notes or answers.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';

  const T = window.TutorAI;
  const V = T.validation;
  const { $, escape, formatDate, timeAgo, initials, debounce } = T.utils;
  const root = document.getElementById('page-content');
  const live = $('[data-live]', root);
  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
  const params = new URLSearchParams(window.location.search);
  const filters = $('[data-user-filters]', root);
  filters.elements.q.value = params.get('q') || '';
  filters.elements.status.value = ['active', 'deactivated'].includes(params.get('status')) ? params.get('status') : '';

  let users = [];

  const errorState = (title, err, retry) => `${T.ui.emptyState({ icon: 'circle-alert', tone: 'pink', compact: true, title, text: err.message })}
    <div class="text-center"><button type="button" class="btn btn-secondary btn-sm" data-retry="${retry}">Try again</button></div>`;

  /* ---- Stat tiles ----------------------------------------------------------- */
  async function loadStats() {
    const box = $('[data-admin-stats]', root);
    try {
      const s = await T.api.admin.summary();
      const tile = (tone, icon, label, value, meta) => `
        <div class="tai-tile tai-tile--${tone} span-3">
          <span class="tai-tile__label">${T.ui.icon(icon)}${escape(label)}</span>
          <div class="tai-tile__value" data-count-to="${value}">0</div>
          <p class="tai-tile__meta">${escape(meta)}</p>
        </div>`;
      box.innerHTML = `<div class="tai-bento mb-4">
        ${tile('lavender', 'graduation-cap', 'Students', s.students, `${s.newStudents30d} new in 30 days · ${s.deactivated} deactivated`)}
        ${tile('sage', 'activity', 'Active users', s.activeUsers, `Signed in or studied in the last ${s.activeWindowDays} days`)}
        ${tile('powder', 'book-open', 'Courses', s.courses, `${s.archivedCourses} archived`)}
        ${tile('butter', 'file-text', 'Lectures', s.lectures, `${s.lecturesByStatus.ready} ready · ${s.lecturesByStatus.inProgress} processing · ${s.lecturesByStatus.failed} failed`)}
      </div>`;
      T.ui.enhance(box);
    } catch (err) {
      box.innerHTML = `<div class="tai-card mb-4">${errorState('Couldn’t load the totals', err, 'stats')}</div>`;
    }
    T.ui.icons(box);
  }

  /* ---- User management ------------------------------------------------------ */
  const STATUS = { active: ['sage', 'Active'], deactivated: ['pink', 'Deactivated'] };

  function userRow(u) {
    const name = `${u.firstName} ${u.lastName}`.trim();
    const [tone, label] = STATUS[u.status] || ['outline', u.status];
    const c = u.counts;
    const isActive = u.status === 'active';
    return `
      <tr data-user-row="${escape(u.id)}">
        <th scope="row" data-label="Student">
          <span class="ad-user">
            <span class="tai-avatar tai-avatar--sm tai-avatar--${escape(u.avatarColor || 'lavender')}" aria-hidden="true">${escape(initials(u.firstName, u.lastName))}</span>
            <span class="min-w-0"><span class="ad-user__name">${escape(name)}</span><span class="ad-user__email" title="${escape(u.email)}">${escape(u.email)}</span></span>
          </span>
        </th>
        <td data-label="Program"><span class="d-block">${escape(u.program || '—')}</span><span class="tai-small tai-muted">${escape(u.institution || '')}</span></td>
        <td data-label="Joined">${escape(formatDate(u.createdAt))}</td>
        <td data-label="Last active">${u.lastActiveAt ? `<time datetime="${escape(u.lastActiveAt)}">${escape(timeAgo(u.lastActiveAt))}</time>` : '<span class="tai-muted">Never</span>'}</td>
        <td data-label="Usage"><span class="ad-usage" title="Courses · lectures · quizzes taken · AI Tutor chats">
          <span>${c.courses} course${c.courses === 1 ? '' : 's'}</span><span>${c.lectures} lecture${c.lectures === 1 ? '' : 's'}</span>
          <span>${c.quizzesTaken} quiz${c.quizzesTaken === 1 ? '' : 'zes'}</span><span>${c.conversations} chat${c.conversations === 1 ? '' : 's'}</span></span></td>
        <td data-label="Status"><span class="tai-badge tai-badge--${tone}">${escape(label)}</span>${u.lastStatusChange ? `<span class="d-block tai-small tai-muted mt-1" title="${escape(u.lastStatusChange.reason)}">${escape(u.lastStatusChange.action === 'activate' ? 'Reactivated' : 'Deactivated')} ${escape(timeAgo(u.lastStatusChange.at).toLowerCase())}</span>` : ''}</td>
        <td data-label="Action" class="text-end">
          <button type="button" class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-soft'}" data-set-status="${isActive ? 'deactivated' : 'active'}" data-id="${escape(u.id)}" aria-label="${isActive ? 'Deactivate' : 'Activate'} ${escape(name)}">
            ${T.ui.icon(isActive ? 'user-x' : 'user-check')}<span>${isActive ? 'Deactivate' : 'Activate'}</span>
          </button>
        </td>
      </tr>`;
  }

  async function loadUsers({ focusId = null } = {}) {
    const box = $('[data-user-table]', root);
    const count = $('[data-user-count]', root);
    const q = filters.elements.q.value.trim();
    const status = filters.elements.status.value;
    box.setAttribute('aria-busy', 'true');
    try {
      users = await T.api.admin.users({ q, status });
    } catch (err) {
      box.innerHTML = errorState('Couldn’t load students', err, 'users');
      count.textContent = '';
      T.ui.icons(box);
      box.removeAttribute('aria-busy');
      return;
    }
    count.textContent = `${users.length} student${users.length === 1 ? '' : 's'}${q || status ? ' match' + (users.length === 1 ? 'es' : '') : ''}`;
    if (!users.length) {
      box.innerHTML = T.ui.emptyState({
        icon: 'search-x', compact: true, title: 'No students match',
        text: q ? `Nothing matches “${q}”${status ? ` with status ${status}` : ''}.` : 'No students have that status.',
        actions: [{ label: 'Clear filters', variant: 'secondary', icon: 'x' }]
      });
      const clear = $('.tai-empty .btn, .tai-empty-state .btn', box) || $('button', box);
      if (clear) clear.addEventListener('click', () => { filters.reset(); syncUrl(); loadUsers(); });
    } else {
      box.innerHTML = `<div class="tai-table-wrap ad-table-wrap"><table class="table tai-table ad-table">
        <caption class="visually-hidden">Student accounts</caption>
        <thead><tr><th scope="col">Student</th><th scope="col">Program</th><th scope="col">Joined</th><th scope="col">Last active</th><th scope="col">Usage</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Action</span></th></tr></thead>
        <tbody>${users.map(userRow).join('')}</tbody></table></div>`;
    }
    T.ui.icons(box);
    box.removeAttribute('aria-busy');
    if (focusId) { const b = $(`[data-set-status][data-id="${CSS.escape(focusId)}"]`, box); if (b) b.focus(); }
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (filters.elements.q.value.trim()) p.set('q', filters.elements.q.value.trim());
    if (filters.elements.status.value) p.set('status', filters.elements.status.value);
    history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
  }

  filters.addEventListener('submit', (e) => e.preventDefault());
  filters.elements.q.addEventListener('input', debounce(() => { syncUrl(); loadUsers(); }, 250));
  filters.elements.status.addEventListener('change', () => { syncUrl(); loadUsers(); });

  /* ---- Activate / deactivate (confirm with a required reason) --------------- */
  const modalEl = document.getElementById('status-modal');
  const form = document.getElementById('status-form');
  const submitBtn = $('[data-status-submit]', form);
  const counter = document.getElementById('status-reason-count');
  const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
  let opener = null;

  const statusForm = V.bind(form, {
    reason: [V.required('Give a reason for this change.'), V.minLength(5, 'Use at least 5 characters.'), V.maxLength(300, 'Use 300 characters or fewer.')]
  }, {
    onSubmit: async (values) => {
      const id = form.elements.user_id.value;
      const status = form.elements.status.value;
      T.ui.setButtonLoading(submitBtn, true);
      try {
        const row = await T.api.admin.setUserStatus(id, { status, reason: values.reason.trim() });
        const name = `${row.firstName} ${row.lastName}`.trim();
        modal.hide();
        T.ui.toast({ title: status === 'active' ? 'Account activated' : 'Account deactivated', message: status === 'active' ? `${name} can sign in again.` : `${name} can no longer sign in.`, variant: 'success' });
        announce(`${name} is now ${status}.`);
        opener = null;
        await Promise.all([loadUsers({ focusId: id }), loadStats()]);
      } catch (err) {
        if (!statusForm.showServerErrors(err)) V.formAlert(form, { title: 'Couldn’t change this account', message: err.message });
      } finally {
        T.ui.setButtonLoading(submitBtn, false);
      }
    }
  });

  form.elements.reason.addEventListener('input', () => { counter.textContent = `${form.elements.reason.value.length} / 300`; });
  modalEl.addEventListener('shown.bs.modal', () => form.elements.reason.focus());
  modalEl.addEventListener('hidden.bs.modal', () => {
    statusForm.reset();
    V.clearFormAlert(form);
    counter.textContent = '0 / 300';
    if (opener && document.body.contains(opener)) opener.focus();
  });

  function openStatusModal(btn) {
    const u = users.find(x => x.id === btn.dataset.id);
    if (!u || !modal) return;
    opener = btn;
    const name = `${u.firstName} ${u.lastName}`.trim();
    const deactivate = btn.dataset.setStatus === 'deactivated';
    form.elements.user_id.value = u.id;
    form.elements.status.value = btn.dataset.setStatus;
    $('#status-title', form).textContent = deactivate ? `Deactivate ${name}?` : `Activate ${name}?`;
    $('[data-status-subtitle]', form).textContent = deactivate
      ? `${u.email} won’t be able to sign in, and any open session ends. Their courses and results are kept.`
      : `${u.email} will be able to sign in again with their existing data.`;
    form.elements.reason.placeholder = deactivate ? 'e.g. Requested by the student; account shared with others' : 'e.g. Issue resolved with the student';
    submitBtn.className = `btn ${deactivate ? 'btn-danger' : 'btn-primary'}`;
    submitBtn.querySelector('span').textContent = deactivate ? 'Deactivate' : 'Activate';
    modal.show();
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set-status]');
    if (btn) return openStatusModal(btn);
    const retry = e.target.closest('[data-retry]');
    if (retry) ({ stats: loadStats, users: loadUsers, processing: loadProcessing, activity: loadActivity })[retry.dataset.retry]();
  });

  /* ---- Lecture processing ----------------------------------------------------- */
  const LECTURE_STATUS = { uploading: ['powder', 'Uploading'], extracting: ['powder', 'Extracting text'], processing: ['butter', 'Processing'], failed: ['pink', 'Failed'], ready: ['sage', 'Ready'] };

  async function loadProcessing() {
    const box = $('[data-processing]', root);
    try {
      const { counts, items } = await T.api.admin.lectures();
      const inProgress = counts.uploading + counts.extracting + counts.processing;
      const chip = (tone, label, n) => `<li class="ad-chip ad-chip--${tone}"><span class="ad-chip__n">${n}</span>${escape(label)}</li>`;
      box.innerHTML = `
        <ul class="ad-chips" aria-label="Lectures by status">
          ${chip('sage', 'Ready', counts.ready)}${chip('butter', 'In progress', inProgress)}${chip('pink', 'Failed', counts.failed)}
        </ul>
        ${items.length ? `<ul class="tai-row-list ad-list">${items.map(l => {
          const [tone, label] = LECTURE_STATUS[l.status] || ['outline', l.status];
          return `<li class="ad-list__item">
            <span class="tai-icon-tile tai-icon-tile--${tone}" aria-hidden="true">${T.ui.icon(l.status === 'failed' ? 'file-x' : 'loader')}</span>
            <span class="min-w-0 flex-grow-1">
              <span class="ad-list__title">${escape(l.title)}</span>
              <span class="ad-list__meta">${escape(l.student ? l.student.name : 'Unknown student')} · ${escape(l.course ? l.course.code : '')} · ${escape(T.utils.formatFileSize(l.fileSizeKb))} · ${escape(timeAgo(l.uploadedAt))}</span>
            </span>
            <span class="tai-badge tai-badge--${tone}">${escape(label)}</span>
          </li>`;
        }).join('')}</ul>` : T.ui.emptyState({ icon: 'circle-check', tone: 'sage', compact: true, title: 'Everything is processed', text: 'No uploads are waiting and none have failed.' })}`;
    } catch (err) {
      box.innerHTML = errorState('Couldn’t load lecture processing', err, 'processing');
    }
    T.ui.icons(box);
  }

  /* ---- Recent activity -------------------------------------------------------- */
  const ACTIVITY_ICON = { lecture_uploaded: 'upload', lecture_failed: 'file-x', lecture_deleted: 'trash-2', lecture_viewed: 'book-open-text', chat_message: 'messages-square', notes_generated: 'notebook-pen', quiz_created: 'wand-sparkles', quiz_submitted: 'list-checks', course_created: 'folder-plus', course_updated: 'pencil', course_deleted: 'folder-minus' };

  async function loadActivity() {
    const box = $('[data-activity]', root);
    try {
      const items = await T.api.admin.activity({ limit: 10 });
      box.innerHTML = items.length ? `<ul class="tai-row-list ad-list">${items.map(a => `
        <li class="ad-list__item">
          <span class="tai-icon-tile tai-icon-tile--lavender" aria-hidden="true">${T.ui.icon(ACTIVITY_ICON[a.type] || 'activity')}</span>
          <span class="min-w-0 flex-grow-1">
            <span class="ad-list__title">${escape(a.student.name)} <span class="fw-normal">· ${escape(a.label.charAt(0).toLowerCase() + a.label.slice(1))}</span></span>
            <span class="ad-list__meta">${a.course ? `${escape(a.course.code)} · ` : ''}<time datetime="${escape(a.createdAt)}">${escape(timeAgo(a.createdAt))}</time></span>
          </span>
        </li>`).join('')}</ul>` : T.ui.emptyState({ icon: 'activity', compact: true, title: 'No activity yet', text: 'Student activity will appear here.' });
    } catch (err) {
      box.innerHTML = errorState('Couldn’t load activity', err, 'activity');
    }
    T.ui.icons(box);
  }

  /* ---- Boot --------------------------------------------------------------------- */
  await Promise.all([loadStats(), loadUsers(), loadProcessing(), loadActivity()]);
  root.removeAttribute('aria-busy');
});
