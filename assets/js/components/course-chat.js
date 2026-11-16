/**
 * TutorAI — Course chat (one implementation of a course's AI Tutor space)
 * ------------------------------------------------------------------
 * Used by pages/student/ai-tutor.html?course=… (variant 'full') and the
 * course workspace's AI Tutor tab (variant 'embedded'). Both read and
 * write the same conversations through TutorAI.api, so a chat started or
 * continued in one place is the same chat in the other.
 *
 *   const chat = TutorAI.components.CourseChat.mount(el, {
 *     courseId: 'crs_2001',
 *     variant: 'full' | 'embedded',
 *     conversationId, lectureId,     // optional starting state
 *     prefill,                       // text placed in the composer
 *     autofocus,                     // focus the composer on load (full variant; default true)
 *     ask,                           // prompt sent once on load
 *     onStateChange({ conversationId, lectureId })   // host syncs its URL
 *   });
 *   chat.startNew({ lectureId, prompt });  chat.openConversation(id);  chat.destroy();
 *
 * Rules: the course is fixed for the space — every conversation listed or
 * created here belongs to it. The lecture scope is optional and can
 * change between messages. Replies come from TutorAI.api.ai.chat, which
 * only reads this course (lecture pages + learner context).
 * Needs: core/markdown.js (+ marked, DOMPurify, KaTeX, highlight.js),
 * core/validation.js, components/course-ui.js, Bootstrap (offcanvas, modal).
 */
