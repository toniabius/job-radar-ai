# Job Radar AI Architecture 🏗️

This document outlines the software architecture, data flow, component breakdown, cancellation lifecycle, threshold gating, Chrome Extension integration, AI answer generator, and velocity analytics engine for Job Radar AI.

---

## 📐 System Architecture Overview

Job Radar AI uses a **Full-Stack Monolithic Architecture** combining a **React 18 Single Page Application (SPA)** on the frontend with an **Express (Node.js)** backend server, coupled with a **Manifest V3 Chrome Extension** (`/public/extension`) for client-side ATS application form autofill.

```
+------------------------------------------------------------------------------------+
|                                    BROWSER / UI                                    |
|  +------------------------------------------------------------------------------+  |
|  |                            React 18 + Tailwind CSS                           |  |
|  | [Dashboard] [Full Inventory] [Scan History] [Scan Log]                       |  |
|  | [Config & Profiles] [Apply Assistant] [Metrics (Velocity)]                    |  |
|  +--------------------------------------+---------------------------------------+  |
+-----------------------------------------|------------------------------------------+
                                          | REST API Calls / AbortSignal
                                          v
+------------------------------------------------------------------------------------+
|                                  EXPRESS BACKEND                                   |
|  +-----------------------------------+  +---------------------------------------+  |
|  | API Router                        |  | Provider Adapter Manager              |  |
|  | - /api/jobs                       |  | - Greenhouse / Lever / Workday        |  |
|  | - /api/config & /api/profiles     |  | - LinkedIn / Open Web Scanner         |  |
|  | - /api/candidate-profile          |  +-------------------+-------------------+  |
|  | - /api/candidate-profile/generate |                      |                      |
|  | - /api/pipeline/run & cancel      |                      |                      |
|  +-----------------+-----------------+                      v                      |
|                    |                    +---------------------------------------+  |
|                    |                    | Gemini AI Match Engine & Answer Gen   |  |
|                    |                    | (@google/genai SDK + Web Scraper)     |  |
|                    |                    +-------------------+-------------------+  |
+--------------------|----------------------------------------|----------------------+
                     |                                        |
                     v                                        v
+--------------------------------------+    +----------------------------------------+
|       LOCAL PERSISTENCE STORE        |    |          GOOGLE GEMINI AI API          |
|  - database/profiles/<id>/jobs.db    |    | - gemini-3.1-flash-lite / 2.5-lite     |
|  - config/profiles.json & config.json|    | - Candidate Fit & Skill Gap Evaluation |
|  - output/report.md                  |    | - AI Salary Range Extraction           |
|  - resume/resume.md                  |    | - Contextual Answer Generation         |
+--------------------------------------+    +----------------------------------------+
                     ^
                     | Chrome Extension Sync (REST / Background API)
+--------------------+---------------------------------------------------------------+
|                        CHROME EXTENSION (Job Radar QuickFill)                      |
|  - In-Page Floating Panel & Field Matching Engine (content.js)                     |
|  - Form Value Override Checkbox (Preserve vs Overwrite Existing Inputs)            |
|  - Background Worker & API Bridge (background.js)                                  |
+------------------------------------------------------------------------------------+
```

---

## 🧩 Core Architectural Components & Features

### 1. Frontend Layer (`/src`)
- **Framework**: React 18 with TypeScript and Vite.
- **Styling**: Tailwind CSS with standard responsive layouts, clean card hierarchies, and Lucide React icons.
- **State Management**: React State (`useState`, `useEffect`, `useRef`, `useCallback`) synchronized with Express REST endpoints.
- **7 Core Navigation Tabs (`Header.tsx`)**:
  1. `dashboard`: Primary Job Dashboard with score tier filters, search index, and status filters.
  2. `database`: Full Job Inventory with multi-column sorting, provider filtering, and batch evaluation.
  3. `report`: Formatted Scan History reports with match score threshold gating.
  4. `logs`: Real-time Scan Log terminal output viewer.
  5. `config`: Config & Profiles switcher, resume manager, PDF parser, detected skills manager, and pipeline parameters.
  6. `candidate-profile`: Apply Assistant managing contact details, application Q&A knowledge base, AI answer generator, and extension setup instructions.
  7. `metrics`: Application Velocity & Metrics Tracker.

