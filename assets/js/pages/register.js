/**
 * TutorAI — Create account (pages/auth/register.html)
 * PHP: POST /api/auth/register with { firstName, lastName, email, password, acceptTerms }.
 * Form field names (full_name, email, password, confirm_password, terms)
 * match what register.php will read from $_POST.
 */
document.addEventListener('tutorai:ready', () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;

  const formEl = document.getElementById('register-form');
  const submit = formEl.querySelector('[type="submit"]');
  const view = document.querySelector('[data-register-view]');
  const success = document.querySelector('[data-register-success]');

  V.strengthMeter(formEl.elements.password);

  V.bind(formEl, {
    full_name: [
      V.required('Enter your full name.'),
      V.minLength(2, 'Your name needs at least 2 characters.'),
      V.maxLength(80)
    ],
    email: [V.required('Enter your email address.'), V.email()],
    password: [V.required('Create a password.'), V.strongPassword('fair')],
    confirm_password: [V.required('Confirm your password.'), V.match('password', 'Passwords do not match.')],
    terms: [V.required('You must accept the terms to create an account.')]
  }, {
    fieldMap: { acceptTerms: 'terms', firstName: 'full_name', lastName: 'full_name' },
    onSubmit: async (values, form) => {
      const { firstName, lastName } = T.utils.splitName(values.full_name);
      T.ui.setButtonLoading(submit, true);
      try {
        const user = await T.api.auth.register({
          firstName, lastName,
          email: values.email.trim(),
          password: values.password,
          acceptTerms: values.terms
        });
        formEl.reset();   // clears the password fields from the DOM
        success.querySelector('[data-new-name]').textContent = user.firstName;
        success.querySelector('[data-new-id]').textContent = user.id;
        view.hidden = true;
        success.hidden = false;
        success.focus();
      } catch (err) {
        if (!form.showServerErrors(err)) {
          V.formAlert(formEl, { title: 'Couldn’t create your account', message: err.message });
        }
      } finally {
        T.ui.setButtonLoading(submit, false);
      }
    }
  });

  formEl.querySelectorAll('[data-terms]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    T.ui.toast({ title: 'Coming soon', message: 'The Terms of Use and Privacy Policy pages will be added before launch.' });
  }));

  formEl.elements.full_name.focus();
});
