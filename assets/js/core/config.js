/**
 * TutorAI — global namespace & app configuration
 * ------------------------------------------------------------------
 * Every module attaches itself to window.TutorAI so the app runs from
 * plain <script> tags (no bundler, works when opened from disk or
 * served by Apache/PHP later).
 *
 *   TutorAI.config      app settings (this file)
 *   TutorAI.utils       DOM + formatting helpers
 *   TutorAI.navigation  sidebar menus for each shell
 *   TutorAI.mockData    seed data for the mock store (mock mode only)
 *   TutorAI.api         service layer — the ONLY thing pages talk to
 *   TutorAI.ui          toasts, empty states, loaders, modals
 *   TutorAI.components  sidebar / topbar / notification renderers
 *   TutorAI.shell       boots the application layout
 */
window.TutorAI = window.TutorAI || {};

TutorAI.config = Object.freeze({
  appName: 'TutorAI',
  tagline: 'Learn. Practise. Improve.',
  version: '1.0.0',

  /**
   * Data source switch.
   *   true  → api.js resolves every call from mock-data.js
   *   false → api.js calls the real backends below
   */
  useMockData: true,
  mockLatencyMs: 350,

  /**
   * Mock AI (services/mock-ai.js) — mock mode only.
   *   mockAiLatencyMs  delay before an AI reply starts "streaming"
   *   mockAiFailRate   0–1 chance that any AI call fails, to test error states
   *                    (a chat message containing "/error" always fails once)
   */
  mockAiLatencyMs: 900,
  mockAiFailRate: 0,

  /** PHP + MySQL REST endpoints (e.g. /api/courses → api/courses.php) */
  apiBaseUrl: '/api',

  /** Python FastAPI service for AI features (tutor chat, quiz generation) */
  aiBaseUrl: 'http://localhost:8000',

  /**
   * Browser storage keys — prefixed to avoid collisions.
   * Never store passwords or tokens in browser storage.
   */
  storageKeys: Object.freeze({
    sidebarCollapsed: 'tai.sidebar.collapsed',   // localStorage
    rememberedEmail:  'tai.auth.email',           // localStorage, "Remember me" on login
    motion:           'tai.pref.motion',          // localStorage, per-device copy of Settings → reduced motion ('system' | 'reduce')
    mockDb:           'tai.mockdb.v1'             // localStorage, mock store (api.js) — never holds passwords
  }),

  /** Breakpoints mirrored from layout.css */
  breakpoints: Object.freeze({
    drawer: 991.98,   // below this the sidebar becomes an off-canvas drawer
    rail: 1199.98     // below this the sidebar defaults to the icon rail
  })
});
