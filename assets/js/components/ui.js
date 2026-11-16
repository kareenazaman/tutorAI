/**
 * TutorAI — UI helpers
 * ------------------------------------------------------------------
 * Reusable building blocks that return HTML strings or drive Bootstrap
 * components. Use these instead of hand-writing the same markup on
 * each page.
 *
 *   TutorAI.ui.toast({ title, message, variant })
 *   TutorAI.ui.emptyState({ icon, title, text, actions })
 *   TutorAI.ui.skeleton('card' | 'list' | 'text', count)
 *   TutorAI.ui.spinner({ label })
 *   TutorAI.ui.setButtonLoading(button, true|false)
 *   TutorAI.ui.confirm({ title, message, confirmLabel, danger }) → Promise<boolean>
 *   TutorAI.ui.pageHeader({ eyebrow, title, subtitle, actions })
 *   TutorAI.ui.icons(scope)   re-render Lucide icons after inserting HTML
 *   TutorAI.ui.passwordToggles(scope)  show/hide buttons in .tai-password fields
 *
 * Motion (run automatically by the shell; call enhance() after injecting HTML)
 *   TutorAI.ui.enhance(scope)  → countUp + meters + segmented + reveal
 *   <span data-count-to="82" data-count-suffix="%">0</span>
 *   <div class="tai-meter"><span data-meter="68"></span></div>
 *   <div class="tai-segmented" data-segmented>…buttons…</div>
 *   <section data-reveal>…</section>
 */
