# Job Radar AI Architecture 🏗️

This document outlines the software architecture, data flow, component breakdown, cancellation lifecycle, threshold gating, and integration details for the Job Radar AI application.

---

## 📐 System Architecture Overview

Job Radar AI uses a **Full-Stack Monolithic Architecture** combining a **React 18 Single Page Application (SPA)** on the frontend with an **Express (Node.js)** backend server, integrated via Vite middleware during development and bundled into CommonJS for production.

```
+-------------------------------------------------------------------+
|                           BROWSER / UI                            |
|  +-------------------------------------------------------------+  |
|  |                   React 18 + Tailwind CSS                   |  |
|  | [Dashboard] [Job Details] [Config Editor] [Scan Modal]      |  |
|  +------------------------------+------------------------------+  |
+---------------------------------|---------------------------------+
                                  | REST API Calls / AbortSignal
                                  v
+-------------------------------------------------------------------+
|                         EXPRESS BACKEND                           |
|  +--------------------------+  +-------------------------------+  |
|  | API Router               |  | Provider Adapter Manager      |  |
|  | - /api/jobs              |  | - Greenhouse / Lever / Workday|  |
|  | - /api/config            |  | - LinkedIn / Open Web Scanner |  |
|  | - /api/resume            |  +---------------+---------------+  |
|  | - /api/pipeline/run      |                  |                  |
|  | - /api/pipeline/cancel   |                  |                  |
|  +------------+-------------+                  |                  |
|               |                                v                  |
|               |                 +------------------------------+  |
|               |                 | Gemini AI Match Engine       |  |
|               |                 | (@google/genai SDK)          |  |
|               |                 +--------------+---------------+  |
+---------------+--------------------------------|------------------+
                |                                |
                v                                v
+-------------------------------+  +--------------------------------+
|     LOCAL PERSISTENCE STORE   |  |     GOOGLE GEMINI AI API       |
|  - database/jobs.db.json      |  | - gemini-2.5-flash-lite / pro  |
|  - config/config.json         |  | - Candidate Fit Evaluation     |
|  - output/report.md           |  | - Skill Gap Analysis           |
|  - resume/resume.md           |  +--------------------------------+
+-------------------------------+
```

---

## 🧩 Core Architectural Components & Features

### 1. Frontend Layer (`/src`)
- **Framework**: React 18 with TypeScript and Vite.
- **Styling**: Tailwind CSS with standard responsive layouts, clean card hierarchies, and Lucide React icons.
- **State Management**: React State (`useState`, `useEffect`, `useRef`, `useCallback`) synchronized with Express REST endpoints.
- **Key Modules**:
  - `App.tsx`: Main dashboard controller, cancellation handler via `AbortController` and `/api/pipeline/cancel` API endpoint, job list filtering (All Qualified, Strong Match, Good Match, Status filters), and search indexing.
  - `ConfigEditor.tsx`: Configurator for Target Roles (prioritized at top), Minimum Score Threshold (`minimum_score`), Target Companies (optional open web mode), Salary Ranges, Lookback Window (Hours, Days, Weeks, Months), and Preferred Locations.
  - `ScanProgressModal.tsx`: Terminal-styled console displaying real-time execution steps with a prominent **Cancel Scan** control.
  - `ReportView.tsx`: Rendered Markdown viewer with styled external listing links (`target="_blank" rel="noopener noreferrer"`).
  - `DatabaseViewer.tsx`: Dedicated database manager providing full database inspection, provider filtering, single-job **AI Evaluate**, and **Evaluate All Pending** batch processing.
  - `JobCard.tsx` & `JobDetailsModal.tsx`: Rich job cards showing match levels, salary tags, missing skills, and recommended application actions.

---

## 🤖 Hybrid Match Evaluation Engine (Gemini AI + ATS Heuristic Fallback)

