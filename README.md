# TutorAI

**Learn. Practise. Improve.** An AI study app for university and college students: add your courses, upload lecture PDFs, ask an AI Tutor that answers only from your own notes, take practice quizzes, and track your progress. Admins get a one-page console to manage student accounts.

This is the frontend (HTML, CSS, JavaScript, Bootstrap 5). It currently runs on a demo backend inside the browser, ready to connect to a PHP + MySQL API and a FastAPI AI service.

## Run it

```bash
python3 dev-server.py
```

Then open http://localhost:5500.

**Demo logins** (password `Practise2026!` for both):

- Student: `maya.chen@university.ca`
- Admin: `owner@tutorai.app` (opens the admin dashboard)

## Docs

- [Developer guide](docs/GUIDE.md): pages, structure, conventions, data model, grading and analytics
- [API](docs/API.md): every endpoint, with request and response
- [Database schema](docs/schema.sql): MySQL tables
- [QA report](docs/QA-REPORT.md): what was tested and known limitations