- **Key Frontend Modules**:
  - `App.tsx`: Top-level application controller, active tab router, candidate profile state provider, and pipeline execution manager.
  - `CandidateProfileEditor.tsx`: Contact detail manager, Q&A list editor, AI Application Answer Generator with live job URL input and word limit constraints, and extension instructions.
  - `MetricsTracker.tsx`: Velocity KPI cards (Today's count vs goal, active momentum streak, 7-day velocity, conversion rate), interactive daily application bar chart (7D/14D/30D), conversion funnel visualization, and application log with 1-click status toggles.
  - `ConfigEditor.tsx`: Multi-profile manager, PDF parser, detected skills manager, and dealbreaker blocker config.
  - `DatabaseViewer.tsx`: Full job database inspector with sorting, filtering, and batch evaluation.
  - `ScanProgressModal.tsx` & `ScanLogsView.tsx`: Terminal console execution logger and live scan monitors.

---

## 🤖 Express API Endpoints & Services

1. **Pipeline Execution**:
   - `POST /api/pipeline/run`: Initiates job discovery scanner, ATS fetching, and Gemini evaluation loop.
   - `POST /api/pipeline/cancel`: Immediately flags `activePipelineCancelled` to abort background jobs without corrupting database state.

2. **Candidate Profiles & Settings**:
   - `GET /api/profiles` & `POST /api/profiles`: Query and create candidate profiles.
   - `POST /api/profiles/select`: Switch active candidate profile context.
   - `DELETE /api/profiles/:id`: Delete profile with safety guards preventing active profile deletion when multiple exist.
   - `GET /api/candidate-profile` & `POST /api/candidate-profile`: Query and persist contact details and Q&A items into active profile state.

3. **AI Application Answer Generator**:
   - `POST /api/candidate-profile/generate-answer`:
     - Accepts `question`, `jobUrl`, `wordLimit`, and candidate context.
     - **Web Page Scraper**: If `jobUrl` is provided, backend executes a lightweight HTTP GET with standard browser headers and strips HTML/scripts to extract up to 3,500 characters of raw job description text.
     - Formats prompt for Gemini model enforcing first-person voice, candidate background alignment, and word limit constraints.

4. **Job Database Management**:
   - `GET /api/jobs`: Query full job database.
   - `POST /api/jobs/evaluate`: Single-job or batch AI evaluation.
   - `POST /api/jobs/toggle-applied`: Toggles `applied` state and records ISO timestamp `applied_date`.

---

## 🧩 Chrome Extension Architecture (`/public/extension`)

1. **Components**:
   - `manifest.json`: Manifest V3 extension definition with `activeTab`, `scripting`, and host permissions.
   - `content.js`: Content script injected into active web pages. Embeds a dark-themed floating panel (`#job-radar-panel`) on ATS application portals (LinkedIn Easy Apply, Workday, Greenhouse, Lever).
   - `background.js`: Service worker handling extension background messaging and backend API synchronization.

2. **Form Autofill & Override Engine**:
   - Scans DOM input fields (`input[type="text"]`, `input[type="email"]`, `textarea`, `select`, radio/checkbox question groups).
   - Matches field labels and names against candidate contact details and Q&A knowledge base entries.
   - **Form Value Override Checkbox**:
     - *Unchecked (Default)*: Evaluates existing input values or checked radio buttons. If a field already contains data, autofill skips it to prevent overwriting candidate inputs.
     - *Checked*: Forces value replacement on all matched fields and radio groups.
   - **Resilience**: Timeout guards wrap background messaging to recover gracefully if extension context becomes stale or invalidated.

---

## 📊 Application Velocity & Metrics Analytics Engine

1. **Velocity KPIs**:
   - **Applied Today**: Counts jobs marked `applied: true` where `applied_date` matches current ISO date string (`YYYY-MM-DD`).
   - **Daily Goal Target**: Customizable target (1-50 apps/day) stored in local UI state.
   - **Active Momentum Streak**: Iterates backward through consecutive calendar days in history, counting active streaks of days with ≥1 submitted application.
   - **7-Day Velocity & Average**: Sums applications submitted in last 7 days and computes daily average rate.

2. **Conversion Pipeline Funnel**:
   - Computes conversion ratios: `Total Discovered ➔ Evaluated by AI ➔ Strong Matches (≥Threshold) ➔ Submitted Applications`.

3. **Interactive History Visualizer**:
   - Generates daily buckets for selectable lookback windows (7D, 14D, 30D).
   - Scales bar height dynamically against maximum daily count or daily target.

---

## 🤖 Hybrid Match Evaluation & AI Salary Extraction Engine

1. **Primary Evaluation Engine**: Powered by `@google/genai` using `gemini-3.1-flash-lite` with cascading fallbacks (`gemini-2.5-flash-lite`, `gemini-2.5-flash`) and sliding-window rate limit throttling (`enforceGeminiRateLimit`). Compares job requirements against `resume.md` and candidate detected skills (`parsedSkills`).
2. **AI Salary Extraction Engine**: Extracts explicit salary ranges or hourly rates from job descriptions using Gemini and regex patterns. Normalizes to standard formats (e.g., `$170,000 - $250,000` or `$80 - $120 / hr`) or tags unlisted compensation as `$Not found`.
3. **Evaluation Guardrails**:
   - **Disclosed Below-Target Salary Cap**: Disclosed maximum salary below `min_salary` caps match score at max 55 (**Weak Match**).
   - **YOE Range & Ceiling Cap**: Candidate YOE below required minimum OR exceeding upper-bound ceilings caps score at max 55 (**Weak Match**).
   - **Hard Blocker Rules**: Violations of user dealbreakers (e.g. Security Clearance, 1099, 5-day On-site) cap score at max 25.
4. **Resilient Heuristic Fallback**: If Gemini API key is missing or invalid, evaluation seamlessly falls back to a deterministic **ATS Heuristic Engine** calculating skill overlap scores.

---

## 🛡️ Safe Write & Reload Guard Architecture

To prevent unnecessary server restarts or Vite dev server reload loops during disk persistence:
- **`writeFileIfChanged` Helper**: Compares incoming string payloads against existing file content on disk before executing `fs.writeFileSync`. If content is unchanged, disk writing is skipped.
- **Vite Watch Ignored Paths**: `vite.config.ts` explicitly ignores file changes inside `config/`, `database/`, `resume/`, and `output/` directories.

---

## 📁 Data Persistence & Version Control Strategy

Lightweight file-system backed JSON & Markdown stores:
- `/config/profiles.json`: Multi-candidate profiles database storing active profile ID, configurations, resumes, contact info, and Q&A items.
- `/database/jobs.db.json` & `/database/profiles/<id>/jobs.db.json`: Scanned and evaluated job database with status tags (`evaluated`, `saved`, `applied`, `applied_date`).
- `/config/config.json`: Active pipeline parameters.
- `/output/report.md`: Active markdown evaluation report.
- `/resume/resume.md`: Active candidate markdown resume.

### `.gitkeep` Reservation Pattern
Directories are reserved with empty `.gitkeep` files while ignoring user runtime data via `.gitignore`:

```gitignore
config/*
!config/.gitkeep

database/*
!database/.gitkeep

output/*
!output/.gitkeep

resume/*
!resume/.gitkeep
```

---

## 🔒 Security & Privacy Architecture

1. **Server-Side API Proxying**: All Gemini AI API calls and web page fetches are proxied through server-side Express routes. API keys remain safely stored in server environment variables (`process.env.GEMINI_API_KEY`).
2. **Local Data Sovereignty**: Job databases, candidate resumes, and contact profiles remain stored strictly on the local file system.

