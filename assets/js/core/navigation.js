/**
 * TutorAI — navigation config
 * ------------------------------------------------------------------
 * One source for the sidebar (TutorAI is student-only; the user `role`
 * field is kept for future use). `id` must match the page's
 * <body data-page="…"> so the shell can highlight the active link
 * and fill in the topbar title. `href` is relative to the project root;
 * the shell prefixes each page's data-root.
 *
 * Add `badge: 'New'` to any item to show a small pill beside it.
 */
(function (T) {
  'use strict';

  T.navigation = {
    student: {
      role: 'student',
      label: 'Student',
      home: 'pages/student/dashboard.html',
      sections: [
        {
          label: 'Workspace',
          items: [
            { id: 'dashboard', label: 'Dashboard',   icon: 'layout-dashboard', href: 'pages/student/dashboard.html' },
            { id: 'courses',   label: 'My Courses',  icon: 'book-open',        href: 'pages/student/courses.html' },
            { id: 'ai-tutor',  label: 'AI Tutor',    icon: 'sparkles',         href: 'pages/student/ai-tutor.html' },
            { id: 'quizzes',   label: 'Quizzes',     icon: 'list-checks',      href: 'pages/student/quizzes.html' },
            { id: 'progress',  label: 'My Progress', icon: 'chart-line',       href: 'pages/student/progress.html' }
          ]
        },
        {
          label: 'Personal',
          items: [
            { id: 'profile',  label: 'My Profile', icon: 'user',     href: 'pages/student/profile.html' },
            { id: 'settings', label: 'Settings',   icon: 'settings', href: 'pages/student/settings.html' }
          ]
        }
      ],
      searchPlaceholder: 'Search courses, quizzes and notes…'
    }
  };

  /** Find a nav item (and its section) by page id. */
  T.navigation.find = function (role, pageId) {
    const nav = T.navigation[role];
    if (!nav) return null;
    for (const section of nav.sections) {
      const item = section.items.find(i => i.id === pageId);
      if (item) return { item, section };
    }
    return null;
  };
})(window.TutorAI);