(function (T) {
  'use strict';

  const { escape, url, timeAgo } = T.utils;
  const MAX = 2000;
  let uidCounter = 0;

  /* ---- Shared rename modal (one per document) ------------------------------ */
  let renameUi = null;
  function renameModal() {
    if (renameUi) return renameUi;
    const el = T.utils.toElement(`
      <div class="modal fade" tabindex="-1" aria-labelledby="tai-rename-title" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" style="max-width:440px">
          <form class="modal-content" action="/api/conversations" method="post" novalidate>
            <div class="modal-header">
              <h2 class="modal-title" id="tai-rename-title">Rename conversation</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div data-form-status></div>
              <div class="tai-field mb-0">
                <label class="form-label" for="tai-rename-input">Name</label>
                <input id="tai-rename-input" name="title" class="form-control" maxlength="80" autocomplete="off" required>
              </div>
            </div>
            <div class="modal-footer mt-2">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary"><span>Save</span></button>
            </div>
          </form>
        </div>
      </div>`);
    document.body.appendChild(el);
    const form = el.querySelector('form');
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    renameUi = { el, form, modal, onSave: null };
    renameUi.binder = T.validation.bind(form, {
      title: [T.validation.required('Enter a name for this conversation.'), T.validation.maxLength(80)]
    }, {
      onSubmit: async (values, f) => {
        const btn = form.querySelector('[type="submit"]');
        T.ui.setButtonLoading(btn, true);
        try {
          await renameUi.onSave(values.title);
          modal.hide();
        } catch (err) {
          if (!f.showServerErrors(err)) T.validation.formAlert(form, { message: err.message });
        } finally {
          T.ui.setButtonLoading(btn, false);
        }
      }
    });
    el.addEventListener('shown.bs.modal', () => { const i = form.elements.title; i.focus(); i.select(); });
    return renameUi;
  }

  /* ---- Component -------------------------------------------------------------- */
  function mount(root, opts) {
    const UI = T.components.CourseUI;
    const MD = T.markdown;
    const V = T.validation;
    const uid = `cchat${++uidCounter}`;
    const full = opts.variant !== 'embedded';
    const courseId = opts.courseId;
    const onStateChange = opts.onStateChange || (() => {});

    let course = null;        // course with stats
    let ctx = null;           // learner context + suggestion (tutor.context)
    let lectures = [];        // all lectures of the course (any status)
    let lectureId = opts.lectureId || null;
    let conversations = [];
    let conv = null;
    let messages = [];
    let busy = false;
    let stream = null;
    let destroyed = false;

    const ready = () => lectures.filter(l => l.status === 'ready');
    const lectureUrl = (id, page) => url(`pages/student/lecture.html?id=${encodeURIComponent(id)}${page ? `&page=${page}` : ''}`);
    const fullUrl = () => url(`pages/student/ai-tutor.html?course=${encodeURIComponent(courseId)}${conv ? `&c=${encodeURIComponent(conv.id)}` : ''}${!conv && lectureId ? `&lecture=${encodeURIComponent(lectureId)}` : ''}`);
    const live = document.querySelector('[data-live]') || (() => {
      const p = document.createElement('p'); p.className = 'visually-hidden'; p.setAttribute('aria-live', 'polite'); root.appendChild(p); return p;
    })();
    const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 40); };
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));
    const notify = () => onStateChange({ conversationId: conv ? conv.id : null, lectureId });

    /* ---- Data ------------------------------------------------------------- */
    async function loadCourse() {
      const [c, context, list] = await Promise.all([T.api.courses.get(courseId), T.api.tutor.context(courseId), T.api.lectures.list(courseId)]);
      course = c; ctx = context;
      lectures = list.sort((a, b) => (a.lectureNumber || 999) - (b.lectureNumber || 999) || a.uploadedAt.localeCompare(b.uploadedAt));
      if (lectureId && !ready().some(l => l.id === lectureId)) lectureId = null;
    }
    async function loadConversations() { conversations = await T.api.conversations.list({ courseId }); }

    async function openConversation(id, { quiet = false } = {}) {
      try {
        const [c, msgs] = await Promise.all([T.api.conversations.get(id), T.api.messages.list(id)]);
        if (c.courseId !== courseId) {
          if (!quiet) T.ui.toast({ title: 'Different course', message: `That conversation belongs to ${c.course.code}, so it can’t open in ${course ? course.code : 'this course'}.`, variant: 'warning' });
          return false;
        }
        conv = c; messages = msgs;
        lectureId = c.lectureId && ready().some(l => l.id === c.lectureId) ? c.lectureId : null;
        return true;
      } catch (err) {
        if (!quiet) T.ui.toast({ title: 'Conversation not found', message: 'It may have been deleted.', variant: 'warning' });
        return false;
      }
    }

    /* ---- Markup ----------------------------------------------------------- */
    function listPanel() {
      return `
        <div class="tai-chat__list">
          <button type="button" class="btn btn-primary w-100" data-chat="new">${T.ui.icon('plus')}<span>New chat</span></button>
          <div class="tai-chat__scope">
            <label class="form-label" for="${uid}-lecture">Lecture <span class="tai-muted fw-normal">(optional)</span></label>
            <select id="${uid}-lecture" class="form-select form-select-sm" data-scope></select>
          </div>
          <h2 class="tai-eyebrow mt-4 mb-1">${escape(course.code)} conversations</h2>
          <div data-conv-list></div>
        </div>`;
    }

    root.innerHTML = `<div class="tai-chat tai-chat--${full ? 'full' : 'embedded'}">${T.ui.skeleton('list', 3)}</div>`;

    function build() {
      const wrap = $('.tai-chat');
      wrap.innerHTML = `
        <aside class="tai-chat__left ${full ? 'offcanvas-md' : 'offcanvas-lg'} offcanvas-start" id="${uid}-convos" tabindex="-1" aria-labelledby="${uid}-convos-title">
          <div class="offcanvas-header">
            <h2 class="offcanvas-title h6 mb-0" id="${uid}-convos-title">${escape(course.code)} chats</h2>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#${uid}-convos" aria-label="Close"></button>
          </div>
          <div class="offcanvas-body">${listPanel()}</div>
        </aside>

        <section class="tai-chat__main" aria-labelledby="${uid}-title">
          <header class="tai-chat__head">
            <button type="button" class="btn btn-ghost btn-icon btn-sm ${full ? 'd-md-none' : 'd-lg-none'}" data-bs-toggle="offcanvas" data-bs-target="#${uid}-convos" aria-controls="${uid}-convos" aria-label="${escape(course.code)} conversations">${T.ui.icon('messages-square')}</button>
            <div class="min-w-0 flex-grow-1">
              <h${full ? 1 : 2} class="tai-chat__title tai-truncate" id="${uid}-title" data-title>New chat</h${full ? 1 : 2}>
              <p class="tai-chat__sub tai-truncate" data-sub></p>
            </div>
            ${full
              ? `<button type="button" class="btn btn-ghost btn-sm d-xl-none" data-bs-toggle="offcanvas" data-bs-target="#${uid}-context" aria-controls="${uid}-context">${T.ui.icon('panel-right')}<span class="d-none d-sm-inline">Context</span></button>`
              : `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-chat="new" aria-label="New chat" title="New chat">${T.ui.icon('square-pen')}</button>
                 <a class="btn btn-secondary btn-sm" data-fullscreen href="${escape(fullUrl())}">${T.ui.icon('maximize-2')}<span class="d-none d-sm-inline">Open full screen</span></a>`}
          </header>
          ${full ? '' : '<div class="tai-chat__strip" data-strip></div>'}
          <div class="tai-chat__scroll" data-scroll>
            <div class="tai-chat__thread" data-thread aria-label="Messages"></div>
          </div>
          <form class="tai-chat__composer" action="/tutor/chat" method="post" novalidate>
            <div data-form-status></div>
            <div class="tai-field mb-0">
              <label class="visually-hidden" for="${uid}-input">Message the AI Tutor about ${escape(course.code)}</label>
              <div class="tai-chat__box">
                <textarea id="${uid}-input" name="message" class="form-control" rows="1" maxlength="${MAX}" aria-describedby="${uid}-hint"></textarea>
                <button type="submit" class="btn btn-primary btn-icon tai-chat__send" data-send aria-label="Send">${T.ui.icon('arrow-up')}</button>
                <button type="button" class="btn btn-dark btn-icon tai-chat__send" data-chat="stop" aria-label="Stop generating" hidden>${T.ui.icon('square')}</button>
              </div>
            </div>
            <div class="tai-chat__hint" id="${uid}-hint">
              <span><kbd class="tai-kbd">Enter</kbd> to send · <kbd class="tai-kbd">Shift</kbd>+<kbd class="tai-kbd">Enter</kbd> for a new line</span>
              <span data-count></span>
            </div>
          </form>
        </section>

        ${full ? `
        <aside class="tai-chat__right offcanvas-xl offcanvas-end" id="${uid}-context" tabindex="-1" aria-labelledby="${uid}-context-title">
          <div class="offcanvas-header">
            <h2 class="offcanvas-title h6 mb-0" id="${uid}-context-title">${escape(course.code)} context</h2>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#${uid}-context" aria-label="Close"></button>
          </div>
          <div class="offcanvas-body"><div class="tai-chat__context" data-context></div></div>
        </aside>` : ''}`;
      T.ui.icons(wrap);
    }

    /* ---- Rendering -------------------------------------------------------- */
    function groupLabel(iso) {
      const d = new Date(iso), now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (d.getTime() >= start) return 'Today';
      if (d.getTime() >= start - 6 * 86400000) return 'This week';
      return 'Older';
    }

    function renderScope() {
      const sel = $('[data-scope]');
      sel.innerHTML = `<option value="">All lectures in this course</option>` + ready().map(l =>
        `<option value="${escape(l.id)}"${l.id === lectureId ? ' selected' : ''}>${escape(UI.lectureLabel(l))}: ${escape(l.title)}</option>`).join('');
      sel.disabled = !ready().length;
    }

    function renderConversations() {
      const box = $('[data-conv-list]');
      if (!conversations.length) {
        box.innerHTML = `<p class="tai-small tai-muted mb-0 mt-2">No ${escape(course.code)} conversations yet. Ask a question to start one.</p>`;
        return;
      }
      const groups = {};
      conversations.forEach(c => { (groups[groupLabel(c.updatedAt)] = groups[groupLabel(c.updatedAt)] || []).push(c); });
      box.innerHTML = ['Today', 'This week', 'Older'].filter(g => groups[g]).map(g => `
        <p class="tai-chat__group">${g}</p>
        <ul class="tai-chat__convos">${groups[g].map(c => `
          <li class="tai-chat__convo${conv && conv.id === c.id ? ' is-active' : ''}">
            <button type="button" class="tai-chat__open" data-open="${escape(c.id)}"${conv && conv.id === c.id ? ' aria-current="true"' : ''}>
              <span class="tai-chat__convo-title">${escape(c.title)}</span>
              ${c.preview ? `<span class="tai-chat__convo-preview">${escape(c.preview)}</span>` : ''}
              <span class="tai-chat__convo-meta">${c.lectureTitle ? `${T.ui.icon('file-text', 'icon-xs')} ${escape(c.lectureTitle)} · ` : ''}${escape(timeAgo(c.updatedAt))}</span>
            </button>
            <div class="dropdown">
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Options for ${escape(c.title)}">${T.ui.icon('ellipsis')}</button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button type="button" class="dropdown-item" data-rename="${escape(c.id)}">${T.ui.icon('pencil')}Rename</button></li>
                <li><button type="button" class="dropdown-item text-danger" data-delete="${escape(c.id)}">${T.ui.icon('trash-2')}Delete</button></li>
              </ul>
            </div>
          </li>`).join('')}</ul>`).join('');
      T.ui.icons(box);
    }

    /** "Used:" chips (lecture pages + learner data); older messages fall back to sources. */
    function usedChips(m) {
      if (m.context && m.context.length) {
        return `<div class="tai-chat__used" aria-label="Context used"><span class="tai-chat__used-label">Used:</span>${m.context.map(c =>
          `<a class="tai-chat__chip tai-chat__chip--${escape(c.type)}" href="${escape(url(c.link))}">${T.ui.icon({ lecture: 'file-text', quiz: 'list-checks', topic: 'target', progress: 'chart-line' }[c.type] || 'dot', 'icon-xs')}${escape(c.label)}</a>`).join('')}</div>`;
      }
      if (!m.sources || !m.sources.length) return '';
      return `<div class="tai-chat__used" aria-label="Sources"><span class="tai-chat__used-label">Used:</span>${m.sources.map(s => s.missing
        ? `<span class="tai-chat__chip is-missing">Lecture removed</span>`
        : `<a class="tai-chat__chip" href="${escape(lectureUrl(s.lectureId, s.page))}">${T.ui.icon('file-text', 'icon-xs')}${escape(s.lectureNumber ? `Lecture ${s.lectureNumber}` : 'Lecture')} p.${s.page}</a>`).join('')}</div>`;
    }

    const lastAssistantId = () => { const a = [...messages].reverse().find(m => m.role === 'assistant'); return a && a.id; };

    function messageHtml(m) {
      if (m.role === 'user') {
        return `<div class="tai-msg tai-msg--user" data-message-id="${escape(m.id)}"><div class="tai-msg__bubble">${escape(m.content).replace(/\n/g, '<br>')}</div></div>`;
      }
      const isLast = m.id === lastAssistantId();
      if (m.status === 'error') {
        return `
          <article class="tai-msg tai-msg--ai" data-message-id="${escape(m.id)}" aria-label="TutorAI error">
            <span class="tai-msg__avatar is-error">${T.ui.icon('circle-alert')}</span>
            <div class="tai-msg__body">
              <div class="alert alert-danger mb-0" role="alert"><div class="alert-body"><p class="alert-title">TutorAI couldn’t answer</p><p>Something went wrong while generating this reply. Nothing was lost — try again.</p>
                ${isLast ? `<button type="button" class="btn btn-secondary btn-sm mt-2" data-retry="${escape(m.id)}">${T.ui.icon('rotate-ccw')}<span>Retry</span></button>` : ''}</div></div>
            </div>
          </article>`;
      }
      return `
        <article class="tai-msg tai-msg--ai" data-message-id="${escape(m.id)}" aria-label="TutorAI reply">
          <span class="tai-msg__avatar">${T.ui.icon('sparkles')}</span>
          <div class="tai-msg__body">
            <div class="tai-msg__meta">
              <span class="fw-semibold text-ink">TutorAI</span>
              <span class="tai-badge tai-badge--outline tai-badge--sm" title="Generated by the mock AI from this course's lectures and your results">Demo response</span>
              ${m.stopped ? '<span class="tai-badge tai-badge--butter tai-badge--sm">Stopped</span>' : ''}
            </div>
            <div class="tai-prose tai-msg__content" data-content>${MD.renderMarkdown(m.content)}</div>
            <div data-after>${usedChips(m)}
              <div class="tai-msg__actions">
                <button type="button" class="btn btn-ghost btn-sm" data-copy="${escape(m.id)}">${T.ui.icon('copy')}<span>Copy</span></button>
                ${isLast ? `<button type="button" class="btn btn-ghost btn-sm" data-regenerate="${escape(m.id)}">${T.ui.icon('refresh-cw')}<span>Regenerate</span></button>` : ''}
              </div>
            </div>
          </div>
        </article>`;
    }

    function suggestionButton(cls = '') {
      const s = ctx && ctx.suggestion;
      if (!s) return '';
      if (!s.prompt) return `<a class="tai-chat__suggest ${cls}" href="${escape(UI.uploadUrl(courseId))}">${T.ui.icon('upload', 'icon-sm')}<span>${escape(s.label)}</span></a>`;
      return `<button type="button" class="tai-chat__suggest ${cls}" data-prompt="${escape(s.prompt)}" data-prompt-lecture="${escape(s.lectureId || '')}">${T.ui.icon('wand-sparkles', 'icon-sm')}<span>${escape(s.label)}</span></button>`;
    }

    function welcomeHtml() {
      if (!ready().length) {
        return T.ui.emptyState({
          icon: 'file-up', tone: 'butter', title: `No ready lectures in ${course.code}`,
          text: 'The AI Tutor only answers from this course’s lectures. Upload a lecture PDF and it will be ready in a moment.',
          actions: [{ label: 'Upload a lecture', icon: 'upload', href: UI.uploadUrl(course.id) }]
        });
      }
      const target = ready().find(l => l.id === lectureId) || [...ready()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
      const name = `“${target.title}”`;
      const prompts = [
        { icon: 'lightbulb', tone: 'lavender', label: 'Explain this concept simply', text: `Explain the main idea of ${name} simply` },
        { icon: 'list', tone: 'powder', label: 'Summarize this lecture', text: `Summarize ${name}` },
        { icon: 'code', tone: 'sage', label: 'Give me an example', text: `Give me an example from ${name}` },
        { icon: 'list-checks', tone: 'butter', label: 'Test my understanding', text: `Test my understanding of ${name}` }
      ];
      return `
        <div class="tai-chat__welcome">
          <span class="tai-icon-tile tai-icon-tile--lavender tai-icon-tile--lg">${T.ui.icon('sparkles')}</span>
          <h3 class="tai-chat__welcome-title tai-display">Ask about <em>${escape(course.code)}</em></h3>
          <p class="tai-meta">Answers come only from ${lectureId ? escape(name) : `the ${ready().length} ready lecture${ready().length === 1 ? '' : 's'} in ${escape(course.title)}`} and your results in this course.</p>
          ${full && ctx.suggestion && ctx.suggestion.prompt ? `<div class="mb-3">${suggestionButton('is-large')}</div>` : ''}
          <div class="tai-chat__prompts">${prompts.map(p => `
            <button type="button" class="tai-chat__prompt" data-prompt="${escape(p.text)}">
              <span class="tai-icon-tile tai-icon-tile--${p.tone}">${T.ui.icon(p.icon)}</span>
              <span class="tai-chat__prompt-label">${escape(p.label)}</span>
              <span class="tai-chat__prompt-text">${escape(p.text)}</span>
            </button>`).join('')}</div>
        </div>`;
    }

    function renderThread() {
      const thread = $('[data-thread]');
      thread.innerHTML = messages.length ? messages.map(messageHtml).join('') : welcomeHtml();
      T.ui.icons(thread);
      scrollToBottom(true);
    }

    function renderHeader() {
      $('[data-title]').textContent = conv ? conv.title : 'New chat';
      const lec = ready().find(l => l.id === lectureId);
      $('[data-sub]').textContent = `${course.code} · ${lec ? `${UI.lectureLabel(lec)}: ${lec.title}` : 'All lectures'}`;
      const fs = $('[data-fullscreen]');
      if (fs) fs.href = fullUrl();
      if (full) document.title = `${conv ? conv.title : course.code} · AI Tutor · TutorAI`;
    }

    const bar = (label, value, tone) => `
      <div class="tai-progress-row">
        <div class="tai-progress-row__head"><span class="tai-progress-row__label">${label}</span><span class="tai-progress-row__value">${value == null ? '—' : `${value}%`}</span></div>
        <div class="progress progress-sm" role="progressbar" aria-label="${label}" aria-valuenow="${value || 0}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar${tone ? ` is-${tone}` : ''}" style="width:${value || 0}%"></div></div>
      </div>`;

    function weakChips(limit = 4) {
      return ctx.weakTopics.slice(0, limit).map(w => {
        const l = lectures.find(x => x.id === w.lectureId);
        return `<button type="button" class="tai-chat__weak" data-prompt="${escape(`Help me review ${w.topic} — my quiz ${w.scores.length > 1 ? 'average is' : 'score was'} ${w.averageScore}%`)}" data-prompt-lecture="${escape(l && l.status === 'ready' ? l.id : '')}">
          <span>${escape(w.topic)}</span><span class="tai-badge tai-badge--${UI.scoreTone(w.averageScore)} tai-badge--sm">${w.averageScore}%</span></button>`;
      }).join('');
    }

    /** Right panel (full) — never empty: progress, weak topics, lectures, sources. */
    function renderContext() {
      if (full) {
        const last = [...messages].reverse().find(m => m.role === 'assistant' && m.status === 'complete');
        const sources = last ? last.sources : [];
        const readyCount = ready().length;
        $('[data-context]').innerHTML = `
          ${ctx.suggestion ? `<section class="tai-chat__ctx">
            <p class="tai-eyebrow mb-2">Suggested</p>
            ${suggestionButton('is-block')}
          </section>` : ''}
          <section class="tai-chat__ctx">
            <p class="tai-eyebrow mb-2">Progress · ${lectures.length} lecture${lectures.length === 1 ? '' : 's'}${readyCount !== lectures.length ? `, ${readyCount} ready` : ''}</p>
            <div class="d-grid gap-3">
              ${bar('Progress', ctx.progress)}
              ${bar('Mastery', ctx.mastery, ctx.mastery == null ? null : UI.scoreTone(ctx.mastery) === 'outline' ? null : UI.scoreTone(ctx.mastery))}
            </div>
            <p class="tai-small tai-muted mb-0 mt-2">${ctx.attemptedLectureCount} of ${ctx.readyLectureCount} ready lectures quizzed</p>
          </section>
          <section class="tai-chat__ctx">
            <p class="tai-eyebrow mb-2">Weak topics</p>
            ${ctx.weakTopics.length ? `<div class="tai-chat__weaks">${weakChips()}</div>` : `<p class="tai-small tai-muted mb-0">${ctx.attemptedLectureCount ? 'Every quizzed topic is at 65% or more.' : 'Take a quiz and weak topics will show up here.'}</p>`}
          </section>
          <section class="tai-chat__ctx">
            <p class="tai-eyebrow mb-2">Lectures <span class="tai-muted fw-normal text-lowercase">· click to start a lecture chat</span></p>
            ${lectures.length ? `<ul class="tai-chat__lectures">${lectures.map(l => {
              const lc = ctx.lectures.find(x => x.id === l.id) || {};
              const tag = l.status !== 'ready' ? UI.lectureStatus(l.status)
                : lc.bestScore == null ? '<span class="tai-badge tai-badge--outline tai-badge--sm">Not quizzed</span>'
                : `<span class="tai-badge tai-badge--${UI.scoreTone(lc.bestScore)} tai-badge--sm">Best ${lc.bestScore}%</span>`;
              return `<li><button type="button" class="tai-chat__lecture${l.id === lectureId ? ' is-active' : ''}" data-lecture-chat="${escape(l.id)}"${l.status !== 'ready' ? ' disabled data-locked' : ''}>
                <span class="tai-chat__lecture-num">${l.lectureNumber || '–'}</span><span class="tai-chat__lecture-title">${escape(l.title)}</span>${tag}</button></li>`;
            }).join('')}</ul>` : `<p class="tai-small tai-muted mb-0">No lectures yet. <a href="${escape(UI.uploadUrl(courseId))}">Upload one</a>.</p>`}
          </section>
          <section class="tai-chat__ctx">
            <p class="tai-eyebrow mb-2">Sources for the latest answer</p>
            ${!last ? `<p class="tai-small tai-muted mb-0">The pages TutorAI uses will appear here after it answers.</p>`
              : !sources.length ? `<p class="tai-small tai-muted mb-0">The latest answer didn’t use any lecture pages.</p>`
              : `<ol class="tai-chat__sources">${sources.map((s, i) => s.missing
                ? `<li class="tai-chat__source is-missing"><span class="tai-chat__source-num">${i + 1}</span><span>This lecture was deleted.</span></li>`
                : `<li><a class="tai-chat__source" href="${escape(lectureUrl(s.lectureId, s.page))}"><span class="tai-chat__source-num">${i + 1}</span>
                  <span class="min-w-0"><span class="tai-chat__source-title">${escape(s.lectureTitle)}</span><span class="tai-chat__source-page">${escape(s.lectureNumber ? `Lecture ${s.lectureNumber}` : 'Lecture')} · page ${s.page}</span>
                  <span class="tai-chat__source-snippet">${escape(s.snippet)}</span></span></a></li>`).join('')}</ol>`}
          </section>`;
        T.ui.icons($('[data-context]'));
      } else {
        $('[data-strip]').innerHTML = `
          <div class="tai-chat__strip-stats"><span>Progress <strong>${ctx.progress}%</strong></span><span>Mastery <strong>${ctx.mastery == null ? '—' : `${ctx.mastery}%`}</strong></span></div>
          ${ctx.weakTopics.length ? `<div class="tai-chat__weaks"><span class="tai-small tai-muted">Weak:</span>${weakChips(3)}</div>` : ''}
          ${suggestionButton()}`;
        T.ui.icons($('[data-strip]'));
      }
    }

    function renderAll() {
      renderScope();
      renderConversations();
      renderHeader();
      renderThread();
      renderContext();
      setComposerEnabled();
      notify();
    }

    function scrollToBottom(force = false) {
      const sc = $('[data-scroll]');
      if (!sc) return;
      const near = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140;
      if (force || near) sc.scrollTop = sc.scrollHeight;
    }

    /* ---- Composer --------------------------------------------------------- */
    let input, form, sendBtn, stopBtn;
    function autoGrow() {
      input.style.height = 'auto';
      const h = Math.min(input.scrollHeight, 200);
      input.style.height = `${h}px`;
      input.style.overflowY = input.scrollHeight > 200 ? 'auto' : 'hidden';   // no scrollbar until max height
      const n = input.value.length;
      const count = $('[data-count]');
      count.textContent = n > MAX * 0.8 ? `${n} / ${MAX}` : '';
      count.classList.toggle('text-pink-ink', n >= MAX - 50);
    }
    function setComposerEnabled() {
      const can = !!ready().length;
      input.disabled = busy || !can;
      sendBtn.disabled = busy || !can;
      input.placeholder = can ? `Ask about ${course.code}${lectureId ? ' · this lecture' : ''}…` : 'Upload a lecture to start asking questions';
    }
    function setBusy(on) {
      busy = on;
      setComposerEnabled();
      sendBtn.hidden = on && !!stream;
      stopBtn.hidden = !(on && !!stream);
      $$('[data-regenerate], [data-retry], [data-prompt], [data-lecture-chat]').forEach(b => { if (!b.hasAttribute('data-locked')) b.disabled = on; });
    }

    /* ---- Sending & streaming ---------------------------------------------- */
    function showTyping() {
      const thread = $('[data-thread]');
      if (!messages.length) thread.innerHTML = '';
      thread.insertAdjacentHTML('beforeend', `<article class="tai-msg tai-msg--ai" data-typing aria-label="TutorAI is typing"><span class="tai-msg__avatar">${T.ui.icon('sparkles')}</span>
        <div class="tai-msg__body"><div class="tai-msg__typing"><span class="tai-typing"><span></span><span></span><span></span></span><span class="tai-small tai-muted">Reading ${escape(course.code)} lectures and your results…</span></div></div></article>`);
      T.ui.icons(thread);
      scrollToBottom(true);
    }
    const hideTyping = () => { const t = $('[data-typing]'); if (t) t.remove(); };

    function streamMessage(m) {
      return new Promise((resolve) => {
        const thread = $('[data-thread]');
        const words = m.content.split(/(\s+)/);
        const shown = { ...m, content: '' };
        messages.push(shown);
        thread.insertAdjacentHTML('beforeend', messageHtml(shown));
        const el = thread.lastElementChild;
        el.querySelector('[data-after]').hidden = true;
        el.querySelector('.tai-msg__body').setAttribute('aria-busy', 'true');
        T.ui.icons(el);
        const contentEl = el.querySelector('[data-content]');
        let i = 0;
        stream = { timer: null, finish: null };
        setBusy(true);
        const finish = async (stopped) => {
          clearInterval(stream.timer);
          const partial = stopped ? words.slice(0, i).join('') : m.content;
          Object.assign(shown, m, { content: partial, stopped });
          if (stopped) {
            try { Object.assign(shown, await T.api.messages.update(m.id, { content: partial, stopped: true })); } catch (e) { /* keep local */ }
          }
          stream = null;
          if (!destroyed && el.isConnected) { el.outerHTML = messageHtml(shown); T.ui.icons(thread); scrollToBottom(); }
          resolve(shown);
        };
        stream.finish = finish;
        stream.timer = setInterval(() => {
          i = Math.min(words.length, i + 6);
          contentEl.innerHTML = MD.renderMarkdown(words.slice(0, i).join(''));
          scrollToBottom();
          if (i >= words.length) finish(false);
        }, 45);
      });
    }

    async function afterReply(reply, { stopped = false } = {}) {
      if (destroyed) return;
      try {
        [, ctx] = await Promise.all([loadConversations(), T.api.tutor.context(courseId)]);
      } catch (e) { /* keep what we have */ }
      if (conv) conv = conversations.find(c => c.id === conv.id) || conv;
      renderConversations();
      renderHeader();
      renderContext();
      notify();
      if (reply && reply.status === 'error') announce('TutorAI couldn’t answer. A Retry button is available.');
      else if (reply) announce(`${stopped ? 'Stopped. ' : ''}TutorAI replied: ${MD.toPlainText(reply.content).slice(0, 280)}`);
    }

    async function send(text) {
      if (busy || !text || !ready().length) return;
      setBusy(true);
      const thread = $('[data-thread]');
      const tempId = `tmp_${Date.now()}`;
      if (!messages.length) thread.innerHTML = '';
      const userMsg = { id: tempId, role: 'user', content: text };
      messages.push(userMsg);
      thread.insertAdjacentHTML('beforeend', messageHtml(userMsg));
      showTyping();
      announce('Message sent. TutorAI is answering…');
      try {
        const res = await T.api.ai.chat({
          conversationId: conv ? conv.id : null,
          courseId,
          lectureId,
          message: text,
          history: messages.filter(m => m.id !== tempId).slice(-10).map(m => ({ role: m.role, content: m.content }))
          // learnerContext: built server-side (FastAPI from MySQL); the mock builds it from the store
        });
        if (!conv) conv = res.conversation;
        Object.assign(userMsg, res.userMessage);
        const tmpEl = thread.querySelector(`[data-message-id="${tempId}"]`);
        if (tmpEl) tmpEl.setAttribute('data-message-id', userMsg.id);
        hideTyping();
        $$('[data-regenerate]').forEach(b => b.remove());
        notify();
        const shown = await streamMessage(res.message);
        setBusy(false);
        await afterReply(shown, { stopped: shown.stopped });
      } catch (err) {
        hideTyping();
        setBusy(false);
        const d = err.details || {};
        if (d.message && d.message.status === 'error') {
          if (!conv && d.conversation) conv = d.conversation;
          if (d.userMessage) Object.assign(userMsg, d.userMessage);
          messages.push(d.message);
          renderThread();
          await afterReply(d.message);
        } else {
          messages = messages.filter(m => m.id !== tempId);
          renderThread();
          input.value = text;
          autoGrow();
          V.formAlert(form, { title: 'Message not sent', message: err.message });
        }
      }
      if (!destroyed) input.focus({ preventScroll: true });
    }

    async function replace(messageId) {
      if (busy || !conv) return;
      setBusy(true);
      const idx = messages.findIndex(m => m.id === messageId);
      if (idx > -1) messages.splice(idx, 1);
      const el = root.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
      if (el) el.remove();
      showTyping();
      announce('TutorAI is answering again…');
      try {
        const res = await T.api.ai.chat({ conversationId: conv.id, courseId, lectureId, replaceMessageId: messageId });
        hideTyping();
        const shown = await streamMessage(res.message);
        setBusy(false);
        await afterReply(shown, { stopped: shown.stopped });
      } catch (err) {
        hideTyping();
        setBusy(false);
        const d = err.details || {};
        if (d.message) messages.push(d.message);
        else T.ui.toast({ title: 'Couldn’t regenerate', message: err.message, variant: 'danger' });
        renderThread();
        await afterReply(d.message || null);
      }
    }

    /* ---- Actions ---------------------------------------------------------- */
    function closeDrawers() {
      [`${uid}-convos`, `${uid}-context`].forEach(id => {
        const el = document.getElementById(id);
        const inst = el && bootstrap.Offcanvas.getInstance(el);
        if (inst) inst.hide();
      });
    }

    function startNew({ lectureId: scope, prompt } = {}) {
      if (busy) return;
      conv = null;
      messages = [];
      if (scope !== undefined) lectureId = scope && ready().some(l => l.id === scope) ? scope : null;
      renderAll();
      closeDrawers();
      if (prompt) send(prompt);
      else input.focus({ preventScroll: true });
    }

    async function deleteConversation(id) {
      const c = conversations.find(x => x.id === id);
      if (!c) return;
      const ok = await T.ui.confirm({ title: `Delete “${c.title}”?`, message: `Its ${c.messageCount} message${c.messageCount === 1 ? '' : 's'} will be deleted here and everywhere this chat appears. This can’t be undone.`, confirmLabel: 'Delete conversation', danger: true });
      if (!ok) return;
      try {
        await T.api.conversations.remove(id);
        await loadConversations();
        if (conv && conv.id === id) startNew(); else renderConversations();
        T.ui.toast({ title: 'Conversation deleted', variant: 'success' });
      } catch (err) {
        T.ui.toast({ title: 'Couldn’t delete', message: err.message, variant: 'danger' });
      }
    }

    function openRename(id) {
      const ui = renameModal();
      const c = conversations.find(x => x.id === id);
      ui.binder.reset();
      ui.form.elements.title.value = c ? c.title : '';
      ui.onSave = async (title) => {
        const updated = await T.api.conversations.rename(id, title);
        if (conv && conv.id === updated.id) conv = updated;
        await loadConversations();
        renderConversations();
        renderHeader();
        T.ui.toast({ title: 'Conversation renamed', variant: 'success' });
      };
      ui.modal.show();
    }

    async function onClick(e) {
      const t = e.target;
      const b = (sel) => t.closest(sel);
      if (b('[data-chat="new"]')) return startNew();
      if (b('[data-chat="stop"]')) { if (stream && stream.finish) stream.finish(true); return; }
      const lec = b('[data-lecture-chat]');
      if (lec) return startNew({ lectureId: lec.dataset.lectureChat });
      const prompt = b('[data-prompt]');
      if (prompt) {
        if (busy) return;
        const scope = prompt.dataset.promptLecture;
        if (scope !== undefined && scope !== '' && scope !== lectureId && !messages.length) { lectureId = scope; renderScope(); renderHeader(); }
        closeDrawers();
        return send(prompt.dataset.prompt);
      }
      const open = b('[data-open]');
      if (open) {
        if (busy || (conv && conv.id === open.dataset.open)) { closeDrawers(); return; }
        if (await openConversation(open.dataset.open)) { renderAll(); closeDrawers(); input.focus({ preventScroll: true }); }
        return;
      }
      const ren = b('[data-rename]');
      if (ren) return openRename(ren.dataset.rename);
      const del = b('[data-delete]');
      if (del) return deleteConversation(del.dataset.delete);
      const copy = b('[data-copy]');
      if (copy) {
        const m = messages.find(x => x.id === copy.dataset.copy);
        const ok = m && await MD.copyText(MD.toPlainText(m.content));
        const label = copy.querySelector('span');
        label.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => { label.textContent = 'Copy'; }, 1500);
        return;
      }
      const regen = b('[data-regenerate]');
      if (regen) return replace(regen.dataset.regenerate);
      const retry = b('[data-retry]');
      if (retry) return replace(retry.dataset.retry);
    }

    /** Another browser tab changed the store: show the same chats here. */
    async function onStoreChanged() {
      if (busy || destroyed) return;
      try {
        await Promise.all([loadCourse(), loadConversations()]);
        if (conv) {
          const still = conversations.find(c => c.id === conv.id);
          if (still) { await openConversation(conv.id, { quiet: true }); } else { conv = null; messages = []; }
        }
        renderAll();
      } catch (e) { /* course may have been deleted; leave as is */ }
    }

    /* ---- Boot ------------------------------------------------------------- */
    const ready$ = (async () => {
      await Promise.all([loadCourse(), loadConversations()]);
      if (opts.conversationId) await openConversation(opts.conversationId);
      if (destroyed) return;
      build();
      input = $(`#${uid}-input`);
      form = $('.tai-chat__composer');
      sendBtn = $('[data-send]');
      stopBtn = $('[data-chat="stop"]');
      V.bind(form, {
        message: [V.required('Type a question first.'), V.maxLength(MAX, `Keep questions under ${MAX} characters.`)]
      }, {
        onSubmit: async (values) => {
          const text = values.message.trim();
          input.value = '';
          autoGrow();
          await send(text);
        }
      });
      input.addEventListener('input', autoGrow);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          if (!busy) form.requestSubmit();
        }
      });
      $('[data-scope]').addEventListener('change', (e) => {
        lectureId = e.target.value || null;
        renderHeader();
        renderContext();
        setComposerEnabled();
        if (!messages.length) renderThread();
        notify();
      });
      root.addEventListener('click', onClick);
      window.addEventListener('tutorai:store-changed', onStoreChanged);
      renderAll();
      if (opts.prefill) { input.value = opts.prefill; }
      autoGrow();
      if (opts.ask) send(opts.ask);
      else if (full && opts.autofocus !== false && !('ontouchstart' in window)) input.focus({ preventScroll: true });
    })().catch(err => {
      root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon: 'circle-alert', tone: 'pink', title: err.status === 404 ? 'Course not found' : 'The AI Tutor couldn’t load', text: err.message })}</div>`;
      T.ui.icons(root);
      throw err;
    });

    return {
      ready: ready$,
      startNew: (o) => ready$.then(() => startNew(o)),
      openConversation: (id) => ready$.then(async () => { if (await openConversation(id)) renderAll(); }),
      get conversationId() { return conv ? conv.id : null; },
      destroy() {
        destroyed = true;
        if (stream) { clearInterval(stream.timer); stream = null; }   // the full reply is already saved
        closeDrawers();
        window.removeEventListener('tutorai:store-changed', onStoreChanged);
        root.removeEventListener('click', onClick);
      }
    };
  }

  T.components = T.components || {};
  T.components.CourseChat = { mount };
})(window.TutorAI);
