# ExpenseIQ — Expense Tracker

A full-stack personal expense tracker. Log what you spend, set a monthly budget, and see where your money goes by month and by category. Each user has a private account with an activity log of every change.

![ExpenseIQ dashboard](docs/screenshots/dashboard-light.png)

## Features

- **Accounts and security**: register and sign in with email and password. Passwords are hashed with bcrypt and sessions use JWT tokens, so every user only sees their own data.
- **Expenses**: add, edit and bulk-delete expenses with a description, amount, category, date and currency. Quick-pick chips fill in common categories.
- **Search, filter and sort**: search by description, filter by date range (today, this week, this month, this year or a custom range) and category, and sort by date, amount or name.
- **Monthly budget**: set a budget and track spent vs remaining with a progress bar. The bar turns red when you go over.
- **Dashboard**:
  - your total spent shown on a bank-card style summary
  - a 6-month trend line with a change-vs-last-month badge
  - largest and average expense
  - top category
  - automatic spending insights
- **Charts**: spending by month (bar chart) and by category (doughnut chart), built with Chart.js. Category colours match across charts, tags and cards.
- **Export**: download your expenses as CSV, Excel or a printable PDF.
- **Activity log**: a record of every sign-in, create, update, delete and settings change. You can search it, filter it by date, action or type, and export it to CSV.
- **Profile**: view your account details and edit your name.
- **Light and dark themes**: your choice is remembered in the browser.
- **Responsive**: works from phone to desktop. On phones, forms open as bottom sheets.
- **Motion**: animated page entrances, dialogs, toasts and new rows using [Motion](https://motion.dev) (the engine behind Framer Motion). Animations switch off automatically when the system "reduce motion" setting is on.

## Screenshots

| Dark mode | Sign in |
|---|---|
| ![Dashboard in dark mode](docs/screenshots/dashboard-dark.png) | ![Sign-in page](docs/screenshots/sign-in.png) |

<p align="center"><img src="docs/screenshots/mobile.png" alt="Mobile view" width="300"></p>

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS (custom design tokens, light/dark themes), vanilla JavaScript |
| Charts and motion | Chart.js 4, Motion 11 |
| Icons and fonts | Font Awesome 6, Plus Jakarta Sans |
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL with SQLAlchemy |
| Auth | JWT (python-jose) and bcrypt |
| Validation | Pydantic |

The FastAPI server serves both the REST API and the frontend files, so the whole app runs on one port.

```
Browser (index.html + Style.css + script.js)  →  REST API + JWT  →  FastAPI  →  PostgreSQL
```

## Getting started

### Prerequisites

- Python 3.11 or newer
- PostgreSQL, installed and running

### 1. Create the database

```sql
CREATE DATABASE expenseiq;
```

### 2. Configure environment variables

```bash
cd backend
copy .env.example .env
```

Edit `backend/.env` and set your PostgreSQL password and a long random JWT secret:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/expenseiq
JWT_SECRET=your-long-random-secret-string
```

### 3. Run the app

**Windows (one step):** double-click `run.bat`. It creates a virtual environment, installs the dependencies and starts the server.

**Manual:**

```bash
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

Then open **http://localhost:8000**. Create an account on the sign-in page to get started.

| URL | What it is |
|---|---|
| http://localhost:8000 | The app |
| http://localhost:8000/docs | Interactive API docs (Swagger) |
| http://localhost:8000/health | Database health check |

## Project structure

```
Expense Tracker/
├── index.html          # App markup: sign-in, dashboard, activity log, profile, dialogs
├── Style.css           # Design tokens, light/dark themes, layout and components
├── script.js           # API client, routing, rendering, charts, exports, animations
├── run.bat             # One-step setup and start for Windows
├── docs/screenshots/   # Images used in this README
└── backend/
    ├── main.py         # FastAPI app, CORS, serves the frontend files
    ├── config.py       # Settings loaded from .env
    ├── database.py     # SQLAlchemy engine and sessions
    ├── auth.py         # JWT, password hashing, current-user dependency
    ├── audit_service.py# Writes activity log entries
    ├── models.py       # User, Expense, UserSettings, AuditLog
    ├── schemas.py      # Pydantic request and response models
    ├── routers/        # auth, users, expenses, settings, audit
    └── README.md       # Full API reference and troubleshooting
```

## API overview

All `/api/*` routes except register and login need an `Authorization: Bearer <token>` header.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` |
| Profile | `GET /api/users/me`, `PUT /api/users/me` |
| Expenses | `GET /api/expenses`, `POST /api/expenses`, `PUT /api/expenses/{id}`, `DELETE /api/expenses/{id}`, `DELETE /api/expenses/bulk` |
| Settings | `GET /api/settings`, `PUT /api/settings` (currency and monthly budget) |
| Activity log | `GET /api/audit-logs` |

See [`backend/README.md`](backend/README.md) for request bodies and troubleshooting.

## Author

**Aditya Kale**

- GitHub: [@Adityak0012](https://github.com/Adityak0012)
- LinkedIn: [adityak0012](https://www.linkedin.com/in/adityak0012)
