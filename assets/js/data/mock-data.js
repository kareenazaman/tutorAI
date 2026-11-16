/**
 * TutorAI — mock SEED data
 * ------------------------------------------------------------------
 * Stand-in for the MySQL database until the PHP API exists.
 * This file is only the starting point: api.js copies it into a mock
 * store on first load and from then on reads and writes the store in
 * localStorage ("tai.mockdb.v1"). TutorAI.api.dev.resetMockData()
 * goes back to this seed.
 *
 * Pages must NEVER read this file directly — always go through
 * TutorAI.api so swapping to real endpoints is a one-line config change.
 *
 * Conventions (mirror these in the database and API responses)
 *   • IDs are prefixed strings:   usr_1001, crs_2001, lec_3001,
 *                                 qz_4001, ntf_5001, act_7001
 *     The prefix tells you the entity; the number maps to the MySQL
 *     auto-increment primary key (users.id = 1001 → "usr_1001").
 *   • Field names are camelCase in JS. The PHP layer converts
 *     snake_case columns (first_name → firstName) before responding.
 *   • Dates are ISO-8601 strings in UTC.
 *   • Foreign keys end in Id:  courseId, userId, lectureId.
 *   • Enum values are lowercase strings: 'active' | 'archived',
 *     'uploading' | 'ready' … users.role is always 'student' (kept for
 *     future use; TutorAI has no other account type).
 *   • Calculated fields (course.lectureCount, course.progress) are
 *     never stored; the API adds them to each response.
 */
