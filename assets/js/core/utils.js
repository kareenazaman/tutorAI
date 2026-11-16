/**
 * TutorAI — utilities
 * Small, dependency-free helpers shared by every module.
 */
(function (T) {
  'use strict';

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  T.utils = {
    /** Escape untrusted text before inserting it into an HTML string. */
    escape(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
    },

    $(selector, scope = document) { return scope.querySelector(selector); },
    $$(selector, scope = document) { return Array.from(scope.querySelectorAll(selector)); },

    /** Parse an HTML string into a single element. */
    toElement(html) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      return tpl.content.firstElementChild;
    },

    /** "Maya Chen" → "MC" */
    initials(firstName = '', lastName = '') {
      const last = String(lastName || '').trim().split(/\s+/).pop() || '';   // "Rose Chen" → "Chen"
      return ((String(firstName || '').trim()[0] || '') + (last[0] || '')).toUpperCase() || '?';
    },

    /** "Maya  J. Chen" → { firstName: 'Maya', lastName: 'J. Chen' } */
    splitName(full = '') {
      const parts = String(full).trim().split(/\s+/).filter(Boolean);
      return { firstName: parts.shift() || '', lastName: parts.join(' ') };
    },

    fullName(user) {
      return user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
    },

    /** ISO date → "12m ago", "3h ago", "2d ago", or "Nov 4" */
    timeAgo(iso) {
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (Number.isNaN(diff)) return '';
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
      return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    },

    formatDate(iso, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
      return new Date(iso).toLocaleDateString('en-CA', options);
    },

    /** 1840 → "1.8 MB" */
    formatFileSize(kb) {
      return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
    },

    debounce(fn, ms = 250) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },

    /** localStorage that never throws (private mode, disabled storage). */
    storage: {
      get(key, fallback = null) {
        try {
          const raw = window.localStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
      },
      remove(key) {
        try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
      }
    },

    /** sessionStorage with the same API. Cleared when the tab closes. */
    session: {
      get(key, fallback = null) {
        try {
          const raw = window.sessionStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
      },
      remove(key) {
        try { window.sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
      }
    },

    /** Read a query-string parameter from the current URL. */
    queryParam(name) {
      return new URLSearchParams(window.location.search).get(name);
    },

    /** Build a path relative to the project root for the current page. */
    url(path) {
      const root = document.body.dataset.root || '';
      return root + path;
    },

    /** Settings → "Reduce motion", or the operating system's reduced-motion setting. */
    reducedMotion() {
      return document.documentElement.dataset.motion === 'reduce' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /** Apply the reduced-motion preference to <html data-motion> (and remember it on this device). */
    applyMotion(pref) {
      if (pref) T.utils.storage.set(T.config.storageKeys.motion, pref);
      const value = pref || T.utils.storage.get(T.config.storageKeys.motion, 'system');
      if (value === 'reduce') document.documentElement.dataset.motion = 'reduce';
      else delete document.documentElement.dataset.motion;
    },

    isMobileLayout() {
      return window.matchMedia(`(max-width: ${T.config.breakpoints.drawer}px)`).matches;
    }
  };

  // Before first paint: honour Settings → Appearance → Reduce motion
  T.utils.applyMotion();
})(window.TutorAI);
