-- =============================================================================
-- TutorAI — draft MySQL schema (MySQL 8.0+, InnoDB, utf8mb4)
-- -----------------------------------------------------------------------------
-- Mirrors the mock store in assets/js/services/api.js and data/mock-data.js.
--
-- Conventions
--   • Primary keys are INT UNSIGNED AUTO_INCREMENT. The API adds the prefix
--     the frontend expects:  users.id 1001 → "usr_1001", courses.id → "crs_…",
--     lectures "lec_", quizzes "qz_", questions "q_", attempts "att_",
--     conversations "conv_", messages "msg_", activity_log "act_",
--     notifications "ntf_", summaries "sum_", notes "note_", admin_actions "adm_".
--   • Columns are snake_case; PHP converts to camelCase in responses
--     (first_name → firstName).
--   • Times are stored in UTC (DATETIME(3)) and returned as ISO-8601.
--   • Calculated values (course progress/mastery, quiz status, best score,
--     topic averages, streaks) are NEVER stored — the API computes them from
--     attempts and attempt_answers, exactly as api.js does.
--   • Every student query in PHP filters by the session's user_id (ownership),
--     so one student can never read another student's rows. Admin endpoints
--     (role = 'admin') read accounts and COUNT(*)s only — never messages,
--     notes, lecture_pages or attempt_answers.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS tutorai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tutorai;

