/**
 * TutorAI — Markdown rendering for AI answers and lecture text
 * ------------------------------------------------------------------
 *   TutorAI.markdown.renderMarkdown(text) → sanitized HTML string
 *   TutorAI.markdown.toPlainText(text)    → text for aria-live / copy
 *
 * Pipeline (order matters):
 *   1. Protect maths ($…$ inline, $$…$$ block) from the Markdown parser,
 *      skipping code spans and fenced code.
 *   2. marked parses Markdown (GFM). Code blocks are highlighted with
 *      highlight.js and wrapped with a header and a Copy button.
 *   3. Maths placeholders are replaced with KaTeX output
 *      (katex.renderToString — the page needs a string, and maths must be
 *      kept away from Markdown, so auto-render's DOM pass isn't needed).
 *   4. DOMPurify sanitizes the final HTML. ALWAYS — nothing skips this.
 *
 * Needs (pinned CDN, loaded only on pages that render Markdown):
 *   marked@12.0.2, dompurify@3.1.6, katex@0.16.11, highlight.js@11.9.0
 * If a library is missing it degrades: no DOMPurify → escaped plain text;
 * no marked → escaped text with paragraphs; no KaTeX → TeX shown as code;
 * no highlight.js → plain code.
 */
(function (T) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TOKEN = (i) => `TAIMATHTOKEN${i}X`;
  let configured = false;

  const LANG_LABELS = { php: 'PHP', sql: 'SQL', js: 'JavaScript', javascript: 'JavaScript', python: 'Python', py: 'Python', html: 'HTML', xml: 'HTML', css: 'CSS', json: 'JSON', bash: 'Shell', sh: 'Shell', text: 'Text', plaintext: 'Text' };

  function codeBlock(code, info) {
    const lang = String(info || '').trim().split(/\s+/)[0].toLowerCase();
    const hl = window.hljs;
    const known = hl && lang && hl.getLanguage(lang) ? lang : null;
    let body;
    try { body = known ? hl.highlight(code, { language: known, ignoreIllegals: true }).value : esc(code); }
    catch (e) { body = esc(code); }
    const label = LANG_LABELS[lang] || (lang ? lang.toUpperCase() : 'Code');
    return `<div class="tai-code"><div class="tai-code__bar"><span class="tai-code__lang">${esc(label)}</span>` +
      `<button type="button" class="tai-code__copy" data-copy-code aria-label="Copy ${esc(label)} code">Copy</button></div>` +
      `<pre><code class="hljs${known ? ` language-${esc(known)}` : ''}">${body}</code></pre></div>`;
  }

  function configure() {
    if (configured || !window.marked) return;
    configured = true;
    window.marked.use({
      gfm: true,
      breaks: false,
      renderer: {
        // marked ≤12 passes (code, info); ≥13 passes a token object — support both
        code(code, info) {
          if (code && typeof code === 'object') { info = code.lang; code = code.text; }
          return codeBlock(String(code ?? ''), info);
        }
      }
    });
    if (window.DOMPurify && window.DOMPurify.addHook) {
      // External links open in a new tab, safely
      window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
    }
  }

  /** Swap maths for placeholders, leaving code untouched. */
  function protectMath(src) {
    const store = [];
    const parts = String(src).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
    const text = parts.map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => { store.push({ tex: tex.trim(), display: true }); return `\n\n${TOKEN(store.length - 1)}\n\n`; })
        // $…$ inline: no space just inside the dollars, and not "$5 and $10"
        .replace(/(^|[^\\$\w])\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, (_, pre, tex) => { store.push({ tex, display: false }); return pre + TOKEN(store.length - 1); });
    }).join('');
    return { text, store };
  }

  function renderMath({ tex, display }) {
    if (window.katex) {
      try {
        return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore', trust: false });
      } catch (e) { /* fall through */ }
    }
    return display ? `<pre class="tai-math-fallback"><code>${esc(tex)}</code></pre>` : `<code class="tai-math-fallback">${esc(tex)}</code>`;
  }

  function restoreMath(html, store) {
    return html
      .replace(new RegExp(`<p>\\s*TAIMATHTOKEN(\\d+)X\\s*</p>`, 'g'), (_, i) => `<div class="tai-math-block">${renderMath(store[+i])}</div>`)
      .replace(/TAIMATHTOKEN(\d+)X/g, (_, i) => (store[+i] ? renderMath(store[+i]) : ''));
  }

  function sanitize(html) {
    return window.DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
      ADD_ATTR: ['target', 'data-copy-code', 'aria-label', 'aria-hidden'],
      FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
      FORBID_ATTR: ['srcset', 'formaction']
    });
  }

  function fallbackText(text) {
    return String(text || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

  /**
   * Markdown → sanitized HTML (maths, highlighted code with Copy buttons).
   * Safe to insert with innerHTML. Never returns unsanitized markup.
   */
  function renderMarkdown(text) {
    const src = String(text ?? '');
    if (!window.DOMPurify) return fallbackText(src);     // can't sanitize → plain text only
    configure();
    if (!window.marked) return sanitize(fallbackText(src));
    const { text: protectedText, store } = protectMath(src);
    let html;
    try { html = window.marked.parse(protectedText); }
    catch (e) { html = fallbackText(src); }
    return sanitize(restoreMath(html, store));
  }

  /** Markdown → readable plain text (for screen-reader announcements and Copy). */
  function toPlainText(text) {
    return String(text ?? '')
      .replace(/<details>\s*<summary>[^<]*<\/summary>/g, '')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/~~~\w*\n|```\w*\n|~~~|```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_`]/g, '')
      .replace(/\$\$?([^$]+)\$\$?/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // One delegated handler for every code block's Copy button
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-code]');
    if (!btn) return;
    const code = btn.closest('.tai-code') && btn.closest('.tai-code').querySelector('code');
    if (!code) return;
    const ok = await copyText(code.textContent);
    btn.textContent = ok ? 'Copied' : 'Copy failed';
    btn.classList.toggle('is-copied', ok);
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1600);
  });

  T.markdown = { renderMarkdown, toPlainText, copyText, protectMath };
  T.renderMarkdown = renderMarkdown;
})(window.TutorAI = window.TutorAI || {});
