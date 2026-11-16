/**
 * TutorAI — Forgot password (pages/auth/forgot-password.html)
 * PHP: POST /api/auth/forgot-password with { email }.
 * The response is identical whether or not the account exists, so the
 * page never reveals which emails are registered.
 */
document.addEventListener('tutorai:ready', () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;

  const formEl = document.getElementById('forgot-form');
  const submit = formEl.querySelector('[type="submit"]');
  const view = document.querySelector('[data-forgot-view]');
  const success = document.querySelector('[data-forgot-success]');

  const form = V.bind(formEl, {
    email: [V.required('Enter your email address.'), V.email()]
  }, {
    onSubmit: async (values) => {
      T.ui.setButtonLoading(submit, true);
      try {
        await T.api.auth.requestPasswordReset({ email: values.email.trim() });
        success.querySelector('[data-sent-email]').textContent = values.email.trim();
        view.hidden = true;
        success.hidden = false;
        success.focus();
      } catch (err) {
        V.formAlert(formEl, { title: 'Couldn’t send the link', message: err.message });
      } finally {
        T.ui.setButtonLoading(submit, false);
      }
    }
  });

  success.querySelector('[data-action="try-again"]').addEventListener('click', () => {
    form.reset();
    success.hidden = true;
    view.hidden = false;
    formEl.elements.email.focus();
  });

  formEl.elements.email.focus();
});
