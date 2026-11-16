/**
 * TutorAI — mock AI (stand-in for the FastAPI service)
 * ------------------------------------------------------------------
 * Pure functions: they receive lecture pages and return Markdown.
 * Nothing here calls a model or the network, and there is no API key —
 * the real LLM key will only ever live in the FastAPI backend.
 *
 * Course isolation: callers pass ONLY the selected course's pages
 * (api.js builds that list from the store). assertCourseIsolation()
 * re-checks every source after generation and throws if one belongs
 * to another course.
 *
 *   TutorAI.mockAI.buildContext({ course, pages, message, history, lectureId, learner })
 *   TutorAI.mockAI.respond(context, { variant })
 *   TutorAI.mockAI.chat(args)  = respond(buildContext(args), args)
 *   TutorAI.mockAI.summarize({ course, lecture, pages })
 *   TutorAI.mockAI.studyNotes({ course, lecture, pages })
 *   TutorAI.mockAI.generateQuestions({ pages, count, difficulty, types, focusTerms, priorityPages, exclude, topicOf })
 *   TutorAI.mockAI.parseQuizRequest(text, courses)
 *
 * A page is { lectureId, lectureTitle, lectureNumber, page, heading, text }.
 *
 * `learner` is the course's learner context (built by api.js in mock mode;
 * FastAPI will build it server-side from MySQL):
 *   { courseId, code, progress, mastery, readyLectureCount, attemptedLectureCount,
 *     lectures:  [{ id, title, lectureNumber, status, bestScore, attempts: [{ quizId, title, topic, score, completedAt }] }],
 *     weakTopics: [{ topic, lectureId, averageScore, scores, quizIds, quizTitles }],   // revise band (< 65%), lowest first
 *     unquizzedLectures: [{ id, title, lectureNumber }],
 *     unstartedQuizzes:  [{ id, title, topic, lectureId }] }
 * The context step only pulls the parts of it that are relevant to the
 * message; the answer never states a score that isn't in this object.
 * Answers cite pages as Markdown links to lecture.html?id=…&page=….
 */
