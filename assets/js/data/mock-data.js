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
  /** A local time `days` ago at `hour`:00 (keeps seeded activity on real calendar days). */
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
      },

      // Other students, so the admin console has realistic data. Sign-in works
      // with the demo password while they're active; their names and emails are fictional.
      { id: 'usr_1002', role: 'student', firstName: 'Jordan',  lastName: 'Okoro',      email: 'jordan.okoro@student.example.edu',   institution: 'Thompson Rivers University', program: 'BSc Computer Science',      yearOfStudy: 2, avatarUrl: null, avatarColor: 'powder',   bio: '', createdAt: daysAgo(64, 11), lastLoginAt: ago(60 * 2),        status: 'active' },
      { id: 'usr_1003', role: 'student', firstName: 'Aisha',   lastName: 'Rahman',     email: 'aisha.rahman@student.example.edu',   institution: 'Thompson Rivers University', program: 'BSc Data Science',          yearOfStudy: 3, avatarUrl: null, avatarColor: 'sage',     bio: '', createdAt: daysAgo(58, 15), lastLoginAt: ago(60 * 26),       status: 'active' },
      { id: 'usr_1004', role: 'student', firstName: 'Lucas',   lastName: 'Moreau',     email: 'lucas.moreau@student.example.edu',   institution: 'Okanagan College',           program: 'Diploma in Web Development', yearOfStudy: 1, avatarUrl: null, avatarColor: 'butter',   bio: '', createdAt: daysAgo(41, 9),  lastLoginAt: daysAgo(3, 20),      status: 'active' },
      { id: 'usr_1005', role: 'student', firstName: 'Priya',   lastName: 'Nair',       email: 'priya.nair@student.example.edu',     institution: 'Thompson Rivers University', program: 'BBA Information Systems',   yearOfStudy: 4, avatarUrl: null, avatarColor: 'pink',     bio: '', createdAt: daysAgo(37, 13), lastLoginAt: daysAgo(12, 18),     status: 'active' },
      { id: 'usr_1006', role: 'student', firstName: 'Ethan',   lastName: 'Walker',     email: 'ethan.walker@student.example.edu',   institution: 'Okanagan College',           program: 'BSc Computer Science',      yearOfStudy: 2, avatarUrl: null, avatarColor: 'peach',    bio: '', createdAt: daysAgo(33, 10), lastLoginAt: daysAgo(30, 16),     status: 'deactivated' },
      { id: 'usr_1007', role: 'student', firstName: 'Sofia',   lastName: 'Rossi',      email: 'sofia.rossi@student.example.edu',    institution: 'Thompson Rivers University', program: 'BSc Mathematics',           yearOfStudy: 3, avatarUrl: null, avatarColor: 'lavender', bio: '', createdAt: daysAgo(26, 14), lastLoginAt: ago(60 * 5),        status: 'active' },
      { id: 'usr_1008', role: 'student', firstName: 'Noah',    lastName: 'Kim',        email: 'noah.kim@student.example.edu',       institution: 'Thompson Rivers University', program: 'BSc Computer Science',      yearOfStudy: 1, avatarUrl: null, avatarColor: 'powder',   bio: '', createdAt: daysAgo(19, 12), lastLoginAt: daysAgo(2, 9),       status: 'active' },
      { id: 'usr_1009', role: 'student', firstName: 'Fatima',  lastName: 'Haddad',     email: 'fatima.haddad@student.example.edu',  institution: 'Okanagan College',           program: 'Diploma in Business Analytics', yearOfStudy: 2, avatarUrl: null, avatarColor: 'sage', bio: '', createdAt: daysAgo(12, 16), lastLoginAt: daysAgo(9, 19),     status: 'active' },
      { id: 'usr_1010', role: 'student', firstName: 'Liam',    lastName: 'O’Connor',   email: 'liam.oconnor@student.example.edu',   institution: 'Thompson Rivers University', program: 'BEng Software Engineering', yearOfStudy: 4, avatarUrl: null, avatarColor: 'butter',   bio: '', createdAt: daysAgo(8, 11),  lastLoginAt: daysAgo(8, 11),      status: 'deactivated' },
      { id: 'usr_1011', role: 'student', firstName: 'Mei',     lastName: 'Tanaka',     email: 'mei.tanaka@student.example.edu',     institution: 'Thompson Rivers University', program: 'BSc Biology',               yearOfStudy: 2, avatarUrl: null, avatarColor: 'pink',     bio: '', createdAt: daysAgo(3, 10),  lastLoginAt: ago(60 * 30),       status: 'active' },

      // The admin console's demo account (role 'admin'). Sees counts and account
      // status only — never students' chats, notes or quiz answers.
      {
        id: 'usr_9001',
        role: 'admin',
        firstName: 'Kareena',
        lastName: 'Zaman',
        email: 'owner@tutorai.app',
        institution: '',
        program: '',
        title: 'Platform Owner',
        yearOfStudy: null,
        avatarUrl: null,
        avatarColor: 'peach',
        bio: '',
        createdAt: '2026-08-15T16:00:00Z',
        lastLoginAt: ago(60 * 3),
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
      },

      // Other students' courses (metadata only — for the admin console's counts)
      { id: 'crs_2006', userId: 'usr_1002', code: 'COMP 2230', title: 'Data Structures',          instructor: 'Dr. Alan Fox',      term: 'Fall 2026', color: 'powder',   status: 'active', description: '', createdAt: daysAgo(63, 12), lastAccessedAt: ago(60 * 2) },
      { id: 'crs_2007', userId: 'usr_1002', code: 'MATH 2120', title: 'Discrete Mathematics',     instructor: 'Dr. Ruth Lee',      term: 'Fall 2026', color: 'butter',   status: 'active', description: '', createdAt: daysAgo(60, 12), lastAccessedAt: daysAgo(4, 15) },
      { id: 'crs_2008', userId: 'usr_1003', code: 'STAT 3050', title: 'Regression Analysis',      instructor: 'Dr. Omar Siddiq',   term: 'Fall 2026', color: 'sage',     status: 'active', description: '', createdAt: daysAgo(57, 16), lastAccessedAt: ago(60 * 26) },
      { id: 'crs_2009', userId: 'usr_1004', code: 'WEB 1100',  title: 'Intro to Web Development', instructor: 'Ms. Clara Dumont',  term: 'Fall 2026', color: 'peach',    status: 'active', description: '', createdAt: daysAgo(40, 10), lastAccessedAt: daysAgo(3, 20) },
      { id: 'crs_2010', userId: 'usr_1005', code: 'BUSN 3300', title: 'Information Systems',      instructor: 'Dr. Ken Ito',       term: 'Fall 2026', color: 'pink',     status: 'active', description: '', createdAt: daysAgo(36, 14), lastAccessedAt: daysAgo(12, 18) },
      { id: 'crs_2011', userId: 'usr_1007', code: 'MATH 3400', title: 'Linear Algebra II',        instructor: 'Dr. Ruth Lee',      term: 'Fall 2026', color: 'lavender', status: 'active', description: '', createdAt: daysAgo(25, 15), lastAccessedAt: ago(60 * 5) },
      { id: 'crs_2012', userId: 'usr_1011', code: 'BIOL 2200', title: 'Cell Biology',             instructor: 'Dr. Grace Obi',     term: 'Fall 2026', color: 'sage',     status: 'active', description: '', createdAt: daysAgo(3, 10),  lastAccessedAt: ago(60 * 30) }
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
      { id: 'lec_3011', courseId: 'crs_2005', title: 'Semantic HTML',                     lectureNumber: 1, description: '',                                                          fileName: 'COMP2680-L01-html.pdf',          fileSizeKb: 740,  pageCount: 6, status: 'ready', uploadedAt: daysAgo(300, 10) },

      // Other students' lectures (no seed text: ready ones get labelled demo pages)
      { id: 'lec_3012', courseId: 'crs_2006', title: 'Linked lists',             lectureNumber: 1, description: '', fileName: 'COMP2230-L01-linked-lists.pdf', fileSizeKb: 1180, pageCount: null, status: 'ready',      uploadedAt: daysAgo(50, 10) },
      { id: 'lec_3013', courseId: 'crs_2006', title: 'Stacks and queues',        lectureNumber: 2, description: '', fileName: 'COMP2230-L02-stacks.pdf',       fileSizeKb: 960,  pageCount: null, status: 'ready',      uploadedAt: daysAgo(43, 10) },
      { id: 'lec_3014', courseId: 'crs_2006', title: 'Binary search trees',      lectureNumber: 3, description: '', fileName: 'COMP2230-L03-bst.pdf',          fileSizeKb: 2400, pageCount: null, status: 'processing', uploadedAt: ago(4) },
      { id: 'lec_3015', courseId: 'crs_2007', title: 'Propositional logic',      lectureNumber: 1, description: '', fileName: 'MATH2120-L01-logic.pdf',        fileSizeKb: 700,  pageCount: null, status: 'ready',      uploadedAt: daysAgo(55, 9) },
      { id: 'lec_3016', courseId: 'crs_2008', title: 'Simple linear regression', lectureNumber: 1, description: '', fileName: 'STAT3050-L01-slr.pdf',          fileSizeKb: 1550, pageCount: null, status: 'ready',      uploadedAt: daysAgo(52, 14) },
      { id: 'lec_3017', courseId: 'crs_2008', title: 'Residual diagnostics',     lectureNumber: 2, description: '', fileName: 'STAT3050-L02-residuals.pdf',    fileSizeKb: 19800, pageCount: 0,   status: 'failed',     uploadedAt: daysAgo(2, 16) },
      { id: 'lec_3018', courseId: 'crs_2009', title: 'HTML basics',              lectureNumber: 1, description: '', fileName: 'WEB1100-W01-html.pdf',          fileSizeKb: 640,  pageCount: null, status: 'ready',      uploadedAt: daysAgo(38, 11) },
      { id: 'lec_3019', courseId: 'crs_2010', title: 'Enterprise systems',       lectureNumber: 1, description: '', fileName: 'BUSN3300-L01-erp.pdf',          fileSizeKb: 1320, pageCount: null, status: 'ready',      uploadedAt: daysAgo(30, 13) },
      { id: 'lec_3020', courseId: 'crs_2011', title: 'Eigenvalues',              lectureNumber: 4, description: '', fileName: 'MATH3400-L04-eigen.pdf',        fileSizeKb: 1890, pageCount: null, status: 'ready',      uploadedAt: daysAgo(6, 15) },
      { id: 'lec_3021', courseId: 'crs_2012', title: 'The cell membrane',        lectureNumber: 1, description: '', fileName: 'BIOL2200-L01-membrane.pdf',     fileSizeKb: 2950, pageCount: null, status: 'uploading',  uploadedAt: ago(2) }
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

      // Other students (admin console: recent activity, active users)
      { id: 'act_7101', userId: 'usr_1002', type: 'lecture_uploaded', courseId: 'crs_2006', title: 'Uploaded “Binary search trees”',     createdAt: ago(4) },
      { id: 'act_7102', userId: 'usr_1011', type: 'lecture_uploaded', courseId: 'crs_2012', title: 'Uploaded “The cell membrane”',       createdAt: ago(2) },
      { id: 'act_7103', userId: 'usr_1007', type: 'quiz_submitted',   courseId: 'crs_2011', title: 'Submitted a quiz',                   createdAt: ago(60 * 5) },
      { id: 'act_7104', userId: 'usr_1007', type: 'chat_message',     courseId: 'crs_2011', title: 'Asked the AI Tutor',                 createdAt: ago(60 * 5 + 20) },
      { id: 'act_7105', userId: 'usr_1003', type: 'lecture_viewed',   courseId: 'crs_2008', title: 'Read “Simple linear regression”',    createdAt: ago(60 * 26) },
      { id: 'act_7106', userId: 'usr_1003', type: 'lecture_failed',   courseId: 'crs_2008', title: 'Processing failed: “Residual diagnostics” (file too large to process)', createdAt: daysAgo(2, 16) },
      { id: 'act_7107', userId: 'usr_1008', type: 'course_created',   courseId: null,       title: 'Added a course',                     createdAt: daysAgo(2, 9) },
      { id: 'act_7108', userId: 'usr_1004', type: 'quiz_submitted',   courseId: 'crs_2009', title: 'Submitted a quiz',                   createdAt: daysAgo(3, 20) },
      { id: 'act_7109', userId: 'usr_1011', type: 'course_created',   courseId: 'crs_2012', title: 'Added “BIOL 2200”',                  createdAt: daysAgo(3, 10) },
      { id: 'act_7110', userId: 'usr_1002', type: 'chat_message',     courseId: 'crs_2006', title: 'Asked the AI Tutor',                 createdAt: daysAgo(4, 15) },
      { id: 'act_7111', userId: 'usr_1005', type: 'notes_generated',  courseId: null,       title: 'Generated study notes',              createdAt: daysAgo(6, 12) }
    ],

    notifications: [
      { id: 'ntf_5001', userId: 'usr_1001', type: 'quiz',     title: 'New practice quiz ready',     message: 'TutorAI generated 8 questions from “Gradient descent”.',            link: 'pages/student/course.html?id=crs_2003&tab=quizzes',  isRead: false, createdAt: ago(12) },
      { id: 'ntf_5002', userId: 'usr_1001', type: 'lecture',  title: 'Lecture ready',               message: '“REST APIs with PHP” is ready for the AI Tutor.',                   link: 'pages/student/course.html?id=crs_2001&tab=lectures', isRead: false, createdAt: daysAgo(1, 10) },
      { id: 'ntf_5003', userId: 'usr_1001', type: 'progress', title: 'Weekly progress summary',     message: 'You studied 6h 40m this week — up 18% from last week.',             link: 'pages/student/progress.html', isRead: true, createdAt: daysAgo(1, 8) },
      { id: 'ntf_5004', userId: 'usr_1001', type: 'system',   title: 'Welcome to TutorAI',          message: 'Add your first course to get personalised study help.',             link: 'pages/student/courses.html', isRead: true, createdAt: daysAgo(6, 9) }
    ]
  };
})(window.TutorAI);
