# Job Radar AI 🎯

An automated AI-powered job discovery and candidate fit evaluation pipeline tailored specifically for **Software Engineering (SWE)** and **technical roles**, built with **React**, **Express**, **TypeScript**, and the **Gemini AI API**.

Job Radar AI systematically scans job boards and ATS platforms for target software engineering and technical roles (e.g. Frontend, Backend, Full Stack, AI/ML, DevOps, Systems), compares candidate resumes against job requirements, and calculates match scores, fit summaries, missing technical skills, recommended application actions, application velocity metrics, and AI-powered application answers.

---

## 🌟 Key Features & Workflow Modules

1. **Job Dashboard**:
   - Primary operational hub featuring instant pipeline scanning with a live progress console and cancellation controls.
   - Live search, filtering by match tier (All Qualified, Strong Match ≥65%, Good Match), status filtering (Saved, Applied), and interactive job cards detailing score breakdowns, salary ranges, missing skills, and application guidance.

2. **Full Job Inventory**:
   - Comprehensive database view listing all discovered job opportunities.
   - Multi-column sorting (Match Score, Discovery Date, Title, Company Name), provider filtering, single-job **AI Evaluate**, and **Evaluate All Pending** batch processing.

3. **Scan History & Scan Log**:
   - **Scan History**: Renders formatted Markdown reports for active and past scan runs with score threshold gating (`minimum_score`, e.g., 65%) to filter listing links.
   - **Scan Log**: Real-time terminal log viewer providing deep diagnostic visibility into ATS adapters, page fetching, and Gemini API requests.

4. **Config and Profiles**:
   - Streamlined candidate profile switcher (create, switch, and delete candidate profiles with safety safeguards).
   - Profile-scoped isolation: Switching profiles instantly syncs target configs, resumes, job databases (`database/profiles/<profileId>/jobs.db.json`), and scan reports (`output/profiles/<profileId>/reports/`).
   - PDF Resume parser & interactive **Detected Skills Manager** with quick preset buttons and text inputs.
   - Pipeline parameters: Target roles, target companies, publication lookback window (e.g. 24h, 7d, 1m), minimum match score threshold, salary floor, preferred locations, experience ceiling rules, and hard dealbreaker blockers.

5. **Apply Assistant**:
   - **Personal Contact Details**: Store candidate contact information (Name, Email, Phone, Address, LinkedIn, Portfolio, GitHub) for quick copy-pasting into job application forms.
   - **Application Q&A Knowledge Base**: Pre-populate common job application questions and responses.
   - **AI Application Answer Generator**:
     - Freetext input for any **Job Listing Website URL**. The Express backend automatically fetches and parses the live web page HTML/text from the URL to extract the job description context.
     - Optional **Word / Character Limit** constraints (e.g. "150 words" or "500 characters").
     - Generates first-person, authentic application answers using Gemini AI based on candidate resume, profile details, and job requirements.
   - **Instruction & Chrome Extension Helper**: Instructions and setup guide for the included **Job Radar QuickFill** Chrome Extension (`/public/extension`).

6. **Metrics (Velocity) Tracker**:
   - **Daily Application Velocity**: Track job applications submitted today against a customizable daily target goal (e.g. 5 apps/day) with progress indicators.
   - **Momentum Streak & 7-Day Velocity**: Measure consecutive active application days and 7-day average submission rates.
   - **Application Pipeline Funnel**: Visual conversion analytics (Discovered ➔ AI Evaluated ➔ Strong Matches ➔ Submitted Applications).
   - **Daily Velocity History Chart**: Interactive visual bar chart displaying application volume across 7D, 14D, and 30D timeframes.
   - **Application Velocity Job Log**: Direct log with quick status filters (All Applied, Applied Today, Strong Matches) and 1-click status toggling.

7. **Chrome Extension (Job Radar QuickFill)**:
   - Floating in-page helper for ATS platforms (LinkedIn Easy Apply, Workday, Greenhouse, Lever).
   - Includes an **"Override existing form values"** checkbox:
     - *Unchecked (Default)*: Preserves existing filled form inputs.
     - *Checked*: Overwrites form inputs with candidate profile and Q&A values.
   - Robust timeout and context invalidation protection against stuck UI states.

---

## 🛠️ Local Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Gemini API Key** *(Optional, required for live AI match evaluation and answer generation)*: Obtain a free key from [Google AI Studio](https://aistudio.google.com/).