(function (T) {
  'use strict';

  const { escape } = T.utils;

  const VARIANTS = {
    success: { icon: 'circle-check',   tone: 'sage' },
    info:    { icon: 'info',           tone: 'powder' },
    warning: { icon: 'triangle-alert', tone: 'butter' },
    danger:  { icon: 'circle-alert',   tone: 'pink' },
    ai:      { icon: 'sparkles',       tone: 'lavender' }
  };

  function ensureToastContainer() {
    let el = document.getElementById('tai-toasts');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tai-toasts';
      el.className = 'tai-toast-container';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'false');
      document.body.appendChild(el);
    }
    return el;
  }

  T.ui = {
    /** Render Lucide icons inside a scope (call after injecting HTML). */
    icons(scope) {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: scope || document });
      }
    },

    /** Lucide placeholder tag. */
    icon(name, className = '') {
      return `<i data-lucide="${escape(name)}"${className ? ` class="${escape(className)}"` : ''} aria-hidden="true"></i>`;
    },

    toast({ title = '', message = '', variant = 'info', delay = 4500 } = {}) {
      const v = VARIANTS[variant] || VARIANTS.info;
      const el = T.utils.toElement(`
        <div class="toast" role="${variant === 'danger' ? 'alert' : 'status'}" aria-atomic="true">
          <div class="tai-toast">
            <span class="tai-icon-tile tai-icon-tile--${v.tone}">${T.ui.icon(v.icon)}</span>
            <div class="tai-toast__body">
              ${title ? `<p class="tai-toast__title">${escape(title)}</p>` : ''}
              ${message ? `<p class="tai-toast__text">${escape(message)}</p>` : ''}
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
        </div>`);
      ensureToastContainer().appendChild(el);
      T.ui.icons(el);
      if (window.bootstrap && bootstrap.Toast) {
        const toast = new bootstrap.Toast(el, { delay, autohide: delay > 0 });
        el.addEventListener('hidden.bs.toast', () => el.remove());
        toast.show();
      } else {
        el.classList.add('show');
        if (delay > 0) setTimeout(() => el.remove(), delay);
      }
      return el;
    },

    /**
     * Empty state block.
     * actions: [{ label, href?, icon?, variant?: 'primary'|'secondary'|'soft', attrs? }]
     */
    emptyState({ icon = 'inbox', title = 'Nothing here yet', text = '', actions = [], compact = false, tone = 'lavender' } = {}) {
      const tones = { lavender: '', powder: 'bg-powder text-powder-ink', sage: 'bg-sage text-sage-ink', pink: 'bg-pink text-pink-ink', butter: 'bg-butter text-butter-ink' };
      const btns = actions.map(a => {
        const cls = `btn btn-${a.variant || 'primary'}${compact ? ' btn-sm' : ''}`;
        const inner = `${a.icon ? T.ui.icon(a.icon) : ''}<span>${escape(a.label)}</span>`;
        const attrs = a.attrs || '';
        return a.href
          ? `<a class="${cls}" href="${escape(a.href)}" ${attrs}>${inner}</a>`
          : `<button type="button" class="${cls}" ${attrs}>${inner}</button>`;
      }).join('');
      return `
        <div class="tai-empty${compact ? ' tai-empty--compact' : ''}">
          <div class="tai-empty__art ${tones[tone] || ''}">${T.ui.icon(icon)}</div>
          <h3 class="tai-empty__title">${escape(title)}</h3>
          ${text ? `<p class="tai-empty__text">${escape(text)}</p>` : ''}
          ${btns ? `<div class="tai-empty__actions">${btns}</div>` : ''}
        </div>`;
    },

    /** Skeleton placeholders while data loads. */
    skeleton(type = 'text', count = 1) {
      const one = {
        text: `<span class="tai-skeleton tai-skeleton--text" style="width:${70 + Math.round(Math.random() * 30)}%"></span>`,
        list: `
          <div class="d-flex gap-3 align-items-center py-2">
            <span class="tai-skeleton tai-skeleton--circle" style="width:34px;height:34px"></span>
            <div class="flex-grow-1">
              <span class="tai-skeleton tai-skeleton--text" style="width:60%"></span>
              <span class="tai-skeleton tai-skeleton--text mb-0" style="width:85%"></span>
            </div>
          </div>`,
        card: `
          <div class="tai-card" aria-hidden="true">
            <span class="tai-skeleton mb-4" style="width:40px;height:40px;border-radius:12px"></span>
            <span class="tai-skeleton tai-skeleton--title"></span>
            <span class="tai-skeleton tai-skeleton--text"></span>
            <span class="tai-skeleton tai-skeleton--text" style="width:70%"></span>
          </div>`
      }[type] || '';
      return `<div class="tai-skeleton-group" aria-busy="true" aria-label="Loading">${one.repeat(count)}</div>`;
    },

    spinner({ label = 'Loading…', size = '' } = {}) {
      return `
        <div class="tai-loading" role="status">
          <span class="tai-spinner${size ? ` tai-spinner--${size}` : ''}" aria-hidden="true"></span>
          <span>${escape(label)}</span>
        </div>`;
    },

    setButtonLoading(button, isLoading) {
      if (!button) return;
      button.classList.toggle('is-loading', !!isLoading);
      button.disabled = !!isLoading;
      button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    },

    pageHeader({ eyebrow = '', title = '', subtitle = '', actions = '' } = {}) {
      return `
        <header class="tai-page-header">
          <div>
            ${eyebrow ? `<span class="tai-eyebrow">${escape(eyebrow)}</span>` : ''}
            <h1 class="tai-page-header__title">${escape(title)}</h1>
            ${subtitle ? `<p class="tai-page-header__subtitle">${escape(subtitle)}</p>` : ''}
          </div>
          ${actions ? `<div class="tai-page-header__actions">${actions}</div>` : ''}
        </header>`;
    },

    /** Animate numbers up from 0: data-count-to, data-count-decimals, data-count-prefix/suffix. */
    countUp(scope = document) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scope.querySelectorAll('[data-count-to]').forEach(el => {
        const to = parseFloat(el.dataset.countTo);
        const dec = el.dataset.countDecimals ? +el.dataset.countDecimals : (to % 1 ? 1 : 0);
        const pre = el.dataset.countPrefix || '';
        const suf = el.dataset.countSuffix || '';
        const fmt = v => pre + v.toLocaleString('en-CA', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
        if (reduce || Number.isNaN(to)) { el.textContent = fmt(to || 0); return; }
        const start = performance.now(), dur = +el.dataset.countDuration || 1200;
        const tick = (t) => {
          const p = Math.min((t - start) / dur, 1);
          el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },

    /** Fill bars from 0: <span data-meter="68"> inside .tai-meter or .progress-bar[data-meter]. */
    meters(scope = document) {
      const els = scope.querySelectorAll('[data-meter]');
      els.forEach(el => { el.style.width = '0'; });
      requestAnimationFrame(() => setTimeout(() => {
        els.forEach(el => { el.style.width = Math.max(0, Math.min(100, +el.dataset.meter)) + '%'; });
      }, 120));
    },

    /** Add a springy sliding indicator to [data-segmented] controls. */
    initSegmented(scope = document) {
      scope.querySelectorAll('[data-segmented]:not(.has-indicator)').forEach(group => {
        const items = () => group.querySelectorAll('.nav-link, .tai-segmented__item');
        const ind = document.createElement('span');
        ind.className = 'tai-segmented__indicator';
        ind.setAttribute('aria-hidden', 'true');
        group.prepend(ind);
        group.classList.add('has-indicator');
        const move = () => {
          const active = group.querySelector('.active') || items()[0];
          if (!active) return;
          ind.style.width = active.offsetWidth + 'px';
          ind.style.transform = `translateX(${active.offsetLeft}px)`;
        };
        group.addEventListener('click', (e) => {
          const btn = e.target.closest('.nav-link, .tai-segmented__item');
          if (!btn || !group.contains(btn)) return;
          if (!btn.hasAttribute('data-bs-toggle')) {
            items().forEach(i => { i.classList.toggle('active', i === btn); i.setAttribute('aria-selected', i === btn); });
          }
          requestAnimationFrame(move);
          group.dispatchEvent(new CustomEvent('tai:segment', { bubbles: true, detail: { value: btn.dataset.value || btn.textContent.trim() } }));
        });
        window.addEventListener('resize', move);
        move();
        // Fonts can shift widths after load
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(move);
      });
    },

    /** Fade elements in as they scroll into view: [data-reveal]. */
    reveal(scope = document) {
      const els = scope.querySelectorAll('[data-reveal]:not(.is-visible)');
      if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-visible')); return; }
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      els.forEach(el => io.observe(el));
    },

    /**
     * Show/hide toggles for password fields:
     *   <div class="tai-password"><input type="password" class="form-control">
     *     <button type="button" class="btn btn-ghost btn-icon btn-sm tai-password__toggle" data-password-toggle></button></div>
     */
    passwordToggles(scope = document) {
      scope.querySelectorAll('[data-password-toggle]:not([data-bound])').forEach(btn => {
        const input = btn.closest('.tai-password').querySelector('input');
        if (!input) return;
        btn.dataset.bound = 'true';
        const render = () => {
          const shown = input.type === 'text';
          btn.innerHTML = T.ui.icon(shown ? 'eye-off' : 'eye');
          btn.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
          btn.setAttribute('aria-pressed', String(shown));
          T.ui.icons(btn);
        };
        btn.setAttribute('aria-controls', input.id);
        btn.addEventListener('click', () => {
          input.type = input.type === 'password' ? 'text' : 'password';
          render();
          input.focus({ preventScroll: true });
        });
        // Always hide again when the form is submitted or reset
        if (input.form) {
          const hide = () => { input.type = 'password'; render(); };
          input.form.addEventListener('submit', hide);
          input.form.addEventListener('reset', hide);
        }
        render();
      });
    },

    /** Run every motion helper on a scope. Call after inserting new HTML. */
    enhance(scope = document) {
      T.ui.passwordToggles(scope);
      T.ui.icons(scope);
      T.ui.countUp(scope);
      T.ui.meters(scope);
      T.ui.initSegmented(scope);
      T.ui.reveal(scope);
    },

    /** Promise-based confirmation dialog built on Bootstrap's modal. */
    confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
      return new Promise(resolve => {
        if (!(window.bootstrap && bootstrap.Modal)) { resolve(false); return; }
        const el = T.utils.toElement(`
          <div class="modal fade" tabindex="-1" aria-modal="true" role="dialog" aria-labelledby="tai-confirm-title">
            <div class="modal-dialog modal-dialog-centered" style="max-width:440px">
              <div class="modal-content">
                <div class="modal-header">
                  <div>
                    <h2 class="modal-title" id="tai-confirm-title">${escape(title)}</h2>
                    ${message ? `<p class="modal-subtitle">${escape(message)}</p>` : ''}
                  </div>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-footer mt-4">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${escape(cancelLabel)}</button>
                  <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escape(confirmLabel)}</button>
                </div>
              </div>
            </div>
          </div>`);
        document.body.appendChild(el);
        const modal = new bootstrap.Modal(el);
        let result = false;
        el.querySelector('[data-confirm]').addEventListener('click', () => { result = true; modal.hide(); });
        el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(result); });
        modal.show();
      });
    }
  };
})(window.TutorAI);
