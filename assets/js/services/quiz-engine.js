/**
 * TutorAI — quiz engine (pure functions, no storage, no network)
 * ------------------------------------------------------------------
 * Shared by api.js (mock backend) and, later, mirrored by PHP:
 *   sanitizeQuestion  strip everything that reveals an answer
 *   gradeQuestion     score one answer against the stored correct answer
 *   gradeAttempt      score a whole attempt
 *   lectureStats / topicStats   per-lecture and per-topic results from
 *                               graded attempts (progress, mastery, bands)
 *
 * Answer values
 *   mcq, true_false  'optionId'
 *   multi            ['optionId', …]   (all-or-nothing)
 *   short            'free text'       (keyword grading, partial credit)
 *
 * Short-answer grading (demo stand-in for AI marking):
 *   required = min(3, keywords.length)
 *   matched  = keywords found in the answer (case-insensitive, simple stems)
 *   points   = 1 if matched ≥ required, 0.5 if matched ≥ required / 2, else 0
 *
 * Bands (one definition used everywhere):
 *   strong ≥ 80 · okay 65–79 · revise < 65
 */
(function (T) {
  'use strict';

  const BANDS = Object.freeze({ strong: 80, okay: 65 });
  const band = (pct) => (pct == null ? null : pct >= BANDS.strong ? 'strong' : pct >= BANDS.okay ? 'okay' : 'revise');
  const SHORT_MAX = 600;

  /** Deterministic shuffle (seeded), so a retry's order survives reloads. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(list, seed) {
    let s = (typeof seed === 'number' ? seed : hash(String(seed))) % 2147483647 || 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /**
   * The only question shape ever sent before submission: no `correct`,
   * no `explanation`, no model answer or keywords.
   */
  function sanitizeQuestion(q, { optionSeed = null } = {}) {
    const options = (q.options || []).map(o => ({ id: o.id, text: o.text }));
    return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: optionSeed && (q.type === 'mcq' || q.type === 'multi') ? shuffle(options, `${optionSeed}:${q.id}`) : options,
      lectureId: q.lectureId,
      page: q.page,
      topic: q.topic,
      difficulty: q.difficulty,
      ...(q.type === 'short' ? { maxLength: SHORT_MAX } : {})
    };
  }

  const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '');
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

  function isAnswered(q, value) {
    if (q.type === 'multi') return Array.isArray(value) && value.length > 0;
    if (q.type === 'short') return typeof value === 'string' && value.trim().length > 0;
    return typeof value === 'string' && value.length > 0;
  }

  /** → { questionId, answered, correct, points (0 | 0.5 | 1), feedback? } */
  function gradeQuestion(q, value) {
    const answered = isAnswered(q, value);
    const base = { questionId: q.id, answered };
    if (!answered) return { ...base, correct: false, points: 0, ...(q.type === 'short' ? { feedback: { matched: [], missing: q.correct.keywords.slice(), required: Math.min(3, q.correct.keywords.length) } } : {}) };

    if (q.type === 'short') {
      const answerStems = new Set(words(value).map(stem));
      const answerText = ` ${words(value).join(' ')} `;
      const kws = q.correct.keywords || [];
      const matched = kws.filter(k => {
        const kw = words(k);
        return kw.length > 1 ? answerText.includes(` ${kw.join(' ')} `) || kw.every(w => answerStems.has(stem(w))) : answerStems.has(stem(kw[0] || ''));
      });
      const required = Math.max(1, Math.min(3, kws.length));
      const points = matched.length >= required ? 1 : matched.length >= required / 2 ? 0.5 : 0;
      return { ...base, correct: points === 1, points, feedback: { matched, missing: kws.filter(k => !matched.includes(k)), required } };
    }
    if (q.type === 'multi') {
      const want = [...q.correct].sort().join('|');
      const got = [...new Set(value)].sort().join('|');
      return { ...base, correct: want === got, points: want === got ? 1 : 0 };
    }
    const ok = q.correct.includes(value);
    return { ...base, correct: ok, points: ok ? 1 : 0 };
  }

  /** → { perQuestion, score, total, percent } (score may include halves) */
  function gradeAttempt(questions, answers = {}) {
    const perQuestion = questions.map(q => gradeQuestion(q, answers[q.id]));
    const score = perQuestion.reduce((s, r) => s + r.points, 0);
    const total = questions.length;
    return { perQuestion, score, total, percent: total ? Math.round((score / total) * 100) : 0 };
  }

  /**
   * Per-lecture results from submitted attempts. Each question credits its
   * own lectureId, so a quiz spanning two lectures scores each separately.
   * attempts: [{ id, quizId, submittedAt, perQuestion }]; questionById: Map
   * → Map lectureId → [{ attemptId, quizId, percent, points, total, submittedAt }] (oldest first)
   */
  function groupStats(attempts, questionById, keyOf) {
    const out = new Map();
    attempts.slice().sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).forEach(att => {
      const acc = new Map();
      (att.perQuestion || []).forEach(r => {
        const q = questionById.get(r.questionId);
        if (!q) return;
        const key = keyOf(q);
        if (!key) return;
        const g = acc.get(key) || { points: 0, total: 0 };
        g.points += r.points; g.total += 1;
        acc.set(key, g);
      });
      acc.forEach((g, key) => {
        const list = out.get(key) || [];
        list.push({ attemptId: att.id, quizId: att.quizId, percent: Math.round((g.points / g.total) * 100), points: g.points, total: g.total, submittedAt: att.submittedAt });
        out.set(key, list);
      });
    });
    return out;
  }
  const lectureStats = (attempts, questionById) => groupStats(attempts, questionById, q => q.lectureId);
  const topicStats = (attempts, questionById) => groupStats(attempts, questionById, q => q.topic);

  /** Rough time: seconds per question type. */
  const SECONDS = { mcq: 45, multi: 60, true_false: 20, short: 90 };
  function estimateMinutes(count, types) {
    const list = (types && types.length ? types : ['mcq']);
    const per = list.reduce((s, t) => s + (SECONDS[t] || 45), 0) / list.length;
    return Math.max(1, Math.round((count * per) / 60));
  }

  T.quizEngine = { BANDS, band, SHORT_MAX, shuffle, hash, sanitizeQuestion, isAnswered, gradeQuestion, gradeAttempt, lectureStats, topicStats, estimateMinutes, TYPES: ['mcq', 'multi', 'true_false', 'short'] };
})(window.TutorAI = window.TutorAI || {});