To ensure zero downtime and robust candidate evaluation under all key configurations:
1. **Primary Evaluation Mode**: Uses `@google/genai` with `gemini-2.5-flash` or `gemini-2.5-flash-lite` to perform structured prompt evaluation comparing job requirements against `resume.md`.
2. **Resilient Fallback Mode**: If `GEMINI_API_KEY` is not configured or returns an authentication error (e.g., `API_KEY_INVALID`), the backend automatically flags `isApiKeyKnownInvalid` and redirects evaluation to a deterministic **ATS Heuristic Scoring Engine**.
3. **ATS Heuristic Algorithm**: Calculates term overlap between candidate resume skills/experience and job title/description, generating deterministic fit scores (0-100%), matching reason lists, missing skill identification, and actionable cover letter guidance.

---

## 🛡️ Safe Write & Reload Guard Architecture

To prevent unnecessary server restarts or Vite dev server reload loops during disk persistence:
- **`writeFileIfChanged` Helper**: Compare incoming string payloads against existing file content on disk before executing `fs.writeFileSync`. If content is unchanged, disk writing is skipped.
- **Vite Watch Ignored Paths**: `vite.config.ts` explicitly ignores file changes inside `config/`, `database/`, `resume/`, and `output/` directories, ensuring runtime data persistence never triggers client UI re-renders or connection refreshes.

---

## ⚡ Pipeline Lifecycle & Cancellation Architecture

When a scan pipeline is executed via `POST /api/pipeline/run`:
1. **Frontend Request Initiation**: `App.tsx` instantiates an `AbortController` and attaches its signal to the `fetch` request.
2. **Cancellation State Tracking**: The server maintains an `activePipelineCancelled` flag and checks both the flag and `req.destroyed` before every asynchronous operation (scanner iteration, AI evaluation step, and database persistence).
3. **Graceful User Abort**: If the user clicks **Cancel Scan**:
   - The frontend invokes `POST /api/pipeline/cancel` and calls `abortController.abort()`.
   - The server instantly aborts further evaluation loops and exits without writing intermediate scan state to `/database/jobs.db.json` or `/output/report.md`.
   - The UI closes the progress modal and retains existing dashboard data without displaying broken or incomplete scan results.

---

## 🎯 Match Score Threshold & Report Link Gating

To keep reports concise and actionable:
1. `generateMarkdownReport` checks the user's configured `minimum_score` (default: `65%`).
2. **Threshold Filter**:
   - Job postings with `score >= minimum_score` include direct markdown hyperlinks: `[🔗 View Job Posting](url)`.
   - Job postings with `score < minimum_score` omit direct listing links and insert an explanatory note `*(Omitted — match score X% is below threshold of Y%)*`.
3. **Formatted Render**: `ReportView.tsx` uses custom `ReactMarkdown` components to safely render links with `target="_blank" rel="noopener noreferrer"`.

---

## 📁 Data Persistence & Version Control Strategy

Job Radar AI uses lightweight file-system backed JSON & Markdown stores for zero-overhead local data storage:
- `/database/jobs.db.json`: Scanned and evaluated job database with status tags (`evaluated`, `saved`, `applied`).
- `/config/config.json`: Active pipeline parameters (roles, optional companies, lookback window, salary bounds, minimum score threshold, locations).
- `/output/report.md`: Markdown evaluation report output.
- `/resume/resume.md`: Candidate resume in Markdown format.

### `.gitkeep` Reservation Pattern
To prevent committing personal credentials, local candidate data, or generated reports into Git repositories, directories are reserved with empty `.gitkeep` files while ignoring actual data contents via `.gitignore`:

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

1. **Server-Side API Proxying**: All calls to the Gemini AI API are proxied through server-side Express routes. API keys are kept strictly in environment variables (`process.env.GEMINI_API_KEY`).
2. **Local Data Sovereignty**: Job databases and candidate resume files remain stored locally on the server volume, eliminating external third-party storage exposure.
