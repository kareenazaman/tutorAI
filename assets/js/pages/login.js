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

        const home = user.role === 'admin' ? 'pages/admin/dashboard.html' : 'pages/student/dashboard.html';
        window.location.href = T.utils.url(home);
      } catch (err) {
        T.ui.setButtonLoading(submit, false);
        formEl.elements.password.value = '';
        V.formAlert(formEl, {
          title: err.status === 401 ? 'Couldn’t sign you in' : 'Something went wrong',
          message: err.message
        });
        formEl.elements.password.focus();
      }
    }
  });

  (formEl.elements.email.value ? formEl.elements.password : formEl.elements.email).focus();
});
