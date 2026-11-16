/**
 * TutorAI — My Profile (pages/student/profile.html)
 * ------------------------------------------------------------------
 * View mode by default; "Edit profile" unlocks the fields.
 *   Save    → TutorAI.api.users.updateProfile   (PATCH /api/users/me)
 *   Password→ TutorAI.api.users.changePassword  (POST /api/users/me/password)
 * Saving refreshes the header card, the account panel and the topbar.
 * In mock mode api.js keeps profile edits in sessionStorage so they
 * survive a reload; passwords are never stored.
 */
document.addEventListener('tutorai:ready', (event) => {
  'use strict';
  const detail = event.detail;
  const T = window.TutorAI;
  const V = T.validation;
  const { $, $$, fullName, initials, formatDate, timeAgo } = T.utils;

  const page = document.getElementById('page-content');
  const formEl = document.getElementById('profile-form');
  const pwFormEl = document.getElementById('password-form');
  const editBtn = $('[data-action="edit-profile"]', page);
  const saveBtn = $('[type="submit"]', formEl);
  const pwBtn = $('[type="submit"]', pwFormEl);
  const bio = formEl.elements.bio;
  const bioCount = document.getElementById('profile-bio-count');
  const BIO_MAX = parseInt(bio.getAttribute('maxlength'), 10) || 280;

  const YEAR_LABELS = { 1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year', 5: '5th year+', 6: 'Graduate' };
  let user = detail.user;

  if (!user) {
    page.innerHTML = `<div class="tai-card">${T.ui.emptyState({
      icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load your profile',
      text: 'Check your connection and try again.',
      actions: [{ label: 'Reload', icon: 'refresh-cw', attrs: 'data-action="reload"' }]
    })}</div>`;
    T.ui.icons(page);
    $('[data-action="reload"]', page).addEventListener('click', () => window.location.reload());
    return;
  }

  /* ---- Render ------------------------------------------------------------ */
  function renderHeader() {
    $('[data-profile="name"]', page).textContent = fullName(user);
    $('[data-profile="program"]', page).textContent = user.program || 'Add your program';

    const avatar = $('[data-profile-avatar]', page);
    avatar.className = `tai-avatar tai-avatar--xl profile-hero__avatar tai-avatar--${user.avatarColor || 'lavender'}`;
    avatar.textContent = initials(user.firstName, user.lastName);

    const chip = (key, text) => {
      const el = $(`[data-profile-chip="${key}"]`, page);
      el.hidden = !text;
      $('span', el).textContent = text || '';
    };
    chip('institution', user.institution);
    chip('year', YEAR_LABELS[user.yearOfStudy] || '');
    chip('since', user.createdAt ? `Member since ${formatDate(user.createdAt, { month: 'long', year: 'numeric' })}` : '');
  }

  function renderFacts() {
    const fact = (key) => $(`[data-fact="${key}"]`, page);
    fact('id').textContent = user.id;
    fact('role').innerHTML = `<span class="tai-badge tai-badge--lavender">Student</span>`;
    fact('created').textContent = formatDate(user.createdAt);
    if (user.lastLoginAt) {
      const at = new Date(user.lastLoginAt);
      fact('login').innerHTML = `${T.utils.escape(timeAgo(user.lastLoginAt))}<span class="d-block tai-small tai-muted">${T.utils.escape(
        at.toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span>`;
    } else {
      fact('login').textContent = 'Never';
    }
  }

  function fillForm() {
    const f = formEl.elements;
    f.full_name.value = fullName(user);
    f.email.value = user.email || '';
    f.institution.value = user.institution || '';
    f.program.value = user.program || '';
    f.year_of_study.value = user.yearOfStudy ? String(user.yearOfStudy) : '';
    bio.value = user.bio || '';
    updateCount();
    const username = pwFormEl.elements.username;
    if (username) username.value = user.email || '';
  }

  function updateCount() {
    const n = bio.value.length;
    bioCount.textContent = `${n} / ${BIO_MAX}`;
    bioCount.classList.toggle('text-pink-ink', n >= BIO_MAX - 20);
  }

  /* ---- Mode -------------------------------------------------------------- */
  function setMode(mode) {
    const editing = mode === 'edit';
    formEl.dataset.mode = mode;
    $$('input, textarea', formEl).forEach(el => { el.readOnly = !editing; });
    formEl.elements.year_of_study.disabled = !editing;
    $$('[data-edit-only]', page).forEach(el => { el.hidden = !editing; });
    editBtn.hidden = editing;
    $('[data-mode-hint]', page).textContent = editing
      ? 'Update your details, then save your changes.'
      : 'Select Edit profile to change these details.';
    if (editing) formEl.elements.full_name.focus();
  }

  function cancelEdit() {
    profileForm.reset();       // clears errors and the status slot
    fillForm();                // reverts to the last saved values
    setMode('view');
    editBtn.focus();
  }

  /* ---- Profile form ------------------------------------------------------ */
  const profileForm = V.bind(formEl, {
    full_name: [V.required('Enter your full name.'), V.minLength(2, 'Your name needs at least 2 characters.'), V.maxLength(80)],
    email: [V.required('Enter your email address.'), V.email()],
    institution: [V.required('Enter your university or college.'), V.maxLength(120)],
    program: [V.required('Enter your program.'), V.maxLength(120)],
    year_of_study: [V.required('Select your year of study.')],
    bio: [V.maxLength(BIO_MAX, `Keep your bio to ${BIO_MAX} characters or fewer.`)]
  }, {
    fieldMap: { firstName: 'full_name', lastName: 'full_name', yearOfStudy: 'year_of_study' },
    onSubmit: async (values) => {
      const { firstName, lastName } = T.utils.splitName(values.full_name);
      T.ui.setButtonLoading(saveBtn, true);
      try {
        user = await T.api.users.updateProfile({
          firstName,
          lastName,
          email: values.email.trim(),
          institution: values.institution.trim(),
          program: values.program.trim(),
          yearOfStudy: Number(values.year_of_study),
          bio: values.bio.trim()
        });
        fillForm();
        renderHeader();
        renderFacts();
        T.shell.setUser(user);
        setMode('view');
        editBtn.focus();
        T.ui.toast({ title: 'Profile updated', message: 'Your changes have been saved.', variant: 'success' });
      } catch (err) {
        if (!profileForm.showServerErrors(err)) {
          V.formAlert(formEl, { title: 'Couldn’t save your profile', message: err.message });
        }
      } finally {
        T.ui.setButtonLoading(saveBtn, false);
      }
    }
  });

  editBtn.addEventListener('click', () => setMode('edit'));
  $('[data-action="cancel-edit"]', formEl).addEventListener('click', cancelEdit);
  bio.addEventListener('input', updateCount);
  formEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && formEl.dataset.mode === 'edit') cancelEdit();
  });

  /* ---- Change password --------------------------------------------------- */
  V.strengthMeter(pwFormEl.elements.new_password);
  const differentFromCurrent = (value, form) =>
    value && value === form.elements.current_password.value ? 'Your new password must be different from the current one.' : null;
  differentFromCurrent.dependsOn = 'current_password';

  const passwordForm = V.bind(pwFormEl, {
    current_password: [V.required('Enter your current password.')],
    new_password: [V.required('Enter a new password.'), V.strongPassword('fair'), differentFromCurrent],
    confirm_password: [V.required('Confirm your new password.'), V.match('new_password', 'Passwords do not match.')]
  }, {
    fieldMap: { currentPassword: 'current_password', newPassword: 'new_password' },
    onSubmit: async (values) => {
      T.ui.setButtonLoading(pwBtn, true);
      try {
        await T.api.users.changePassword({ currentPassword: values.current_password, newPassword: values.new_password });
        passwordForm.reset();
        pwFormEl.elements.username.value = user.email || '';
        T.ui.toast({ title: 'Password updated', message: 'Use your new password next time you sign in.', variant: 'success' });
      } catch (err) {
        if (!passwordForm.showServerErrors(err)) {
          V.formAlert(pwFormEl, { title: 'Couldn’t update your password', message: err.message });
        }
      } finally {
        T.ui.setButtonLoading(pwBtn, false);
      }
    }
  });

  /* ---- Boot -------------------------------------------------------------- */
  fillForm();
  renderHeader();
  renderFacts();
  setMode('view');
});