-- -----------------------------------------------------------------------------
-- users — students and admins. Sign-up only ever creates 'student'; admins are
-- created by hand (or a seed script). role is checked by PHP on every
-- /api/admin/* request. password_hash comes from PHP password_hash(); the plain
-- password is never stored. Deactivated accounts can't sign in.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role            ENUM('student','admin') NOT NULL DEFAULT 'student',
  first_name      VARCHAR(60)  NOT NULL,
  last_name       VARCHAR(60)  NOT NULL DEFAULT '',
  email           VARCHAR(254) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  institution     VARCHAR(120) NOT NULL DEFAULT '',
  program         VARCHAR(120) NOT NULL DEFAULT '',
  year_of_study   TINYINT UNSIGNED NULL,                 -- 1–5, 6 = graduate
  bio             VARCHAR(280) NOT NULL DEFAULT '',
  avatar_url      VARCHAR(500) NULL,
  title           VARCHAR(80)  NULL,                    -- admins: e.g. 'Platform Owner'
  avatar_color    ENUM('lavender','powder','sage','butter','pink','peach') NOT NULL DEFAULT 'lavender',
  status          ENUM('active','deactivated') NOT NULL DEFAULT 'active',
  status_changed_at DATETIME(3) NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at   DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status, created_at)
) ENGINE=InnoDB AUTO_INCREMENT=1001;

-- -----------------------------------------------------------------------------
-- admin_actions — audit log for the admin console. Every activate/deactivate
-- records who did it and the required reason. Kept if the admin is removed.
-- -----------------------------------------------------------------------------
CREATE TABLE admin_actions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id        INT UNSIGNED NULL,
  user_id         INT UNSIGNED NOT NULL,
  action          ENUM('activate','deactivate') NOT NULL,
  from_status     ENUM('active','deactivated') NOT NULL,
  to_status       ENUM('active','deactivated') NOT NULL,
  reason          VARCHAR(300) NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_admin_actions_user (user_id, created_at),
  KEY idx_admin_actions_admin (admin_id, created_at),
  CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_admin_actions_user  FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Password reset links: only a SHA-256 hash of the emailed token is stored.
CREATE TABLE password_resets (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  token_hash      CHAR(64)     NOT NULL,
  expires_at      DATETIME(3)  NOT NULL,
  used_at         DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token (token_hash),
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- user_settings — one row per student (Settings page). Missing row = defaults.
-- -----------------------------------------------------------------------------
CREATE TABLE user_settings (
  user_id                 INT UNSIGNED NOT NULL,
  notify_lecture_ready    TINYINT(1) NOT NULL DEFAULT 1,
  notify_quiz_ready       TINYINT(1) NOT NULL DEFAULT 1,
  notify_weekly_summary   TINYINT(1) NOT NULL DEFAULT 1,
  notify_study_reminders  TINYINT(1) NOT NULL DEFAULT 0,
  weekly_goal_days        TINYINT UNSIGNED NOT NULL DEFAULT 4,
  reduced_motion          ENUM('system','reduce') NOT NULL DEFAULT 'system',
  updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT chk_user_settings_goal CHECK (weekly_goal_days BETWEEN 1 AND 7),
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- courses — owned by one student. Codes are unique per student.
-- -----------------------------------------------------------------------------
CREATE TABLE courses (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  code              VARCHAR(20)  NOT NULL,
  title             VARCHAR(120) NOT NULL,
  instructor        VARCHAR(120) NOT NULL DEFAULT '',
  term              VARCHAR(40)  NOT NULL DEFAULT '',
  color             ENUM('lavender','powder','sage','butter','pink','peach') NOT NULL DEFAULT 'lavender',
  description       VARCHAR(500) NOT NULL DEFAULT '',
  status            ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_accessed_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_user_code (user_id, code),
  KEY idx_courses_user_accessed (user_id, last_accessed_at),
  CONSTRAINT fk_courses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2001;

-- -----------------------------------------------------------------------------
-- lectures — one uploaded PDF. status follows the processing pipeline.
-- The file itself lives outside the web root (storage_path); never served directly.
-- -----------------------------------------------------------------------------
CREATE TABLE lectures (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id       INT UNSIGNED NOT NULL,
  title           VARCHAR(150) NOT NULL,
  lecture_number  SMALLINT UNSIGNED NULL,               -- 1–999, optional
  topic           VARCHAR(120) NOT NULL DEFAULT '',     -- groups results for topic analytics
  description     VARCHAR(500) NOT NULL DEFAULT '',
  file_name       VARCHAR(255) NOT NULL,
  file_size_kb    INT UNSIGNED NOT NULL,                -- ≤ 20480 (20 MB)
  storage_path    VARCHAR(500) NOT NULL,
  page_count      SMALLINT UNSIGNED NULL,
  status          ENUM('uploading','extracting','processing','ready','failed') NOT NULL DEFAULT 'uploading',
  failure_reason  VARCHAR(255) NULL,
  uploaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_lectures_course_status (course_id, status),
  -- Not UNIQUE: a number may be reused after a failed upload. upload.php rejects
  -- a duplicate among the course's non-failed lectures (409).
  KEY idx_lectures_course_number (course_id, lecture_number),
  CONSTRAINT fk_lectures_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3001;

-- Extracted text, one row per PDF page (lectureContent.pages in the mock).
CREATE TABLE lecture_pages (
  lecture_id      INT UNSIGNED NOT NULL,
  page_number     SMALLINT UNSIGNED NOT NULL,
  heading         VARCHAR(200) NOT NULL DEFAULT '',
  body            MEDIUMTEXT   NOT NULL,                -- Markdown (maths in $…$, code in fences)
  PRIMARY KEY (lecture_id, page_number),
  FULLTEXT KEY ft_lecture_pages (heading, body),        -- retrieval for the AI Tutor
  CONSTRAINT fk_lecture_pages_lecture FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Saved AI study aids for a lecture (one current summary and one set of notes each).
CREATE TABLE lecture_summaries (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lecture_id      INT UNSIGNED NOT NULL,
  content         MEDIUMTEXT   NOT NULL,                -- Markdown
  sources         JSON         NOT NULL,                -- [{ lectureId, page }]
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_lecture_summaries_lecture (lecture_id),
  CONSTRAINT fk_lecture_summaries_lecture FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE lecture_notes (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lecture_id      INT UNSIGNED NOT NULL,
  content         MEDIUMTEXT   NOT NULL,
  sources         JSON         NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_lecture_notes_lecture (lecture_id),
  CONSTRAINT fk_lecture_notes_lecture FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- AI Tutor conversations — fixed to one course for their lifetime;
-- optionally focused on one lecture of that course.
-- -----------------------------------------------------------------------------
CREATE TABLE conversations (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  course_id       INT UNSIGNED NOT NULL,
  lecture_id      INT UNSIGNED NULL,
  title           VARCHAR(80)  NOT NULL DEFAULT 'New conversation',
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_conversations_user_course (user_id, course_id, updated_at),
  CONSTRAINT fk_conversations_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT fk_conversations_course  FOREIGN KEY (course_id)  REFERENCES courses (id)  ON DELETE CASCADE,
  CONSTRAINT fk_conversations_lecture FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE messages (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED NOT NULL,
  role            ENUM('user','assistant') NOT NULL,
  content         MEDIUMTEXT   NOT NULL,                -- Markdown; rendered through DOMPurify
  sources         JSON         NULL,                    -- [{ lectureId, page, heading }] — this course only
  status          ENUM('complete','error') NOT NULL DEFAULT 'complete',
  stopped         TINYINT(1)   NOT NULL DEFAULT 0,      -- student pressed Stop; content is what they saw
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_messages_conversation (conversation_id, created_at),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- quizzes — generated from one or more lectures of ONE course.
-- 'draft' = preview only (deleted after a day if never saved).
-- -----------------------------------------------------------------------------
CREATE TABLE quizzes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id         INT UNSIGNED NOT NULL,
  title             VARCHAR(120) NOT NULL,
  source            ENUM('lecture','ai','weak-topics','retry') NOT NULL DEFAULT 'lecture',
  difficulty        ENUM('easy','medium','hard','mixed') NOT NULL DEFAULT 'medium',
  question_count    TINYINT UNSIGNED NOT NULL,          -- requested: 5 | 10 | 15 | 20
  question_types    SET('mcq','multi','true_false','short') NOT NULL,
  show_explanations TINYINT(1) NOT NULL DEFAULT 1,
  time_limit_min    SMALLINT UNSIGNED NULL,
  status            ENUM('draft','ready','archived') NOT NULL DEFAULT 'draft',
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_quizzes_course_status (course_id, status),
  KEY idx_quizzes_status_created (status, created_at),   -- draft clean-up job
  CONSTRAINT fk_quizzes_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4001;

-- Which lectures a quiz was built from (quiz.lectureIds in the mock).
CREATE TABLE quiz_lectures (
  quiz_id         INT UNSIGNED NOT NULL,
  lecture_id      INT UNSIGNED NOT NULL,
  PRIMARY KEY (quiz_id, lecture_id),
  KEY idx_quiz_lectures_lecture (lecture_id),
  CONSTRAINT fk_quiz_lectures_quiz    FOREIGN KEY (quiz_id)    REFERENCES quizzes (id)  ON DELETE CASCADE,
  CONSTRAINT fk_quiz_lectures_lecture FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Each question credits the lecture it came from (per-lecture progress/mastery).
-- correct_answer / explanation are NEVER sent before the attempt is submitted.
CREATE TABLE questions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id         INT UNSIGNED NOT NULL,
  position        SMALLINT UNSIGNED NOT NULL,
  type            ENUM('mcq','multi','true_false','short') NOT NULL,
  prompt          TEXT         NOT NULL,                -- Markdown
  options         JSON         NULL,                    -- [{ id: 'a', text }]; NULL for short answer
  correct_answer  JSON         NOT NULL,                -- ['b'] | ['a','c'] | { model, keywords[] }
  explanation     TEXT         NOT NULL,
  lecture_id      INT UNSIGNED NULL,
  page_number     SMALLINT UNSIGNED NULL,
  topic           VARCHAR(120) NOT NULL DEFAULT '',
  difficulty      ENUM('easy','medium','hard') NOT NULL DEFAULT 'medium',
  PRIMARY KEY (id),
  UNIQUE KEY uq_questions_quiz_position (quiz_id, position),
  KEY idx_questions_lecture (lecture_id),
  CONSTRAINT fk_questions_quiz    FOREIGN KEY (quiz_id)    REFERENCES quizzes (id)  ON DELETE CASCADE,
  CONSTRAINT fk_questions_lecture FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- attempts — one per try; at most one in_progress per (quiz, user) — enforced
-- in attempts/start.php inside a transaction (SELECT … FOR UPDATE).
-- -----------------------------------------------------------------------------
CREATE TABLE attempts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id         INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  status          ENUM('in_progress','submitted') NOT NULL DEFAULT 'in_progress',
  question_order  JSON         NOT NULL,                -- [questionId, …] (shuffled on retries)
  shuffle_options TINYINT(1)   NOT NULL DEFAULT 0,
  current_index   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  started_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deadline_at     DATETIME(3)  NULL,                    -- started_at + time limit
  submitted_at    DATETIME(3)  NULL,
  results_viewed_at DATETIME(3) NULL,                   -- first time the results were opened (celebration runs once)
  score           DECIMAL(6,1) NULL,                    -- points (short answers can earn 0.5)
  total           SMALLINT UNSIGNED NOT NULL,
  percent         TINYINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_attempts_user_status (user_id, status, submitted_at),
  KEY idx_attempts_quiz_user (quiz_id, user_id),
  CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- One row per question in the attempt (answers, flags, then grading on submit).
CREATE TABLE attempt_answers (
  attempt_id      INT UNSIGNED NOT NULL,
  question_id     INT UNSIGNED NOT NULL,
  answer          JSON         NULL,                    -- 'b' | ['a','c'] | 'free text' (≤ 600 chars)
  is_flagged      TINYINT(1)   NOT NULL DEFAULT 0,
  is_correct      TINYINT(1)   NULL,                    -- set on submit
  points          DECIMAL(3,1) NULL,                    -- 1 | 0.5 | 0
  feedback        JSON         NULL,                    -- short answer: { matched[], missing[], required }
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (attempt_id, question_id),
  KEY idx_attempt_answers_question (question_id),
  CONSTRAINT fk_attempt_answers_attempt  FOREIGN KEY (attempt_id)  REFERENCES attempts (id)  ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- activity_log — drives Recent activity, streaks, the weekly goal and charts.
-- ref_id holds the related row's prefixed id (attempt, lecture, quiz).
-- course_id is kept (SET NULL) so history survives a course delete.
-- -----------------------------------------------------------------------------
CREATE TABLE activity_log (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  type            ENUM('course_created','course_updated','course_deleted',
                       'lecture_uploaded','lecture_failed','lecture_deleted','lecture_viewed',
                       'chat_message','notes_generated','quiz_created','quiz_submitted') NOT NULL,
  course_id       INT UNSIGNED NULL,
  ref_id          VARCHAR(20)  NULL,
  title           VARCHAR(200) NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_activity_user_created (user_id, created_at),
  KEY idx_activity_user_type (user_id, type, created_at),
  CONSTRAINT fk_activity_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_activity_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7001;

-- -----------------------------------------------------------------------------
-- notifications — the bell menu. Created only if user_settings allows the type.
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  type            ENUM('lecture','quiz','progress','reminder','system') NOT NULL,
  title           VARCHAR(120) NOT NULL,
  message         VARCHAR(300) NOT NULL,
  link            VARCHAR(300) NULL,                    -- project-relative app path
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notifications_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5001;

-- -----------------------------------------------------------------------------
-- Deleting an account (DELETE /api/account) is a single
--   DELETE FROM users WHERE id = ?;
-- the ON DELETE CASCADE chain removes settings, courses → lectures → pages,
-- summaries, notes, quizzes → questions, attempts → answers, conversations →
-- messages, activity and notifications. Uploaded files are removed by PHP.
-- =============================================================================
