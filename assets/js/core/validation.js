/**
 * TutorAI — form validation
 * ------------------------------------------------------------------
 * Reusable validators, inline error helpers and a small form binder.
 * Forms use `novalidate`; this module validates on blur and on submit,
 * re-checks a field as you type once it has shown an error, and focuses
 * the first invalid field on submit.
 *
 *   const V = TutorAI.validation;
 *   const form = V.bind(document.getElementById('login-form'), {
 *     email:    [V.required('Enter your email.'), V.email()],
 *     password: [V.required('Enter your password.')]
 *   }, { onSubmit: async (values) => { … } });
 *
 * Markup contract: each control sits inside a `.tai-field` wrapper with a
 * stable id. Errors render as `<p id="{controlId}-error" class="invalid-feedback d-block">`
 * at the end of that wrapper, and are linked with aria-invalid + aria-describedby.
 *
 * A rule is `(value, form) => errorMessage | null`.
 */
(function (T) {
  'use strict';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---- Validators -------------------------------------------------------- */
  const required = (message = 'This field is required.') => (value, form, el) => {
    if (el && el.type === 'checkbox') return el.checked ? null : message;
    return String(value ?? '').trim() ? null : message;
  };

  const email = (message = 'Enter a valid email address, like name@university.ca.') => (value) =>
    !String(value || '').trim() || EMAIL_RE.test(String(value).trim()) ? null : message;

  const minLength = (n, message) => (value) =>
    !value || String(value).trim().length >= n ? null : (message || `Use at least ${n} characters.`);

  const maxLength = (n, message) => (value) =>
    String(value || '').length <= n ? null : (message || `Use ${n} characters or fewer.`);

  /** Optional whole number in a range (empty passes; pair with required() if needed). */
  const integer = ({ min = 1, max = Infinity } = {}, message) => (value) => {
    const v = String(value ?? '').trim();
    if (!v) return null;
    const n = Number(v);
    return /^\d+$/.test(v) && n >= min && n <= max ? null
      : (message || (max === Infinity ? `Use a whole number of ${min} or more.` : `Use a whole number from ${min} to ${max}.`));
  };

  /** Must equal another field in the same form (by name). */
  const match = (otherName, message = 'The values do not match.') => (value, form) => {
    const other = form && form.elements[otherName];
    return !value || !other || value === other.value ? null : message;
  };

  /* ---- Password strength -------------------------------------------------- */
  const PASSWORD_CHECKS = [
    { id: 'length', label: 'At least 8 characters',          test: v => v.length >= 8 },
    { id: 'case',   label: 'Upper and lowercase letters',    test: v => /[a-z]/.test(v) && /[A-Z]/.test(v) },
    { id: 'number', label: 'At least one number',            test: v => /\d/.test(v) },
    { id: 'symbol', label: 'At least one symbol (e.g. ! ? #)', test: v => /[^A-Za-z0-9\s]/.test(v) }
  ];
  const LEVELS = ['weak', 'fair', 'strong'];
  const LEVEL_LABELS = { weak: 'Weak', fair: 'Fair', strong: 'Strong' };

  /**
   * Score a password.
   * → { level: '' | 'weak' | 'fair' | 'strong', score: 0–4, checks: { length: true, … } }
   * Length is mandatory: without 8 characters the level never rises above weak.
   */
  function passwordStrength(value = '') {
    const v = String(value);
    const checks = {};
    PASSWORD_CHECKS.forEach(c => { checks[c.id] = c.test(v); });
    const score = Object.values(checks).filter(Boolean).length;
    let level = '';
    if (v) level = !checks.length || score <= 2 ? 'weak' : score === 3 ? 'fair' : 'strong';
    return { level, score, checks };
  }

  /** Rule: the password must reach at least `min` ('fair' by default). */
  const strongPassword = (min = 'fair', message = 'Use at least 8 characters with a mix of letters, numbers and symbols.') => (value) => {
    if (!value) return null;
    const { level } = passwordStrength(value);
    return LEVELS.indexOf(level) >= LEVELS.indexOf(min) ? null : message;
  };

  /* ---- Inline errors ----------------------------------------------------- */
  const errorId = (el) => `${el.id || el.name}-error`;
  const wrapperOf = (el) => el.closest('.tai-field') || el.parentElement;

  function addDescribedBy(el, id) {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(id)) ids.push(id);
    el.setAttribute('aria-describedby', ids.join(' '));
  }
  function removeDescribedBy(el, id) {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== id);
    ids.length ? el.setAttribute('aria-describedby', ids.join(' ')) : el.removeAttribute('aria-describedby');
  }

  function showError(el, message) {
    if (!el) return;
    const id = errorId(el);
    let msg = document.getElementById(id);
    if (!msg) {
      msg = document.createElement('p');
      msg.id = id;
      msg.className = 'invalid-feedback d-block mb-0';
      wrapperOf(el).appendChild(msg);
    }
    msg.textContent = message;
    el.classList.add('is-invalid');
    el.setAttribute('aria-invalid', 'true');
    addDescribedBy(el, id);
  }

  function clearError(el) {
    if (!el) return;
    const id = errorId(el);
    const msg = document.getElementById(id);
    if (msg) msg.remove();
    el.classList.remove('is-invalid');
    el.removeAttribute('aria-invalid');
    removeDescribedBy(el, id);
  }

  /** Form-level message (server errors, success notes) in a [data-form-status] slot. */
  function formAlert(form, { variant = 'danger', title = '', message = '' } = {}) {
    const slot = form.querySelector('[data-form-status]') || form.parentElement.querySelector('[data-form-status]');
    if (!slot) return;
    const icons = { danger: 'circle-alert', success: 'circle-check', info: 'info', warning: 'triangle-alert' };
    slot.innerHTML = `
      <div class="alert alert-${variant} mb-4" role="${variant === 'danger' ? 'alert' : 'status'}">
        ${T.ui.icon(icons[variant] || 'info')}
        <div class="alert-body">
          ${title ? `<p class="alert-title">${T.utils.escape(title)}</p>` : ''}
          ${message ? `<p>${T.utils.escape(message)}</p>` : ''}
        </div>
      </div>`;
    T.ui.icons(slot);
  }
  function clearFormAlert(form) {
    const slot = form.querySelector('[data-form-status]') || form.parentElement.querySelector('[data-form-status]');
    if (slot) slot.innerHTML = '';
  }

  /* ---- Form binder ------------------------------------------------------- */
  /**
   * bind(form, schema, { onSubmit, fieldMap })
   *   schema    { fieldName: [rule, …] }
   *   onSubmit  async (values, api) — called only when every field passes
   *   fieldMap  { camelCaseApiField: 'form_field_name' } for server errors
   * Returns { validate, validateField, reset, values, showServerErrors, form }.
   */
  function bind(form, schema, { onSubmit, fieldMap = {} } = {}) {
    const touched = new Set();
    const isGroup = (x) => typeof RadioNodeList !== 'undefined' && x instanceof RadioNodeList;
    /** The element that carries errors and focus (first radio of a group). */
    const fieldEl = (name) => { const x = form.elements[name]; return isGroup(x) ? x[0] : x; };
    /** A field's value: radio groups → checked value, checkboxes → boolean. */
    const fieldValue = (name) => {
      const x = form.elements[name];
      if (!x) return undefined;
      if (isGroup(x)) return x.value;
      return x.type === 'checkbox' ? x.checked : x.value;
    };

    function values() {
      const out = {};
      Object.keys(schema).concat(Array.from(form.elements).map(e => e.name).filter(Boolean)).forEach(name => {
        if (!form.elements[name] || name in out) return;
        out[name] = fieldValue(name);
      });
      return out;
    }

    function validateField(name) {
      const el = fieldEl(name);
      if (!el || el.disabled) return true;
      const value = fieldValue(name);
      for (const rule of schema[name] || []) {
        const message = rule(value, form, el);
        if (message) { showError(el, message); return false; }
      }
      clearError(el);
      return true;
    }

    function validate() {
      let firstInvalid = null;
      Object.keys(schema).forEach(name => {
        touched.add(name);
        if (!validateField(name) && !firstInvalid) firstInvalid = fieldEl(name);
      });
      if (firstInvalid) firstInvalid.focus();
      return !firstInvalid;
    }

    function reset() {
      touched.clear();
      form.reset();
      Object.keys(schema).forEach(name => { if (fieldEl(name)) clearError(fieldEl(name)); });
      clearFormAlert(form);
    }

    /** Map ApiError.details.errors onto fields. Returns true if any were shown. */
    function showServerErrors(err) {
      const errors = (err && err.details && err.details.errors) || {};
      let first = null;
      Object.entries(errors).forEach(([key, message]) => {
        const el = fieldEl(fieldMap[key] || key);
        if (!el) return;
        showError(el, message);
        touched.add(el.name);
        if (!first) first = el;
      });
      if (first) first.focus();
      return !!first;
    }

    // Blur: validate once the user leaves a field they've typed in
    form.addEventListener('focusout', (e) => {
      const name = e.target.name;
      if (!name || !(name in schema)) return;
      if (!document.hasFocus()) return;   // switching windows/tabs isn't "leaving" the field
      if (e.target.value === '' && !touched.has(name) && e.target.type !== 'checkbox') return;
      touched.add(name);
      validateField(name);
    });

    // Input: re-check fields already showing feedback, and dependent "match" fields
    const onInput = (e) => {
      const name = e.target.name;
      if (!name) return;
      if (touched.has(name) && name in schema) validateField(name);
      Object.keys(schema).forEach(other => {
        if (other !== name && touched.has(other) && fieldEl(other) && fieldValue(other)) {
          if ((schema[other] || []).some(r => r.dependsOn === name)) validateField(other);
        }
      });
    };
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);

    const api = { form, validate, validateField, reset, values, showServerErrors };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormAlert(form);
      if (!validate()) return;
      if (onSubmit) await onSubmit(values(), api);
    });

    return api;
  }

  /* ---- Strength meter ---------------------------------------------------- */
  /**
   * Render a strength meter + requirement checklist under a password input
   * and keep it in sync. Returns { update, reset }.
   */
  function strengthMeter(input) {
    const id = `${input.id}-strength`;
    const el = T.utils.toElement(`
      <div class="tai-strength" id="${id}" data-level="">
        <div class="tai-strength__head">
          <div class="tai-strength__bars" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="tai-strength__label" aria-live="polite"><span class="visually-hidden">Password strength: </span><span data-strength-label></span></p>
        </div>
        <ul class="tai-strength__list">
          ${PASSWORD_CHECKS.map(c => `<li data-check="${c.id}">${T.utils.escape(c.label)}<span class="visually-hidden" data-check-state> (not met)</span></li>`).join('')}
        </ul>
      </div>`);
    const wrap = wrapperOf(input);
    const after = input.closest('.tai-password') || input;
    after.insertAdjacentElement('afterend', el);
    addDescribedBy(input, id);

    function update() {
      const { level, checks } = passwordStrength(input.value);
      el.dataset.level = level;
      el.querySelector('[data-strength-label]').textContent = level ? LEVEL_LABELS[level] : '';
      el.querySelectorAll('[data-check]').forEach(li => {
        const met = !!checks[li.dataset.check];
        li.classList.toggle('is-met', met);
        li.querySelector('[data-check-state]').textContent = met ? ' (met)' : ' (not met)';
      });
    }
    input.addEventListener('input', update);
    const form = input.form;
    // form.reset() fires 'reset' before values clear, so update on the next frame
    if (form) form.addEventListener('reset', () => requestAnimationFrame(update));
    update();
    return { update, reset: update, element: el, wrap };
  }

  /** Mark a match rule as depending on another field so it re-checks live. */
  function matchField(otherName, message) {
    const rule = match(otherName, message);
    rule.dependsOn = otherName;
    return rule;
  }

  T.validation = {
    required, email, minLength, maxLength, integer,
    match: matchField,
    strongPassword, passwordStrength, PASSWORD_CHECKS,
    showError, clearError, formAlert, clearFormAlert,
    bind, strengthMeter
  };
})(window.TutorAI);