### 1. Clone the Repository & Install Dependencies
```bash
# Clone repository
git clone https://github.com/toniabius/job-radar-ai.git
cd job-radar-ai

# Install dependencies
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root directory (or copy from `.env.example`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Run Development Server
Start the full-stack Express + Vite development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 4. Build for Production
To build and bundle the frontend and backend for production deployment:
```bash
# Build Vite frontend & compile CJS Express server
npm run build

# Start production server
npm start
```

---

## 📁 Repository Structure & Version Control Strategy

```
.
├── server.ts                   # Full-stack Express backend server, API routes & Gemini pipeline
├── server/                     # Modular server handlers
│   └── gemini.ts               # Gemini AI evaluation client, fallback models & prompt templates
├── src/
│   ├── App.tsx                 # Primary application controller & tab router
│   ├── components/             # React UI components
│   │   ├── Header.tsx          # Main top navigation bar (7 core tabs)
│   │   ├── JobCard.tsx         # Detailed job card item & evaluation modal
│   │   ├── DatabaseViewer.tsx  # Full Job Inventory database inspector & batch evaluator
│   │   ├── ConfigEditor.tsx    # Role, threshold, lookback, salary & profile manager
│   │   ├── CandidateProfileEditor.tsx # Apply Assistant (Contact details, Q&A, AI Answer Generator, Instruction)
│   │   ├── MetricsTracker.tsx  # Application Velocity Tracker, daily goal, streak & conversion funnel
│   │   ├── ReportView.tsx      # Formatted Markdown report viewer with threshold link gating
│   │   ├── ScanProgressModal.tsx # Terminal console modal with Cancel Scan control
│   │   └── ScanLogsView.tsx    # Real-time scan log terminal output viewer
│   ├── data/                   # Initial seed data & default configuration profiles
│   ├── types.ts                # Global TypeScript interfaces & types
│   └── main.tsx                # React Vite client entry point
├── public/
│   └── extension/              # Chrome Extension (Job Radar QuickFill)
│       ├── manifest.json       # Manifest V3 configuration
│       ├── content.js          # In-page floating panel & form autofill engine
│       └── background.js       # Background service worker API bridge
├── database/                   # Persistent database directory (.gitkeep tracked)
│   ├── profiles/               # Profile-scoped job databases (database/profiles/<profileId>/jobs.db.json)
│   └── jobs.db.json            # Active profile synced database
├── config/                     # User settings and profiles store directory
│   ├── profiles.json           # Profiles store containing configurations, resumes & contact info
│   └── config.json             # Active profile configuration
├── output/                     # Generated reports directory (.gitkeep tracked)
│   ├── profiles/               # Profile-scoped scan history reports
│   └── report.md               # Active profile synced report
├── resume/                     # Candidate resume store directory (.gitkeep tracked)
│   └── resume.md               # Active profile resume
└── package.json
```

### 🔒 Git Ignore & Data Privacy Best Practices

Runtime user data (scanned jobs `database/*`, customized settings `config/*`, generated reports `output/*`, candidate resumes `resume/*`, and environment files `.env`) contain personal details and local state.

To preserve folder structures in Git without committing local runtime data, the repository uses `.gitkeep` placeholders combined with `.gitignore` exclusion rules:

```gitignore
# Local User Data, Databases & Generated Reports
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

## 💡 How To Use

1. **Configure Profiles & Resume**:
   - Go to **Config and Profiles** to edit candidate settings, upload or parse PDF resumes, and customize detected technical skills.
2. **Launch Job Discovery Scan**:
   - Click **"Scan"** in the header to execute automated job discovery and AI match evaluation.
3. **Review & Evaluate Jobs**:
   - Browse high-match opportunities on the **Job Dashboard** or inspect all discovered postings in **Full Job Inventory**.
4. **Draft Application Answers with AI**:
   - Open **Apply Assistant**, paste any job listing URL, specify an optional length limit (e.g. 150 words), and enter application questions to generate custom, first-person responses.
5. **Autofill Job Applications**:
   - Use the **Job Radar QuickFill** Chrome Extension on job portals (LinkedIn, Workday, Greenhouse, Lever). Use the **"Override existing form values"** checkbox if you wish to replace pre-filled form fields.
6. **Track Application Velocity**:
   - Visit **Metrics (Velocity)** to monitor daily submission targets, active momentum streaks, 14-day velocity charts, and candidate funnel conversion rates.

---

## 📄 License

Personal, non-commercial use only. See [LICENSE](./LICENSE) for details.

