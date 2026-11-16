/**
 * TutorAI — Notification list component
 * Renders notification rows for the topbar dropdown (and, later, a full
 * notifications page). Data comes from TutorAI.api.notifications.
 */
(function (T) {
  'use strict';

  const { escape, timeAgo, url } = T.utils;
  T.components = T.components || {};

  /** notification.type → icon + pastel tone */
  const TYPE_META = {
    quiz:     { icon: 'list-checks', tone: 'lavender' },
    lecture:  { icon: 'file-text',   tone: 'powder' },
    document: { icon: 'file-text',   tone: 'powder' },
    progress: { icon: 'chart-line',  tone: 'sage' },
    system:   { icon: 'sparkles',    tone: 'butter' },
    user:     { icon: 'user-plus',   tone: 'powder' },
    alert:    { icon: 'triangle-alert', tone: 'pink' }
  };

  T.components.Notifications = {
    row(n) {
      const meta = TYPE_META[n.type] || TYPE_META.system;
      return `
        <a class="tai-notification${n.isRead ? '' : ' is-unread'}" href="${escape(url(n.link || '#'))}" data-notification-id="${escape(n.id)}">
          <span class="tai-icon-tile tai-icon-tile--${meta.tone}">${T.ui.icon(meta.icon)}</span>
          <span class="d-block min-w-0">
            <p class="tai-notification__title">${escape(n.title)}</p>
            <p class="tai-notification__text">${escape(n.message)}</p>
            <span class="tai-notification__time">${escape(timeAgo(n.createdAt))}</span>
          </span>
        </a>`;
    },

    list(items) {
      if (!items.length) {
        return T.ui.emptyState({
          icon: 'bell',
          title: "You're all caught up",
          text: 'New activity will appear here.',
          compact: true
        });
      }
      return items.map(T.components.Notifications.row).join('');
    },

    unreadCount(items) {
      return items.filter(n => !n.isRead).length;
    }
  };
})(window.TutorAI);
