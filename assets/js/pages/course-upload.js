/**
 * TutorAI — Lecture upload (pages/student/course-upload.html?id=crs_2001)
 * ------------------------------------------------------------------
 * PHP: POST /api/courses/{id}/lectures  (multipart/form-data)
 *      fields: lecture_file, title, lecture_number, description
 * Demo mode: the file is never read or sent. The page creates the
 * lecture record (status 'uploading') and then simulates the pipeline,
 * saving each status to the mock store:
 *   uploading (0–100%) → extracting → processing → ready
 * Cancel is available while uploading and deletes the record.
 * Without ?id= the page asks which course the lecture belongs to.
 */
document.addEventListener('tutorai:ready', async () => {
  'use strict';
  const T = window.TutorAI;
  const V = T.validation;
  const UI = T.components.CourseUI;
  const { $, $$, escape, url, formatFileSize } = T.utils;

  const root = document.querySelector('[data-upload-root]');
  const MAX_BYTES = 20 * 1024 * 1024;
  const STEPS = ['uploading', 'extracting', 'processing', 'ready'];
  const courseId = new URLSearchParams(window.location.search).get('id');

  let course = null;          // fixed course (from ?id=)
  let courses = [];           // picker options (no ?id=)
  let file = null;            // the selected File
  let fileError = '';         // last file problem, shown on submit too
  let autoTitle = '';         // title we prefilled, so we don't overwrite the user's own
  let autoNumber = '';
  let busy = false;           // true from upload start until ready
  let upload = null;          // { lecture, cancelled, timer }

  /* ---- Load course(s) ------------------------------------------------------ */
  function empty({ icon, title, text, actions, tone }) {
    root.innerHTML = `<div class="tai-card">${T.ui.emptyState({ icon, title, text, actions, tone })}</div>`;
    T.ui.icons(root);
  }

  try {
    if (courseId) {
      course = await T.api.courses.get(courseId);
    } else {
      courses = (await T.api.courses.list()).filter(c => c.status !== 'archived');
    }
  } catch (err) {
    T.shell.setCrumbs([{ label: 'My Courses', href: url('pages/student/courses.html') }, { label: 'Course not found' }]);
    if (err.status === 404) {
      empty({ icon: 'search-x', tone: 'butter', title: 'Course not found', text: 'This course doesn’t exist, or it was deleted, so there’s nowhere to upload to.',
        actions: [{ label: 'Back to My Courses', icon: 'arrow-left', href: url('pages/student/courses.html') }] });
    } else {
      empty({ icon: 'circle-alert', tone: 'pink', title: 'We couldn’t load the course', text: err.message,
        actions: [{ label: 'Back to My Courses', href: url('pages/student/courses.html') }] });
    }
    return;
  }

  if (course) {
    T.shell.setCrumbs([
      { label: 'My Courses', href: url('pages/student/courses.html') },
      { label: course.code, href: UI.courseUrl(course.id) },
      { label: 'Upload' }
    ]);
  } else {
    T.shell.setCrumbs([{ label: 'My Courses', href: url('pages/student/courses.html') }, { label: 'Upload lecture' }]);
    if (!courses.length) {
      empty({ icon: 'folder-plus', title: 'Add a course first', text: 'Lectures belong to a course. Add one, then upload its lecture PDFs.',
        actions: [{ label: 'Add course', icon: 'plus', href: url('pages/student/courses.html?new=1') }] });
      return;
    }
  }

  /* ---- Build the page from the template ---------------------------------- */
  root.innerHTML = '';
  root.appendChild(document.getElementById('upload-template').content.cloneNode(true));

  const formEl = document.getElementById('upload-form');
  const views = { form: formEl, progress: $('[data-upload-view="progress"]', root), done: $('[data-upload-view="done"]', root) };
  const dropzone = $('[data-dropzone]', root);
  const fileInput = document.getElementById('upload-file');
  const preview = $('[data-file-preview]', root);
  const submitBtn = $('[type="submit"]', formEl);
  const desc = formEl.elements.description;
  const descCount = document.getElementById('upload-description-count');
  const picker = $('[data-course-picker]', root);

  // Keep the file input inside the drop zone so focus/errors land there
  dropzone.appendChild(fileInput);

  const backHref = course ? UI.courseUrl(course.id, 'lectures') : url('pages/student/courses.html');
  $('[data-back-link]', root).href = backHref;
  $('[data-upload-eyebrow]', root).textContent = course ? `${course.code} · ${course.title}` : 'Upload';
  $('[data-upload-subtitle]', root).textContent = course
    ? `Add a lecture PDF to ${course.code}. TutorAI reads it so the AI Tutor and quizzes can use it.`
    : 'Choose a course, then add a lecture PDF.';

  if (course) {
    formEl.action = `/api/courses/${encodeURIComponent(course.id)}/lectures`;
    formEl.elements.course_id.remove();
    picker.remove();
  } else {
    picker.hidden = false;
    formEl.elements.course_id.innerHTML = `<option value="">Choose a course</option>${courses.map(c => `<option value="${escape(c.id)}">${escape(c.code)} — ${escape(c.title)}</option>`).join('')}`;
    formEl.elements.course_id.addEventListener('change', () => {
      formEl.action = formEl.elements.course_id.value ? `/api/courses/${encodeURIComponent(formEl.elements.course_id.value)}/lectures` : '';
    });
  }
  T.ui.enhance(root);

  /* ---- File checks --------------------------------------------------------- */
  function checkFile(f) {
    if (!f) return 'Choose a PDF to upload.';
    const isPdfName = /\.pdf$/i.test(f.name);
    const isPdfType = !f.type || f.type === 'application/pdf';   // some systems report no type
    if (!isPdfName || !isPdfType) {
      return `“${f.name}” isn’t a PDF. Export your slides or notes as PDF, then try again.`;
    }
    if (f.size === 0) return `“${f.name}” is empty (0 bytes). Choose a PDF that has content.`;
    if (f.size > MAX_BYTES) return `“${f.name}” is ${formatFileSize(f.size / 1024)}. The limit is 20 MB — try compressing it or splitting it in two.`;
    return '';
  }

  /** "COMP3610-L06-rest-apis.pdf" → { title: 'Rest apis', number: '6' } */
  function guessFromName(name) {
    const base = name.replace(/\.pdf$/i, '');
    const numMatch = base.match(/(?:^|[^a-z0-9])(?:l|lec|lecture|week|wk|w)[\s_-]?0*(\d{1,3})(?![0-9])/i);
    const words = base.split(/[\s_\-.]+/).filter(Boolean).filter(w =>
      !/^[a-z]{2,5}\d{3,4}[a-z]?$/i.test(w) &&                  // course code, e.g. COMP3610
      !/^(l|lec|lecture|week|wk|w)?0*\d{1,3}$/i.test(w) &&        // L06, 06, week3
      !/^(lecture|lec|week|slides?|notes?|final|v\d+)$/i.test(w));
    let title = (words.length ? words : [base]).join(' ').trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { title: title.slice(0, 150), number: numMatch ? String(parseInt(numMatch[1], 10)) : '' };
  }

  function showFile(f) {
    preview.innerHTML = `
      <div class="tai-file-card">
        <span class="tai-icon-tile tai-icon-tile--pink tai-icon-tile--lg">${T.ui.icon('file-text')}</span>
        <div class="tai-file-card__body">
          <p class="tai-file-card__name">${escape(f.name)}</p>
          <p class="tai-file-card__meta">PDF · ${escape(formatFileSize(f.size / 1024))}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" data-action="remove-file" aria-label="Remove ${escape(f.name)}">${T.ui.icon('x')}</button>
      </div>`;
    T.ui.icons(preview);
    preview.hidden = false;
    dropzone.hidden = true;
  }

  function clearFile({ focus = false } = {}) {
    file = null;
    fileInput.value = '';
    preview.hidden = true;
    preview.innerHTML = '';
    dropzone.hidden = false;
    if (focus) $('[data-action="browse"]', dropzone).focus();
  }

  function acceptFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    if (files.length > 1) {
      fileError = `You dropped ${files.length} files. Upload one PDF at a time.`;
    } else {
      fileError = checkFile(files[0]);
    }
    if (fileError) {
      clearFile();
      V.showError(fileInput, fileError);
      $('[data-action="browse"]', dropzone).focus();
      return;
    }
    file = files[0];
    V.clearError(fileInput);
    showFile(file);

    // Prefill title and number unless the user already typed their own
    const guess = guessFromName(file.name);
    const t = formEl.elements.title, n = formEl.elements.lecture_number;
    if (!t.value.trim() || t.value === autoTitle) { t.value = guess.title; autoTitle = guess.title; V.clearError(t); }
    if (guess.number && (!n.value || n.value === autoNumber)) { n.value = guess.number; autoNumber = guess.number; V.clearError(n); }
    $('[data-action="remove-file"]', preview).focus();
  }

  /* ---- Drag and drop ------------------------------------------------------- */
  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer ? e.dataTransfer.types : []).includes('Files');
  dropzone.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropzone.classList.add('is-dragover'); });
  dropzone.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  dropzone.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropzone.classList.remove('is-dragover'); });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('is-dragover');
    if (!busy) acceptFiles(e.dataTransfer.files);
  });
  // A file dropped beside the zone shouldn't navigate the browser away
  ['dragover', 'drop'].forEach(type => window.addEventListener(type, (e) => {
    if (hasFiles(e) && !dropzone.contains(e.target)) e.preventDefault();
  }));

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('click', (e) => e.stopPropagation());
  fileInput.addEventListener('change', () => acceptFiles(fileInput.files));

  /* ---- Description counter ------------------------------------------------ */
  const updateCount = () => {
    descCount.textContent = `${desc.value.length} / 500`;
    descCount.classList.toggle('text-pink-ink', desc.value.length >= 470);
  };
  desc.addEventListener('input', updateCount);

  /* ---- Views & stepper ----------------------------------------------------- */
  function show(view) {
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== view; });
    if (view === 'done') views.done.focus();
  }

  function setStep(status) {
    const idx = STEPS.indexOf(status);
    $$('[data-step]', views.progress).forEach((li, i) => {
      li.classList.toggle('is-done', i < idx || status === 'ready');
      li.classList.toggle('is-current', i === idx && status !== 'ready');
      li.classList.remove('is-failed');
      li.toggleAttribute('aria-current', i === idx);
      if (i === idx) li.setAttribute('aria-current', 'step');
    });
  }

  function setProgress(pct, label) {
    const bar = $('[data-progress]', views.progress);
    const p = Math.round(pct);
    bar.firstElementChild.style.width = `${p}%`;
    bar.setAttribute('aria-valuenow', String(p));
    $('[data-progress-value]', views.progress).textContent = `${p}%`;
    if (label) $('[data-progress-label]', views.progress).textContent = label;
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /** Fake upload progress: bigger files take longer (1.8–6 s). */
  function simulateUpload(state, bytes) {
    const duration = Math.min(6000, Math.max(1800, 1500 + (bytes / (1024 * 1024)) * 250));
    const start = performance.now();
    return new Promise((resolve) => {
      state.timer = setInterval(() => {
        if (state.cancelled) { clearInterval(state.timer); resolve(false); return; }
        const t = Math.min(1, (performance.now() - start) / duration);
        const eased = 1 - Math.pow(1 - t, 2);
        setProgress(eased * 100, `Uploading ${file.name}…`);
        if (t >= 1) { clearInterval(state.timer); resolve(true); }
      }, 90);
    });
  }

  const beforeUnload = (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  /* ---- Submit -------------------------------------------------------------- */
  const schema = {
    lecture_file: [() => fileError || (file ? null : 'Choose a PDF to upload.')],
    title: [V.required('Enter a lecture title.'), V.maxLength(150)],
    lecture_number: [V.integer({ min: 1, max: 999 }, 'Use a whole number from 1 to 999, or leave it blank.')],
    description: [V.maxLength(500)]
  };
  if (!course) schema.course_id = [V.required('Choose which course this lecture belongs to.')];

  const uploadForm = V.bind(formEl, schema, {
    fieldMap: { title: 'title', lectureNumber: 'lecture_number', description: 'description', file: 'lecture_file' },
    onSubmit: async (values, form) => {
      const targetId = course ? course.id : values.course_id;
      const targetCourse = course || courses.find(c => c.id === targetId);
      T.ui.setButtonLoading(submitBtn, true);
      let lecture;
      try {
        lecture = await T.api.lectures.create(targetId, {
          title: values.title.trim(),
          lectureNumber: values.lecture_number === '' ? null : Number(values.lecture_number),
          description: values.description.trim(),
          fileName: file.name,
          fileSizeKb: file.size / 1024
        });
      } catch (err) {
        T.ui.setButtonLoading(submitBtn, false);
        if (!form.showServerErrors(err)) V.formAlert(formEl, { title: 'Couldn’t start the upload', message: err.message });
        return;
      }
      T.ui.setButtonLoading(submitBtn, false);

      // Progress view
      busy = true;
      upload = { lecture, cancelled: false, timer: null };
      $('[data-progress-file]', views.progress).innerHTML = preview.innerHTML;
      const rm = $('[data-action="remove-file"]', views.progress);
      if (rm) rm.remove();
      $('[data-action="cancel-upload"]', views.progress).hidden = false;
      setStep('uploading');
      setProgress(0, 'Starting upload…');
      show('progress');
      $('[data-action="cancel-upload"]', views.progress).focus();

      const finished = await simulateUpload(upload, file.size);
      if (!finished) return;   // cancelled — handled by cancelUpload()

      $('[data-action="cancel-upload"]', views.progress).hidden = true;
      try {
        setStep('extracting');
        setProgress(100, 'Extracting text from each page…');
        await T.api.lectures.updateStatus(lecture.id, 'extracting');
        await sleep(1400);

        setStep('processing');
        setProgress(100, 'Processing for the AI Tutor and quizzes…');
        await T.api.lectures.updateStatus(lecture.id, 'processing');
        await sleep(1600);

        const ready = await T.api.lectures.updateStatus(lecture.id, 'ready');
        setStep('ready');
        busy = false;

        $('[data-done-text]', views.done).textContent =
          `“${ready.title}” was added to ${targetCourse.code}${ready.pageCount ? ` — about ${ready.pageCount} pages` : ''}. The AI Tutor can use it now.`;
        $('[data-view-lecture]', views.done).href = UI.courseUrl(targetId, 'lectures', { lecture: ready.id });
        show('done');
        T.ui.toast({ title: 'Lecture ready', message: `“${ready.title}” is ready in ${targetCourse.code}.`, variant: 'success' });
      } catch (err) {
        busy = false;
        $$('[data-step].is-current', views.progress).forEach(li => { li.classList.remove('is-current'); li.classList.add('is-failed'); });
        $('[data-progress-label]', views.progress).textContent = 'Processing failed.';
        T.api.lectures.updateStatus(lecture.id, 'failed').catch(() => {});
        T.ui.toast({ title: 'Processing failed', message: err.message, variant: 'danger' });
      }
    }
  });

  async function cancelUpload() {
    if (!upload || upload.cancelled) return;
    upload.cancelled = true;
    clearInterval(upload.timer);
    const btn = $('[data-action="cancel-upload"]', views.progress);
    T.ui.setButtonLoading(btn, true);
    try { await T.api.lectures.remove(upload.lecture.id); } catch (e) { /* already gone */ }
    T.ui.setButtonLoading(btn, false);
    busy = false;
    upload = null;
    show('form');
    submitBtn.focus();
    T.ui.toast({ title: 'Upload cancelled', message: 'Nothing was saved. Your details are still filled in.', variant: 'info' });
  }

  function uploadAnother() {
    uploadForm.reset();
    clearFile();
    fileError = '';
    autoTitle = '';
    autoNumber = '';
    updateCount();
    upload = null;
    show('form');
    $('[data-action="browse"]', dropzone).focus();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'browse') { e.stopPropagation(); fileInput.click(); }
    else if (a.dataset.action === 'remove-file') { clearFile({ focus: true }); fileError = ''; }
    else if (a.dataset.action === 'cancel-upload') cancelUpload();
    else if (a.dataset.action === 'upload-another') uploadAnother();
  });

  updateCount();
});
