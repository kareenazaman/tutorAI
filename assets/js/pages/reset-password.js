/**
 * TutorAI — Reset password (pages/auth/reset-password.html?token=…)
 * PHP: POST /api/auth/reset-password with { token, password }.
 * No token → "invalid or expired" state straight away. A token the API
 * rejects (410) switches to the same state. Demo token: ?token=demo
 */
document.addEventListener('tutorai:ready', () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;

  const view = document.querySelector('[data-reset-view]');
  const success = document.querySelector('[data-reset-success]');
  const invalid = document.querySelector('[data-reset-invalid]');
  const formEl = document.getElementById('reset-form');
  const submit = formEl.querySelector('[type="submit"]');
  const token = (T.utils.queryParam('token') || '').trim();

  function show(state) {
    [view, success, invalid].forEach(el => { el.hidden = el !== state; });
    if (state !== view) state.focus();
  }

  if (!token) { show(invalid); return; }

  formEl.elements.token.value = token;
  show(view);
  V.strengthMeter(formEl.elements.password);

  V.bind(formEl, {
    password: [V.required('Enter a new password.'), V.strongPassword('fair')],
    confirm_password: [V.required('Confirm your new password.'), V.match('password', 'Passwords do not match.')]
  }, {
    onSubmit: async (values, form) => {
      T.ui.setButtonLoading(submit, true);
      try {
        await T.api.auth.resetPassword({ token: values.token, password: values.password });
        formEl.reset();
        show(success);
      } catch (err) {
        if (err.status === 410 || err.status === 404) { formEl.reset(); show(invalid); return; }
        if (!form.showServerErrors(err)) V.formAlert(formEl, { title: 'Couldn’t update your password', message: err.message });
      } finally {
        T.ui.setButtonLoading(submit, false);
      }
    }
  });

  formEl.elements.password.focus();
});