(function (T) {
  'use strict';

  const STOP = new Set(('a about above after again all also am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours out over own please same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours tell show give explain explains simply simple briefly summarize summarise summary lecture lectures example examples test understanding quiz me my concept concepts mean means meaning using use used work works key ideas idea point points help understand understanding course really thing things way ways like get got make makes made one two three'.split(' ')));

  /* ---- Text helpers ------------------------------------------------------- */
  const CODE_RE = /~~~(\w*)\n([\s\S]*?)~~~/g;
  const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

  function stem(w) {
    if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }

  function terms(text) {
    return String(text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
      .map(stem);
  }

  /** Prose only: no code blocks or display maths. */
  function prose(text) {
    return String(text).replace(CODE_RE, ' ').replace(BLOCK_MATH_RE, ' ');
  }

  /** Split page text into readable sentences (list items count as sentences). */
  function sentences(text) {
    const out = [];
    prose(text).split(/\n+/).forEach(line => {
      let l = line.trim();
      if (!l) return;
      l = l.replace(/^(\d+\.|-|\*)\s+/, '');
      if (l.length < 3) return;
      l.split(/(?<=[.!?])\s+(?=[A-Z*`$(])/).forEach(s => {
        const t = s.trim();
        if (t.length <= 2 || /[:,]$/.test(t)) return;   // "…placeholders:" / "…pieces," only introduce a code block or formula
        out.push(/[.!?)]$/.test(t) ? t : t + '.');
      });
    });
    return out;
  }

  const codeBlocks = (text) => [...String(text).matchAll(CODE_RE)].map(m => ({ lang: m[1] || 'text', code: m[2].replace(/\s+$/, '') }));
  const mathBlocks = (text) => [...String(text).matchAll(BLOCK_MATH_RE)].map(m => m[1].trim());
  const boldTerms = (text) => [...String(text).matchAll(/\*\*([^*]{2,40})\*\*/g)].map(m => m[1].trim());

  const clip = (s, n = 160) => {
    const t = String(s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
  };
  /** Plain snippet for source cards (no Markdown symbols). */
  const TEX = { rightarrow: '→', to: '→', leftarrow: '←', iff: '⇔', cap: '∩', cup: '∪', mid: '|', sum: 'Σ', sigma: 'σ', pi: 'π', bowtie: '⋈', times: '×', eta: 'η', nabla: '∇', approx: '≈', le: '≤', ge: '≥', leq: '≤', geq: '≥', neq: '≠', top: 'ᵀ', dots: '…', cdot: '·', quad: ' ', infty: '∞' };
  /** TeX → readable text, only inside $…$ so code like session_start() keeps its underscores. */
  const plainMath = (tex) => tex.replace(/\\([a-zA-Z]+)/g, (_, cmd) => TEX[cmd] ?? '').replace(/[{}^_]/g, '');
  const plain = (s) => String(s).replace(/\*\*|`/g, '').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:!?)]|$)/g, '$1$2').replace(/\$([^$]+)\$/g, (_, tex) => plainMath(tex)).replace(/\s+/g, ' ');

  /** "**Term** — definition" list items → the definition, else null. */
  function definitionOf(sentence, term) {
    const m = sentence.match(new RegExp('^\\*\\*' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*\\*\\s*[—–:-]\\s*(.+)$'));
    return m ? m[1].replace(/\*\*/g, '') : null;
  }

  const lectureLabel = (p) => (p.lectureNumber ? `Lecture ${p.lectureNumber}` : `“${clip(p.lectureTitle || 'Lecture', 32)}”`);
  const pageUrl = (p) => `lecture.html?id=${encodeURIComponent(p.lectureId)}&page=${p.page}`;
  const cite = (p, { short = false } = {}) => `([${short ? '' : `${lectureLabel(p)}, `}p. ${p.page}](${pageUrl(p)}))`;

  function snippetFor(p, qterms = []) {
    const list = sentences(p.text);
    const hit = list.find(s => qterms.some(t => terms(s).includes(t)));
    return clip(plain(hit || list[0] || p.heading), 160);
  }
  const toSource = (p, qterms) => ({ lectureId: p.lectureId, page: p.page, snippet: snippetFor(p, qterms) });

  /* ---- Retrieval ------------------------------------------------------------ */
  /** Keyword scoring: heading matches count 4×, lecture title 2×, body 1× (capped). */
  function retrieve(pages, qterms, k = 3) {
    if (!qterms.length) return [];
    return pages
      .map(p => {
        const head = terms(p.heading), title = terms(p.lectureTitle), body = terms(p.text);
        let score = 0;
        qterms.forEach(t => {
          if (head.includes(t)) score += 4;
          if (title.includes(t)) score += 2;
          score += Math.min(4, body.filter(w => w === t).length);
        });
        return { p, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || a.p.page - b.p.page)
      .slice(0, k)
      .map(r => r.p);
  }

  function detectIntent(message) {
    const m = String(message).toLowerCase();
    if (/what should i (study|revise|review|focus on|work on|do next)|study plan|revision plan|where (should|do) i (start|focus)|how am i doing|my progress|weak (topics|areas|spots|points)|what (do|should) i (study|revise|review)|ready for (the |my )?(exam|midterm|final|test)/.test(m)) return 'plan';
    if (/\b(test|quiz|check)\b.*\b(me|my|understanding|knowledge)\b|practice questions|questions (on|about)/.test(m)) return 'test';
    if (/summar|tl;?dr|key (points|ideas)|overview|recap/.test(m)) return 'summarize';
    if (/\bexample|show me|\bcode\b|demonstrat|worked|in practice/.test(m)) return 'example';
    return 'explain';
  }

  /** Drop HTML tags from echoed user text (DOMPurify still sanitises the final HTML). */
  const stripTags = (s) => String(s).replace(/<[^>]*>?/g, ' ').replace(/\s+/g, ' ').trim();

  /** The user's subject, echoed as the answer title (sanitised later by DOMPurify). */
  function topicOf(message, fallback) {
    const t = stripTags(message)
      .replace(/^\s*(please\s+)?(can you\s+|could you\s+)?(explain|summari[sz]e|give me|show me|test my understanding of|test me on|quiz me on|tell me about|what is|what are|how does|how do)\s*/i, '')
      .replace(/^(an?\s+)?(example|examples|summary|overview)\s+(of|for|on)\s+/i, '')
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/\b(simply|in simple terms|for me|please)\b/gi, '')
      .replace(/[?.!\s]+$/, '')
      .trim();
    const out = clip(t || fallback, 90);
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  /** Deterministic shuffle so a regenerate (variant) gives a different but stable answer. */
  function rotate(list, n) { return list.length ? list.slice(n % list.length).concat(list.slice(0, n % list.length)) : list; }

  /* ---- Answer templates ---------------------------------------------------- */
  function explain({ topic, top, qterms, variant, mathy }) {
    const lead = rotate(sentences(top[0].text), variant).slice(0, 2).join(' ');
    const steps = top.map(p => {
      const s = rotate(sentences(p.text), variant).find(x => x.length > 30) || sentences(p.text)[0] || p.heading;
      return `1. **${p.heading}** — ${s} ${cite(p)}`;
    });
    const formula = mathy ? top.flatMap(p => mathBlocks(p.text).map(m => ({ m, p })))[0] : null;
    const takeaway = sentences(top[top.length - 1].text).slice(-1)[0] || '';
    return [
      `### ${topic}`,
      `${variant % 2 ? 'Put simply:' : '**In short:**'} ${lead} ${cite(top[0])}`,
      `**Step by step**`,
      steps.join('\n'),
      formula ? `**The key formula** ${cite(formula.p, { short: true })}\n\n$$${formula.m}$$` : '',
      takeaway ? `> **Remember:** ${takeaway}` : ''
    ].filter(Boolean).join('\n\n');
  }

  function summarizeAnswer({ course, lecture, pages, variant }) {
    const picked = pages.slice(0, 6);
    return {
      content: [
        `### Summary — ${lectureLabel(pages[0])}: ${lecture.title}`,
        `${course.code} · ${pages.length} pages`,
        `**Key points**`,
        rotate(picked, variant).sort((a, b) => a.page - b.page).map(p => `- **${p.heading}** — ${sentences(p.text)[0] || ''} ${cite(p, { short: true })}`).join('\n'),
        `**Takeaway:** ${sentences(pages[pages.length - 1].text)[0] || sentences(pages[0].text)[0]}`
      ].join('\n\n'),
      used: picked
    };
  }

  function exampleAnswer({ topic, top, lecturePages, qterms, variant, mathy }) {
    const pool = [...top, ...lecturePages.filter(p => !top.includes(p))];
    const withCode = pool.filter(p => codeBlocks(p.text).length);
    if (withCode.length) {
      const p = withCode[variant % withCode.length];
      const block = codeBlocks(p.text)[0];
      // A code-only page has no prose: borrow the explanation from the page before it, or the top match
      const neighbour = lecturePages.find(x => x.lectureId === p.lectureId && x.page === p.page - 1);
      const notes = [p, neighbour, top[0]].filter(Boolean).map(x => sentences(x.text)).find(list => list.length) || [];
      return {
        content: [
          `### Example: ${topic}`,
          `Here's how it looks in practice, from ${lectureLabel(p)} — *${p.heading}* ${cite(p, { short: true })}:`,
          '```' + block.lang + '\n' + block.code + '\n```',
          `**What's happening**`,
          notes.slice(0, 3).map(s => `- ${s}`).join('\n'),
          `**Try it:** change one value, predict the result, then run it to check.`
        ].join('\n\n'),
        used: [p]
      };
    }
    const withMath = pool.filter(p => mathBlocks(p.text).length);
    if (mathy && withMath.length) {
      const p = withMath[variant % withMath.length];
      const worked = sentences(p.text).filter(s => /\d/.test(s)).slice(0, 2);
      return {
        content: [
          `### Worked example: ${topic}`,
          `From ${lectureLabel(p)} — *${p.heading}* ${cite(p, { short: true })}:`,
          `$$${mathBlocks(p.text)[0]}$$`,
          (worked.length ? worked : sentences(p.text).slice(0, 2)).map(s => `- ${s}`).join('\n'),
          `**Your turn:** pick your own numbers, work it through by hand, then compare with the formula.`
        ].join('\n\n'),
        used: [p]
      };
    }
    const p = top[0];
    return {
      content: [
        `### Example: ${topic}`,
        `A concrete way to see it, based on ${lectureLabel(p)} ${cite(p, { short: true })}:`,
        sentences(p.text).slice(0, 3).map(s => `- ${s}`).join('\n'),
        `**Scenario:** imagine explaining *${p.heading.toLowerCase()}* to a classmate using one real case from your own work.`
      ].join('\n\n'),
      used: [p]
    };
  }

  function testAnswer({ topic, top, variant }) {
    const qs = top.slice(0, 3).map((p, i) => {
      const all = sentences(p.text);
      const withTerm = all.find(s => /\*\*[^*]+\*\*/.test(s));
      if (withTerm && (i + variant) % 2 === 0) {
        const term = withTerm.match(/\*\*([^*]+)\*\*/)[1];
        const def = definitionOf(withTerm, term);
        return def
          ? { q: `Which term is described here: “${def}”`, a: `**${term}** ${cite(p)}` }
          : { q: `Fill in the blank: “${withTerm.replace(`**${term}**`, '_____').replace(/\*\*/g, '')}”`, a: `**${term}** — ${withTerm.replace(/\*\*/g, '')} ${cite(p)}` };
      }
      return { q: `In your own words, explain **${p.heading.toLowerCase()}**.`, a: `${all.slice(0, 2).join(' ')} ${cite(p)}` };
    });
    return [
      `### Test your understanding: ${topic}`,
      `Answer each question before opening the hidden answer.`,
      qs.map((x, i) => `**${i + 1}.** ${x.q}\n\n<details><summary>Show answer</summary>\n\n${x.a}\n\n</details>`).join('\n\n')
    ].join('\n\n');
  }

  function noMatch({ course, message, lecturePages, scopedLecture }) {
    const titles = [...new Map(lecturePages.map(p => [p.lectureId, p])).values()];
    return [
      `I couldn't find **${clip(stripTags(message), 80)}** in ${scopedLecture ? `*${scopedLecture}*` : `${course.code}'s lectures`}. I only answer from this course's uploaded lectures, so I won't guess.`,
      `**Try asking about:**`,
      titles.slice(0, 6).map(p => `- ${lectureLabel(p)}: ${p.lectureTitle}`).join('\n'),
      `You can also pick a specific lecture above, or ask me to *summarize* one.`
    ].join('\n\n');
  }


  /* ---- Learner context (step 1 helpers) ------------------------------------ */
  const lecLabel = (l) => (l && l.lectureNumber ? `Lecture ${l.lectureNumber}` : `“${clip((l && l.title) || 'this lecture', 32)}”`);
  const rootLink = {
    lecture: (id, page) => `pages/student/lecture.html?id=${encodeURIComponent(id)}${page ? `&page=${page}` : ''}`,
    quiz: (courseId, quizId) => `pages/student/course.html?id=${encodeURIComponent(courseId)}&tab=quizzes&quiz=${encodeURIComponent(quizId)}`,
    progress: (courseId) => `pages/student/course.html?id=${encodeURIComponent(courseId)}&tab=progress`
  };
  /** Root-relative → page-relative (answers render in pages/student/). */
  const rel = (link) => link.replace(/^pages\/student\//, '');
  const pct = (n) => `${Math.round(n)}%`;

  /**
   * Relevant learner facts for a question: only for the lectures/topics the
   * question matched. Returns [{ md, items }] (at most 2). Nothing is added
   * when the learner has no data for that material.
   */
  function learnerNotes({ intent, learner, matched, qterms, course }) {
    const out = [];
    const lectureOf = (id) => learner.lectures.find(l => l.id === id);
    // Most relevant first: the top page's lecture, then a topic-name match, then any matched lecture
    const rank = (w) => (w.lectureId === matched[0] ? 4 : 0) + (terms(w.topic).some(t => qterms.includes(t)) ? 2 : 0) + (matched.includes(w.lectureId) ? 1 : 0);
    const hits = learner.weakTopics
      .filter(w => rank(w) > 0)
      .sort((a, b) => rank(b) - rank(a) || a.averageScore - b.averageScore);
    if (hits.length) {
      const w = hits[0];
      const lec = lectureOf(w.lectureId);
      const scores = w.scores.length > 1 ? `your scores were ${w.scores.map(pct).join(' → ')}` : `you scored **${pct(w.scores[0])}**`;
      const lowest = learner.weakTopics[0] === w;
      out.push({
        md: `**From your quiz results:** on *${w.topic}*${lec ? ` ([${lecLabel(lec)}](${rel(rootLink.lecture(lec.id))}))` : ''} ${scores}${w.scores.length > 1 ? ` (average **${pct(w.averageScore)}**)` : ''} — ${lowest ? `your lowest topic in ${learner.code}` : 'below the 65% revision mark'}. This answer focuses on that material${intent === 'test' ? '' : '; ask me to *test your understanding* when you’re ready to try again'}.`,
        items: w.quizIds.map((id, i) => ({ type: 'quiz', label: `Quiz: ${w.quizTitles[i]} (${pct(w.scores[i])})`, link: rootLink.quiz(learner.courseId, id), ref: { quizId: id } }))
      });
    }
    if (!out.length) {
      for (const id of matched.slice(0, 2)) {
        const lec = lectureOf(id);
        if (!lec || lec.status !== 'ready') continue;
        const waiting = learner.unstartedQuizzes.find(q => q.lectureId === id);
        if (!lec.attempts.length && (intent === 'test' || waiting)) {
          out.push({
            md: `**From your progress:** you haven’t taken a quiz on ${lecLabel(lec)} yet${waiting ? `, and “${waiting.title}” is waiting for you ([open it](${rel(rootLink.quiz(learner.courseId, waiting.id))}))` : ''}.`,
            items: [
              { type: 'progress', label: `${lecLabel(lec)}: not quizzed yet`, link: rootLink.lecture(lec.id), ref: { lectureId: lec.id } },
              ...(waiting ? [{ type: 'quiz', label: `Quiz waiting: ${waiting.title}`, link: rootLink.quiz(learner.courseId, waiting.id), ref: { quizId: waiting.id } }] : [])
            ]
          });
          break;
        }
        if (lec.attempts.length && intent === 'test') {
          const last = lec.attempts[lec.attempts.length - 1];
          out.push({
            md: `**From your quiz results:** last time you scored **${pct(last.score)}** on “${last.title}”${last.score >= 80 ? ' — these questions go a step further' : ''}.`,
            items: [{ type: 'quiz', label: `Quiz: ${last.title} (${pct(last.score)})`, link: rootLink.quiz(learner.courseId, last.quizId), ref: { quizId: last.quizId } }]
          });
          break;
        }
      }
    }
    return out.slice(0, 2);
  }

  /** "What should I study?" — built from weak topics, un-quizzed lectures and waiting quizzes. */
  function planAnswer(ctx) {
    const { learner, top, course } = ctx;
    const steps = [];
    const items = [{ type: 'progress', label: `Progress ${pct(learner.progress)} · mastery ${learner.mastery == null ? '—' : pct(learner.mastery)}`, link: rootLink.progress(learner.courseId), ref: { courseId: learner.courseId } }];
    const lectureOf = (id) => learner.lectures.find(l => l.id === id);
    learner.weakTopics.slice(0, 2).forEach((w, i) => {
      const lec = lectureOf(w.lectureId);
      const page = i === 0 ? top.find(p => p.lectureId === w.lectureId) : null;
      steps.push(`**Revise ${w.topic}** — ${w.scores.length > 1 ? `your scores were ${w.scores.map(pct).join(' → ')}, averaging` : 'you scored'} **${pct(w.averageScore)}**${lec ? ` (${lecLabel(lec)}: ${lec.title})` : ''}.` +
        (page ? ` Start with *${page.heading}* ([${lecLabel(lec)}, p. ${page.page}](${rel(rootLink.lecture(page.lectureId, page.page))})), then ask me to test you again.` : ''));
      items.push({ type: 'topic', label: `Weak topic: ${w.topic} (${pct(w.averageScore)})`, link: rootLink.progress(learner.courseId), ref: { lectureId: w.lectureId } });
    });
    learner.unquizzedLectures.slice(0, 2).forEach(l => {
      steps.push(`**Take a first quiz on ${lecLabel(l)}: ${l.title}** — it’s ready but you haven’t been tested on it yet ([open the lecture](${rel(rootLink.lecture(l.id))})).`);
      items.push({ type: 'progress', label: `${lecLabel(l)}: not quizzed yet`, link: rootLink.lecture(l.id), ref: { lectureId: l.id } });
    });
    learner.unstartedQuizzes.filter(q => !learner.unquizzedLectures.some(l => l.id === q.lectureId)).slice(0, 1).forEach(q => {
      steps.push(`**Finish “${q.title}”** — it’s waiting in Quizzes ([open it](${rel(rootLink.quiz(learner.courseId, q.id))})).`);
      items.push({ type: 'quiz', label: `Quiz waiting: ${q.title}`, link: rootLink.quiz(learner.courseId, q.id), ref: { quizId: q.id } });
    });
    const head = `**Progress ${pct(learner.progress)}** (${learner.attemptedLectureCount} of ${learner.readyLectureCount} lectures quizzed) · **Mastery ${learner.mastery == null ? '—' : pct(learner.mastery)}**`;
    const content = [
      `### Your study plan for ${course.code}`,
      `Based on your quiz results and the lectures in ${course.code}:`,
      head,
      steps.length ? `**Start here**\n\n${steps.slice(0, 4).map((x, i) => `${i + 1}. ${x}`).join('\n')}`
        : `You’re in good shape: every ready lecture has been quizzed and every topic is at 65% or more. Ask me to *test your understanding* of your latest lecture to stay sharp.`
    ].join('\n\n');
    const sources = top.slice(0, 1).map(p => toSource(p, terms(learner.weakTopics[0] ? learner.weakTopics[0].topic : '')));
    return { intent: 'plan', content, sources, context: contextItems(top.slice(0, 1), items) };
  }

  /** "Used:" chips — lecture pages first, then learner data; de-duplicated. */
  function contextItems(pagesUsed, learnerItems) {
    const seen = new Set();
    return [
      ...pagesUsed.map(p => ({ type: 'lecture', label: `${lectureLabel(p)} p.${p.page}`, link: rootLink.lecture(p.lectureId, p.page), ref: { lectureId: p.lectureId } })),
      ...learnerItems
    ].filter(i => !seen.has(i.link + i.label) && seen.add(i.link + i.label)).slice(0, 7);
  }

  /* ---- Public API ----------------------------------------------------------- */
  const mockAI = {
    detectIntent, terms, retrieve,

    /**
     * Answer a chat message from the given pages only.
     * → { content, sources: [{ lectureId, page, snippet }], intent }
     */
    /**
     * Step 1 — context. Retrieves pages from the given (single-course) pages
     * and picks the learner facts that are relevant to this message.
     */
    buildContext({ course, pages, message, history = [], lectureId = null, learner = null }) {
      let intent = detectIntent(message);
      let qterms = terms(message);
      if (qterms.length < 2) {
        const prev = [...history].reverse().find(m => m.role === 'user' && m.content !== message);
        if (prev) qterms = qterms.concat(terms(prev.content));
      }
      const byLecture = (id) => pages.filter(p => p.lectureId === id).sort((a, b) => a.page - b.page);
      if (intent === 'plan' && !learner) intent = 'explain';

      let top = [], target = null;
      if (!pages.length) {
        top = [];
      } else if (intent === 'plan') {
        const w = learner.weakTopics[0];
        const focusId = (w && w.lectureId) || (learner.unquizzedLectures[0] || {}).id || null;
        const focusPages = focusId ? byLecture(focusId) : [];
        top = (w ? retrieve(focusPages, terms(w.topic), 2) : []);
        if (!top.length) top = focusPages.slice(0, 1);
      } else if (intent === 'summarize') {
        target = lectureId || (retrieve(pages, qterms, 1)[0] || {}).lectureId || pages[pages.length - 1].lectureId;
        top = byLecture(target);
      } else {
        top = retrieve(pages, qterms, 3);
      }
      const matched = [...new Set(top.map(p => p.lectureId))];
      const notes = learner && intent !== 'plan' && top.length ? learnerNotes({ intent, learner, matched, qterms, course }) : [];
      return { course, message, history, intent, qterms, pages, top, target, lectureId, learner, notes, mathy: pages.some(p => /\$\$/.test(p.text)), byLecture };
    },

    /**
     * Step 2 — response. Builds the Markdown answer from the context, cites
     * lecture pages and weaves in learner notes. Returns the context items
     * used, for the "Used:" chips: [{ type, label, link, ref }].
     */
    respond(ctx, { variant = 0 } = {}) {
      const { course, message, intent, qterms, pages, lectureId, notes, mathy, byLecture } = ctx;
      let { top } = ctx;
      if (!pages.length) {
        return { intent: 'none', sources: [], context: [], content: `There are no ready lectures to read in ${course.code} yet. Upload a lecture and I'll answer from it.` };
      }
      if (intent === 'plan') return planAnswer(ctx);

      let content, used;
      if (intent === 'summarize') {
        const r = summarizeAnswer({ course, lecture: { title: top[0].lectureTitle }, pages: top, variant });
        content = r.content; used = r.used.slice(0, 3);
      } else if (!top.length) {
        return { intent, sources: [], context: [], content: noMatch({ course, message, lecturePages: pages, scopedLecture: lectureId ? pages[0].lectureTitle : null }) };
      } else {
        top = variant ? rotate(top, variant) : top;
        const topic = topicOf(message, top[0].heading);
        if (intent === 'example') {
          const r = exampleAnswer({ topic, top, lecturePages: byLecture(top[0].lectureId), qterms, variant, mathy });
          content = r.content; used = r.used;
        } else if (intent === 'test') {
          content = testAnswer({ topic, top, variant }); used = top;
        } else {
          content = explain({ topic, top, qterms, variant, mathy }); used = top;
        }
      }
      if (notes.length) {
        const lines = content.split('\n');
        content = [lines[0], '', ...notes.map(n => n.md + '\n'), ...lines.slice(1)].join('\n');
      }
      const sources = used.map(p => toSource(p, qterms));
      return { intent, content, sources, context: contextItems(used, notes.flatMap(n => n.items)) };
    },

    /** Convenience: context + response in one call. */
    chat(args) {
      return mockAI.respond(mockAI.buildContext(args), { variant: args.variant || 0 });
    },

    /** Lecture summary. → { content, sources } */
    summarize({ course, lecture, pages }) {
      const { content, used } = summarizeAnswer({ course, lecture, pages, variant: 0 });
      return { content, sources: used.map(p => toSource(p, [])) };
    },

    /** Study notes as a Markdown document (downloadable). → { content, sources } */
    studyNotes({ course, lecture, pages }) {
      const seen = new Set();
      const keyTerms = [];
      pages.forEach(p => sentences(p.text).forEach(s => {
        boldTerms(s).forEach(term => {
          const k = term.toLowerCase();
          if (seen.has(k) || keyTerms.length >= 10) return;
          seen.add(k);
          keyTerms.push(`- **${term}** — ${clip(s.replace(/\*\*/g, ''), 180)} ${cite(p, { short: true })}`);
        });
      }));
      const sectionsMd = pages.map(p => {
        const parts = [`### ${p.page}. ${p.heading}`, sentences(p.text).slice(0, 3).map(s => `- ${s}`).join('\n')];
        const math = mathBlocks(p.text)[0];
        if (math) parts.push(`$$${math}$$`);
        const code = codeBlocks(p.text)[0];
        if (code) parts.push('```' + code.lang + '\n' + code.code + '\n```');
        parts.push(`<sub>Source: ${cite(p, { short: true }).slice(1, -1)}</sub>`);
        return parts.join('\n\n');
      }).join('\n\n');
      const content = [
        `# ${lecture.title} — study notes`,
        `*${course.code} · ${lectureLabel(pages[0])} · ${pages.length} pages · generated by TutorAI (demo)*`,
        keyTerms.length ? `## Key terms\n\n${keyTerms.join('\n')}` : '',
        `## Page by page`,
        sectionsMd,
        `## Check yourself`,
        pages.slice(0, 5).map((p, i) => `${i + 1}. Can you explain *${p.heading.toLowerCase()}* without your notes?`).join('\n')
      ].filter(Boolean).join('\n\n');
      return { content, sources: pages.map(p => toSource(p, [])) };
    },

    /**
     * THE quiz generator (stage 5) — used by the quiz builder, "Describe it",
     * practise-weak-topics, the lecture workspace and the AI Tutor.
     * pages: ONLY the chosen course's (and lectures') pages.
     *   types: subset of ['mcq','multi','true_false','short']
     *   difficulty: 'easy'|'medium'|'hard'|'mixed'
     *   focusTerms: rank matching pages first ("joins and indexing")
     *   priorityPages: [{ lectureId, page }] used first (missed questions)
     *   exclude: prompts already in the quiz (for Swap)
     *   topicOf(lectureId): topic tag for questions
     * → { questions: [{ type, prompt, options, correct, explanation, lectureId, page, topic, difficulty }], short: n }
     *   (ids are assigned by the API). `short` = how many fewer than asked.
     */
    generateQuestions({ pages, count = 10, difficulty = 'medium', types = ['mcq'], focusTerms = [], priorityPages = [], exclude = [], topicOf = () => null, seed = Date.now() }) {
      let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
      const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const kinds = types.filter(t => ['mcq', 'multi', 'true_false', 'short'].includes(t));
      if (!pages.length || !kinds.length) return { questions: [], short: count };

      const facts = pages.map(p => ({
        p,
        sents: sentences(p.text).filter(x => x.split(' ').length >= 5 && !/^Demo content/i.test(x.replace(/\*\*/g, ''))),
        terms: [...new Set(boldTerms(p.text))].filter(t => t.length <= 40)
      })).filter(f => f.sents.length);
      if (!facts.length) return { questions: [], short: count };
      const allTerms = [...new Set(facts.flatMap(f => f.terms))];
      const key = (f) => `${f.p.lectureId}|${f.p.page}`;

      // Page order: priority (missed) pages, then focus matches, then round-robin across lectures
      const focus = focusTerms.length ? retrieve(pages, focusTerms, pages.length).map(p => `${p.lectureId}|${p.page}`) : [];
      const prio = priorityPages.map(x => `${x.lectureId}|${x.page}`);
      const byLecture = {};
      shuffle(facts).forEach(f => { (byLecture[f.p.lectureId] = byLecture[f.p.lectureId] || []).push(f); });
      const rr = [];
      const queues = Object.values(byLecture);
      for (let i = 0; rr.length < facts.length; i++) queues.forEach(q => { if (q[i]) rr.push(q[i]); });
      const rank = (f) => (prio.includes(key(f)) ? 0 : focus.includes(key(f)) ? 1 : 2);
      let order = rr.slice().sort((a, b) => rank(a) - rank(b));
      if (focus.length) {
        // with a focus, stay on matching pages (cycled) unless there are too few
        const matched = order.filter(f => rank(f) < 2);
        if (matched.length >= Math.min(3, count)) order = matched;
      }

      const levels = ['easy', 'medium', 'hard'];
      const seen = new Set(exclude.map(x => String(x)));
      const out = [];
      const plainS = (x) => clip(plain(x), 180);
      const others = (f) => shuffle(facts.filter(o => o !== f && o.p.heading !== f.p.heading));

      const build = (type, f, lvl, round) => {
        const sent = f.sents[(round + Math.floor(rand() * f.sents.length)) % f.sents.length];
        const base = { lectureId: f.p.lectureId, page: f.p.page, topic: topicOf(f.p.lectureId) || f.p.lectureTitle, difficulty: lvl };
        const src = `${lectureLabel(f.p)}, p. ${f.p.page} — *${f.p.heading}*`;
        if (type === 'mcq') {
          const clozeSent = f.sents.find((x, i) => i >= round % f.sents.length && f.terms.some(t => x.includes(`**${t}**`))) || f.sents.find(x => f.terms.some(t => x.includes(`**${t}**`)));
          if (lvl !== 'easy' && clozeSent && allTerms.length >= 4) {
            const term = f.terms.find(t => clozeSent.includes(`**${t}**`));
            const def = definitionOf(clozeSent, term);
            const opts = shuffle([term, ...shuffle(allTerms.filter(t => t.toLowerCase() !== term.toLowerCase())).slice(0, 3)]);
            return { ...base, type, prompt: def ? `Which term matches this description: “${clip(def, 220)}”?` : `Fill in the blank: “${clip(clozeSent.replace(`**${term}**`, '_____').replace(/\*\*/g, ''), 220)}”`,
              options: opts.map((t, i) => ({ id: 'abcd'[i], text: t })), correct: ['abcd'[opts.indexOf(term)]],
              explanation: `${clozeSent} (${src})` };
          }
          const wrong = others(f).slice(0, 3).map(o => plainS(o.sents[Math.floor(rand() * o.sents.length)]));
          if (wrong.length < 3) return null;
          const right = plainS(sent);
          const opts = shuffle([right, ...wrong]);
          return { ...base, type, prompt: `Which statement comes from the section “${f.p.heading}”?`,
            options: opts.map((t, i) => ({ id: 'abcd'[i], text: t })), correct: ['abcd'[opts.indexOf(right)]],
            explanation: `“${f.p.heading}” says: ${sent} (${src})` };
        }
        if (type === 'multi') {
          if (f.sents.length < 2) return null;
          const rights = shuffle(f.sents).slice(0, lvl === 'easy' ? 1 : 2).map(plainS);
          const wrongs = others(f).slice(0, 4 - rights.length).map(o => plainS(o.sents[Math.floor(rand() * o.sents.length)]));
          if (rights.length + wrongs.length < 4) return null;
          const opts = shuffle([...rights, ...wrongs]);
          return { ...base, type, prompt: `Which of these statements come from “${f.p.heading}”? Select all that apply.`,
            options: opts.map((t, i) => ({ id: 'abcd'[i], text: t })), correct: rights.map(r => 'abcd'[opts.indexOf(r)]),
            explanation: `From ${src}: ${rights.map(r => `“${r}”`).join(' and ')}.` };
        }
        if (type === 'true_false') {
          const withTerm = f.sents.filter(x => f.terms.some(t => x.includes(`**${t}**`)));
          const makeFalse = (lvl !== 'easy' && withTerm.length && allTerms.length >= 2 && rand() < 0.55);
          if (makeFalse) {
            const x = withTerm[round % withTerm.length];
            const term = f.terms.find(t => x.includes(`**${t}**`));
            const swap = shuffle(allTerms.filter(t => t.toLowerCase() !== term.toLowerCase()))[0];
            return { ...base, type, prompt: `True or false: “${clip(x.replace(`**${term}**`, swap).replace(/\*\*/g, ''), 240)}”`,
              options: [{ id: 't', text: 'True' }, { id: 'f', text: 'False' }], correct: ['f'],
              explanation: `False — the lecture says: ${x} (${src})` };
          }
          return { ...base, type, prompt: `True or false: “${plainS(sent)}”`,
            options: [{ id: 't', text: 'True' }, { id: 'f', text: 'False' }], correct: ['t'],
            explanation: `True — ${src}.` };
        }
        if (type === 'short') {
          const kw = [...new Set([...f.terms.map(t => t.toLowerCase()), ...terms(f.p.heading).filter(w => w.length >= 4)])].slice(0, 5);
          if (kw.length < 2) kw.push(...terms(f.sents.join(' ')).filter(w => w.length >= 5 && !kw.includes(w)).slice(0, 3 - kw.length));
          return { ...base, type, prompt: `In your own words, explain **${f.p.heading.toLowerCase()}**.`,
            options: [], correct: { model: f.sents.slice(0, 2).join(' '), keywords: kw.slice(0, 5) },
            explanation: `A strong answer mentions: ${kw.slice(0, 5).map(k => `**${k}**`).join(', ')}. (${src})` };
        }
        return null;
      };

      for (let i = 0; out.length < count && i < count * 8; i++) {
        const f = order[i % order.length];
        const round = Math.floor(i / order.length);
        const type = kinds[(out.length + round) % kinds.length];
        const lvl = difficulty === 'mixed' ? levels[out.length % 3] : difficulty;
        const q = build(type, f, lvl, round) || build('true_false', f, lvl, round);
        if (q && !seen.has(q.prompt)) { seen.add(q.prompt); out.push(q); }
      }
      return { questions: out, short: Math.max(0, count - out.length) };
    },

    /**
     * "Quiz me on joins and indexing, 10 hard questions" → builder settings.
     * courses: [{ id, code, title, lectures: [{ id, title, topic }], pages }]
     * → { courseId, lectureIds, count, difficulty, types, focusTerms, understood: [..] }
     */
    parseQuizRequest(text, courses, { defaultCourseId = null } = {}) {
      const t = String(text || '').toLowerCase();
      const understood = [];
      const words = { five: 5, ten: 10, fifteen: 15, twenty: 20 };
      const n = (t.match(/\b(\d{1,2})\b/) || [])[1] || Object.keys(words).find(w => t.includes(w));
      let count = n ? (words[n] || parseInt(n, 10)) : 10;
      count = [5, 10, 15, 20].reduce((best, c) => (Math.abs(c - count) < Math.abs(best - count) ? c : best), 10);
      if (n) understood.push(`${count} questions`);
      const difficulty = /\bmix(ed)?\b|variety/.test(t) ? 'mixed' : /\bhard|difficult|challeng|tough/.test(t) ? 'hard' : /\beasy|simple|basic|beginner/.test(t) ? 'easy' : /\bmedium|moderate/.test(t) ? 'medium' : 'medium';
      if (/mix|hard|difficult|challeng|tough|easy|simple|basic|beginner|medium|moderate/.test(t)) understood.push(difficulty);
      const types = [];
      if (/multiple choice|\bmcq/.test(t)) types.push('mcq');
      if (/multiple select|select all|checkbox|multi-select/.test(t)) types.push('multi');
      if (/true\s*(\/|or)\s*false|\bt\/f\b/.test(t)) types.push('true_false');
      if (/short answer|written|open[- ]ended|explain in/.test(t)) types.push('short');
      if (types.length) understood.push(types.map(x => ({ mcq: 'multiple choice', multi: 'multiple select', true_false: 'true/false', short: 'short answer' }[x])).join(', '));

      const STOPQ = new Set(['quiz', 'question', 'questions', 'hard', 'easy', 'medium', 'mixed', 'difficult', 'choice', 'multiple', 'select', 'true', 'false', 'short', 'answer', 'give', 'make', 'create', 'about', 'some', 'with', 'five', 'ten', 'fifteen', 'twenty', 'practice', 'practise']);
      const focusTerms = terms(text).filter(w => !STOPQ.has(w) && !/^\d+$/.test(w));
      const scored = courses.map(c => {
        const code = c.code.toLowerCase();
        let score = t.includes(code) || t.includes(code.replace(/\s+/g, '')) || (code.split(' ')[1] && t.includes(code.split(' ')[1])) ? 10 : 0;
        terms(c.title).forEach(w => { if (focusTerms.includes(w)) score += 3; });
        score += retrieve(c.pages, focusTerms, 3).length;
        return { c, score };
      }).sort((a, b) => b.score - a.score);
      const pick = scored[0] && scored[0].score > 0 ? scored[0].c : courses.find(c => c.id === defaultCourseId) || null;
      // Readable topic for the quiz title: "Quiz me on joins and indexing, 10 hard questions" → "Joins and indexing"
      const label = (() => {
        const t2 = String(text || '').replace(/^\s*(please\s+)?(can you\s+)?(quiz me on|quiz me about|make (me )?a quiz (on|about)|create a quiz (on|about)|give me a quiz (on|about)|test me on|quiz on|practice quiz on|practise quiz on)\s*/i, '')
          .replace(/[,.;]?\s*(\d+|five|ten|fifteen|twenty)\b.*$/i, '').replace(/\b(easy|medium|hard|mixed)\b.*$/i, '').replace(/[,.;\s]+$/, '').replace(/\s+(with|in|using|and|of|for|on|about)$/i, '').trim();
        return t2 && t2.length <= 60 ? t2.charAt(0).toUpperCase() + t2.slice(1) : '';
      })();
      if (!pick) return { courseId: null, lectureIds: [], count, difficulty, types: types.length ? types : ['mcq', 'true_false'], focusTerms, understood, label };
      if (scored[0] && scored[0].score > 0) understood.unshift(pick.code);
      const hits = focusTerms.length ? retrieve(pick.pages, focusTerms, pick.pages.length) : [];
      const lectureIds = hits.length ? [...new Set(hits.map(p => p.lectureId))] : pick.lectures.map(l => l.id);
      if (hits.length) understood.push(`${lectureIds.length} matching lecture${lectureIds.length === 1 ? '' : 's'}`);
      return { courseId: pick.id, lectureIds, count, difficulty, types: types.length ? types : ['mcq', 'multi', 'true_false'], focusTerms: hits.length ? focusTerms : [], understood, label, courseCode: pick.code };
    },

    /** Is this chat message asking for a quiz (→ make one and link the preview)? */
    isQuizRequest(message) {
      return /\b(quiz me|make (me )?a quiz|generate (a )?quiz|create (a )?quiz|give me a quiz|practice quiz on|practise quiz on)\b/i.test(String(message));
    },

    /**
     * Dev check for course isolation. Throws if any source is not one of
     * the allowed (selected course's) lecture ids.
     */
    assertCourseIsolation(sources, allowedLectureIds, courseCode = '', { context = [], allowedQuizIds = null, courseId = null } = {}) {
      const allowed = new Set(allowedLectureIds);
      const leak = (sources || []).find(src => !allowed.has(src.lectureId));
      if (leak) {
        throw new Error(`[TutorAI dev] Course isolation violated: source ${leak.lectureId} p.${leak.page} is not in ${courseCode || 'the selected course'}.`);
      }
      const quizzes = allowedQuizIds ? new Set(allowedQuizIds) : null;
      const bad = (context || []).find(c => {
        const r = c.ref || {};
        return (r.lectureId && !allowed.has(r.lectureId)) || (r.quizId && quizzes && !quizzes.has(r.quizId)) || (r.courseId && courseId && r.courseId !== courseId);
      });
      if (bad) throw new Error(`[TutorAI dev] Course isolation violated: context “${bad.label}” is not from ${courseCode || 'the selected course'}.`);
      return true;
    }
  };

  T.mockAI = mockAI;
  mockAI.learnerNotes = learnerNotes;
})(window.TutorAI = window.TutorAI || {});