(function (T) {
  'use strict';

  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString();
  /** A local time `days` ago at `hour`:00 (keeps seeded streaks on real calendar days). */
  const daysAgo = (days, hour = 14) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  T.mockData = {
    users: [
      {
        id: 'usr_1001',
        role: 'student',
        firstName: 'Maya',
        lastName: 'Chen',
        email: 'maya.chen@university.ca',
        institution: 'Thompson Rivers University',
        program: 'BSc Computer Science',
        yearOfStudy: 3,
        avatarUrl: null,
        avatarColor: 'lavender',
        bio: '',
        createdAt: '2026-09-02T16:00:00Z',
        lastLoginAt: ago(60 * 19),
        status: 'active'
      }
    ],

    /**
     * Demo authentication fixtures (mock mode only).
     * The real backend checks password_hash() values in MySQL. This block
     * is never copied into the mock store or any browser storage.
     */
    auth: {
      demoPassword: 'Practise2026!',          // works for every mock user
      validResetToken: 'demo',                 // reset-password.html?token=demo
      takenEmails: ['taken@tutorai.app']       // always "already registered"
    },

    /** The demo student. Seeded quizzes, attempts, chats and activity belong to this account. */
    demoUserId: 'usr_1001',

    /**
     * Who is signed in (mock stand-in for the PHP session). A fresh store
     * starts signed out; signing in sets userId, signing out clears it.
     * Holds only an id — never a password or token.
     */
    session: {
      userId: null
    },

    /** courses — owned by a student (courses.user_id) */
    courses: [
      {
        id: 'crs_2001', userId: 'usr_1001', code: 'COMP 3610', title: 'Advanced Web Programming',
        instructor: 'Dr. Priya Raman', term: 'Fall 2026', color: 'lavender', status: 'active',
        description: 'Server-side web development with PHP and MySQL: HTTP, REST APIs, sessions, authentication and deployment.',
        createdAt: '2026-09-04T17:00:00Z', lastAccessedAt: ago(40)
      },
      {
        id: 'crs_2002', userId: 'usr_1001', code: 'COMP 3410', title: 'Database Systems',
        instructor: 'Prof. Alan Moore', term: 'Fall 2026', color: 'powder', status: 'active',
        description: 'Relational modelling, SQL, normalization, transactions and indexing.',
        createdAt: '2026-09-04T17:05:00Z', lastAccessedAt: daysAgo(1, 19)
      },
      {
        id: 'crs_2003', userId: 'usr_1001', code: 'COMP 3520', title: 'Machine Learning',
        instructor: 'Dr. Sofia Lindqvist', term: 'Fall 2026', color: 'sage', status: 'active',
        description: 'Supervised learning, regression, optimisation with gradient descent and model evaluation.',
        createdAt: '2026-09-05T17:00:00Z', lastAccessedAt: daysAgo(2, 16)
      },
      {
        id: 'crs_2004', userId: 'usr_1001', code: 'STAT 2000', title: 'Probability & Statistics',
        instructor: 'Dr. Kenji Watanabe', term: 'Fall 2026', color: 'butter', status: 'active',
        description: 'Probability rules, random variables, distributions and an introduction to inference.',
        createdAt: '2026-09-06T17:00:00Z', lastAccessedAt: daysAgo(5, 11)
      },
      {
        id: 'crs_2005', userId: 'usr_1001', code: 'COMP 2680', title: 'Web Site Design',
        instructor: 'Ms. Hannah Brooks', term: 'Winter 2026', color: 'peach', status: 'archived',
        description: 'HTML, CSS and accessible, responsive layout.',
        createdAt: '2026-01-08T17:00:00Z', lastAccessedAt: daysAgo(190, 10)
      }
    ],

    /**
     * lectures — one uploaded PDF each.
     * status: 'uploading' | 'extracting' | 'processing' | 'ready' | 'failed'
     */
    lectures: [
      { id: 'lec_3001', courseId: 'crs_2001', title: 'Introduction to the web platform', lectureNumber: 1, description: 'Clients, servers, URLs and the request/response cycle.', fileName: 'COMP3610-L01-web-platform.pdf', fileSizeKb: 1320, pageCount: 7, status: 'ready', uploadedAt: daysAgo(70, 10) },
      { id: 'lec_3002', courseId: 'crs_2001', title: 'HTTP & REST fundamentals',          lectureNumber: 2, description: 'Methods, status codes, headers and resource design.',      fileName: 'COMP3610-L02-http-rest.pdf',     fileSizeKb: 2210, pageCount: 8, status: 'ready', uploadedAt: daysAgo(63, 10) },
      { id: 'lec_3003', courseId: 'crs_2001', title: 'PHP sessions & authentication',     lectureNumber: 3, description: '',                                                          fileName: 'COMP3610-L03-sessions.pdf',      fileSizeKb: 1640, pageCount: 8, status: 'ready', uploadedAt: daysAgo(55, 10) },
      { id: 'lec_3004', courseId: 'crs_2001', title: 'REST APIs with PHP',                lectureNumber: 6, description: 'Routing, JSON responses and error handling.',              fileName: 'COMP3610-L06-rest-apis.pdf',     fileSizeKb: 1840, pageCount: 8, status: 'ready', uploadedAt: daysAgo(1, 10) },
      { id: 'lec_3005', courseId: 'crs_2002', title: 'The relational model',              lectureNumber: 1, description: '',                                                          fileName: 'COMP3410-L01-relational.pdf',    fileSizeKb: 980,  pageCount: 6, status: 'ready', uploadedAt: daysAgo(68, 9) },
      { id: 'lec_3006', courseId: 'crs_2002', title: 'Normalization (1NF to BCNF)',       lectureNumber: 4, description: 'Functional dependencies and decomposition.',               fileName: 'COMP3410-L04-normalization.pdf', fileSizeKb: 1210, pageCount: 8, status: 'ready', uploadedAt: daysAgo(12, 9) },
      { id: 'lec_3007', courseId: 'crs_2003', title: 'Linear regression',                 lectureNumber: 7, description: '',                                                          fileName: 'COMP3520-L07-regression.pdf',    fileSizeKb: 3020, pageCount: 7, status: 'ready', uploadedAt: daysAgo(9, 15) },
      { id: 'lec_3008', courseId: 'crs_2003', title: 'Gradient descent',                  lectureNumber: 8, description: 'Batch, stochastic and mini-batch gradient descent.',       fileName: 'COMP3520-L08-gradient.pdf',      fileSizeKb: 5320, pageCount: 8, status: 'ready', uploadedAt: ago(45) },
      { id: 'lec_3009', courseId: 'crs_2004', title: 'Conditional probability',           lectureNumber: 3, description: '',                                                          fileName: 'STAT2000-L03-conditional.pdf',   fileSizeKb: 860,  pageCount: 7, status: 'ready', uploadedAt: daysAgo(15, 13) },
      { id: 'lec_3010', courseId: 'crs_2004', title: 'Bayes’ theorem',                    lectureNumber: 5, description: '',                                                          fileName: 'STAT2000-L05-bayes.pdf',         fileSizeKb: 14300, pageCount: 0, status: 'failed', uploadedAt: daysAgo(4, 13) },
      { id: 'lec_3011', courseId: 'crs_2005', title: 'Semantic HTML',                     lectureNumber: 1, description: '',                                                          fileName: 'COMP2680-L01-html.pdf',          fileSizeKb: 740,  pageCount: 6, status: 'ready', uploadedAt: daysAgo(300, 10) }
    ],

    /**
     * quizzes — SEED PLANS (stage 5). api.js turns each plan into a real quiz:
     * questions are generated from the lectures' pages by mock-ai.js, and
     * `attempts` become stored, graded attempts whose answers get exactly
     * `correct` questions right (percent = correct ÷ count). Nothing about a
     * score is stored that can't be recomputed from the answers.
     *   source: 'ai' | 'lecture' | 'weak-topics' | 'retry'
     *   attempts: [{ correct, submittedAt, minutes }] · inProgress: { answered, at }
     */
    quizzes: [
      { id: 'qz_4001', courseId: 'crs_2001', lectureIds: ['lec_3001'], title: 'Web platform basics',       source: 'lecture', difficulty: 'easy',   types: ['mcq', 'true_false'],          count: 12, createdAt: daysAgo(10, 17), attempts: [{ correct: 11, submittedAt: daysAgo(9, 18), minutes: 7 }] },
      { id: 'qz_4002', courseId: 'crs_2001', lectureIds: ['lec_3002'], title: 'HTTP & REST fundamentals',  source: 'lecture', difficulty: 'medium', types: ['mcq', 'multi', 'true_false'], count: 10, createdAt: daysAgo(2, 19),  attempts: [{ correct: 8, submittedAt: daysAgo(1, 20), minutes: 9 }] },
      { id: 'qz_4003', courseId: 'crs_2001', lectureIds: ['lec_3003'], title: 'Sessions & cookies',        source: 'lecture', difficulty: 'medium', types: ['mcq', 'true_false', 'short'], count: 12, createdAt: daysAgo(5, 16),  attempts: [{ correct: 7, submittedAt: daysAgo(4, 17), minutes: 12 }] },
      { id: 'qz_4004', courseId: 'crs_2001', lectureIds: ['lec_3004'], title: 'Designing REST endpoints',  source: 'ai',      difficulty: 'hard',   types: ['mcq', 'multi'],               count: 10, createdAt: daysAgo(1, 11),  attempts: [], inProgress: { answered: 3, at: ago(60 * 5) } },
      { id: 'qz_4005', courseId: 'crs_2002', lectureIds: ['lec_3005'], title: 'Relational algebra',        source: 'lecture', difficulty: 'medium', types: ['mcq', 'true_false'],          count: 15, createdAt: daysAgo(13, 15), attempts: [{ correct: 11, submittedAt: daysAgo(12, 16), minutes: 11 }] },
      { id: 'qz_4006', courseId: 'crs_2002', lectureIds: ['lec_3006'], title: 'Normal forms',              source: 'lecture', difficulty: 'hard',   types: ['mcq', 'multi', 'true_false'], count: 10, createdAt: daysAgo(7, 15),  attempts: [{ correct: 5, submittedAt: daysAgo(6, 16), minutes: 10 }, { correct: 7, submittedAt: daysAgo(3, 16), minutes: 8 }] },
      { id: 'qz_4007', courseId: 'crs_2001', lectureIds: ['lec_3001', 'lec_3002'], title: 'Midterm review: web & HTTP', source: 'ai', difficulty: 'mixed', types: ['mcq', 'true_false'], count: 10, createdAt: daysAgo(15, 14), attempts: [{ correct: 7, submittedAt: daysAgo(14, 19), minutes: 9 }] },
      { id: 'qz_4008', courseId: 'crs_2003', lectureIds: ['lec_3007'], title: 'Linear regression basics',  source: 'lecture', difficulty: 'easy',   types: ['mcq', 'true_false'],          count: 10, createdAt: daysAgo(3, 14),  attempts: [{ correct: 7, submittedAt: daysAgo(2, 15), minutes: 8 }] },
      { id: 'qz_4009', courseId: 'crs_2003', lectureIds: ['lec_3008'], title: 'Gradient descent',          source: 'ai',      difficulty: 'medium', types: ['mcq', 'true_false'],          count: 8,  createdAt: ago(12),         attempts: [] },
      { id: 'qz_4010', courseId: 'crs_2004', lectureIds: ['lec_3009'], title: 'Conditional probability',   source: 'lecture', difficulty: 'medium', types: ['mcq', 'true_false'],          count: 8,  createdAt: daysAgo(9, 11),  attempts: [{ correct: 7, submittedAt: daysAgo(8, 12), minutes: 6 }] },
      { id: 'qz_4011', courseId: 'crs_2004', lectureIds: ['lec_3009'], title: 'Conditional probability II', source: 'lecture', difficulty: 'hard',   types: ['mcq', 'multi', 'true_false'], count: 16, createdAt: daysAgo(6, 11),  attempts: [{ correct: 15, submittedAt: daysAgo(5, 12), minutes: 13 }] },
      { id: 'qz_4012', courseId: 'crs_2005', lectureIds: ['lec_3011'], title: 'Semantic HTML',             source: 'lecture', difficulty: 'easy',   types: ['mcq', 'true_false'],          count: 20, createdAt: daysAgo(291, 11), attempts: [{ correct: 17, submittedAt: daysAgo(290, 12), minutes: 14 }] }
    ],

    /** Topic tag per seed lecture (questions inherit it). Uploaded lectures use their title. */
    lectureTopics: {
      lec_3001: 'Web platform', lec_3002: 'HTTP methods & status codes', lec_3003: 'Sessions & authentication',
      lec_3004: 'REST API design', lec_3005: 'Relational algebra', lec_3006: 'Normalization',
      lec_3007: 'Linear regression', lec_3008: 'Gradient descent', lec_3009: 'Conditional probability',
      lec_3010: 'Bayes’ theorem', lec_3011: 'HTML semantics'
    },

    /**
     * activity — what the student did, newest first in responses.
     * type: course_created | course_updated | course_deleted |
     *       lecture_uploaded | lecture_failed | lecture_deleted |
     *       quiz_submitted | lecture_viewed | chat_message | notes_generated
     * refId: the record the activity is about (attempt, lecture, conversation…).
     * quiz_submitted rows, and a month of lecture_viewed / chat_message rows
     * for the activity chart, are generated by api.js from the seed.
     */
    activity: [
      { id: 'act_7001', userId: 'usr_1001', type: 'lecture_uploaded', courseId: 'crs_2003', title: 'Uploaded “Gradient descent”',                    createdAt: ago(45) },
      { id: 'act_7003', userId: 'usr_1001', type: 'lecture_uploaded', courseId: 'crs_2001', title: 'Uploaded “REST APIs with PHP”',                  createdAt: daysAgo(1, 10) },
      { id: 'act_7007', userId: 'usr_1001', type: 'lecture_failed',   courseId: 'crs_2004', title: 'Processing failed: “Bayes’ theorem” (file unreadable)', createdAt: daysAgo(4, 13) },
    ],

    notifications: [
      { id: 'ntf_5001', userId: 'usr_1001', type: 'quiz',     title: 'New practice quiz ready',     message: 'TutorAI generated 8 questions from “Gradient descent”.',            link: 'pages/student/course.html?id=crs_2003&tab=quizzes',  isRead: false, createdAt: ago(12) },
      { id: 'ntf_5002', userId: 'usr_1001', type: 'lecture',  title: 'Lecture ready',               message: '“REST APIs with PHP” is ready for the AI Tutor.',                   link: 'pages/student/course.html?id=crs_2001&tab=lectures', isRead: false, createdAt: daysAgo(1, 10) },
      { id: 'ntf_5003', userId: 'usr_1001', type: 'progress', title: 'Weekly progress summary',     message: 'You studied 6h 40m this week — up 18% from last week.',             link: 'pages/student/progress.html', isRead: true, createdAt: daysAgo(1, 8) },
      { id: 'ntf_5004', userId: 'usr_1001', type: 'system',   title: 'Welcome to TutorAI',          message: 'Add your first course to get personalised study help.',             link: 'pages/student/courses.html', isRead: true, createdAt: daysAgo(6, 9) }
    ]
  };
})(window.TutorAI);
