/**
 * TutorAI — Sign in (pages/auth/login.html)
 * PHP: POST /api/auth/login with { email, password, remember }.
 * "Remember me" keeps only the email in localStorage, never the password.
 */
document.addEventListener('tutorai:ready', () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;
  const KEY = T.config.storageKeys.rememberedEmail;

  const formEl = document.getElementById('login-form');
  const submit = formEl.querySelector('[type="submit"]');

  // Why the visitor is here: their account was just deleted, or a page needs sign-in
  const params = new URLSearchParams(window.location.search);
  if (params.get('deleted') === '1') {
    V.formAlert(formEl, { variant: 'success', title: 'Your account was deleted', message: 'Your profile and study data have been removed. You can create a new account at any time.' });
  } else if (params.get('next')) {
    V.formAlert(formEl, { variant: 'info', title: 'Please sign in', message: 'Sign in to continue to that page.' });
  }

  // Demo only: bring back the sample student (e.g. after "Delete account")
  const resetBtn = document.querySelector('[data-action="reset-demo"]');
  if (resetBtn) {
    if (!T.config.useMockData) resetBtn.closest('p').hidden = true;
    resetBtn.addEventListener('click', async () => {
      T.ui.setButtonLoading(resetBtn, true);
      try {
        await T.api.dev.resetMockData();
        V.formAlert(formEl, { variant: 'success', title: 'Sample data restored', message: 'Sign in with the demo credentials below.' });
      } catch (err) {
        V.formAlert(formEl, { title: 'Couldn’t restore the sample data', message: err.message });
      } finally {
        T.ui.setButtonLoading(resetBtn, false);
      }
    });
  }

  // Prefill a remembered email
  const remembered = T.utils.storage.get(KEY, null);
  if (remembered) {
    formEl.elements.email.value = remembered;
    formEl.elements.remember.checked = true;
  }

  V.bind(formEl, {
    email:    [V.required('Enter your email address.'), V.email()],
    password: [V.required('Enter your password.')]
  }, {
    onSubmit: async (values) => {
      T.ui.setButtonLoading(submit, true);
      try {
        const user = await T.api.auth.login({
          email: values.email.trim(),
          password: values.password,
          remember: values.remember
        });
        if (values.remember) T.utils.storage.set(KEY, user.email);
        else T.utils.storage.remove(KEY);

        // This device follows the account's motion setting (Settings → Appearance)
        try { T.utils.applyMotion((await T.api.settings.get()).reducedMotion); } catch (e) { /* keep the device default */ }
        // Role-based landing: the page they asked for (if it's for their role), else their dashboard
        const next = T.auth.safeNext(T.utils.queryParam('next'), user.role);
        window.location.href = T.utils.url(next || T.auth.homeFor(user));
      } catch (err) {
        T.ui.setButtonLoading(submit, false);
        formEl.elements.password.value = '';
        V.formAlert(formEl, {
          title: err.status === 401 ? 'Couldn’t sign you in' : err.status === 403 ? 'Account deactivated' : 'Something went wrong',
          message: err.message
        });
        formEl.elements.password.focus();
      }
    }
  });

  (formEl.elements.email.value ? formEl.elements.password : formEl.elements.email).focus();
});
