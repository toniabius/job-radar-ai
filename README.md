# Job Radar AI 🎯

An automated AI-powered job discovery and candidate fit evaluation pipeline built with **React**, **Express**, **TypeScript**, and the **Gemini AI API**.

Job Radar AI systematically scans job boards and ATS platforms for target engineering and product roles, compares candidate resumes against job requirements, and calculates match scores, fit summaries, missing skills, and recommended application actions.

---

## 🌟 Key Features

- **Instant Scan Cancellation**: Click the **Cancel Scan** button at any point during live scanning or AI evaluation to immediately stop the pipeline and abort backend tasks without storing unverified/partial results to your dashboard.
- **Minimum Score Threshold for Listing Links**: Configure a match score threshold (e.g. `65%`). Scanned reports only include direct job posting links (`🔗 View Job Posting`) for listings meeting or exceeding this match threshold, keeping reports clean and focused on high-fit roles.
- **PDF Resume Upload & AI Parsing**: Upload PDF resumes directly. Gemini AI automatically extracts contact details, experience, skills, and projects into structured Markdown (`resume.md`).
- **Flexible Role-Based Search**: Define target role titles (e.g., *Senior Product Engineer*, *Full Stack AI Platform Engineer*).
- **Optional Target Companies**: Filter by specific companies and ATS providers (Greenhouse, Lever, Workday, LinkedIn, etc.) or run in **Open Web Search Mode** across all platforms.
- **Publication Lookback Window**: Configure flexible job publication lookback windows (e.g., *24 Hours*, *3 Days*, *2 Weeks*, *1 Month*) using customizable numbers and time units.
- **Salary & Location Filtering**: Filter job opportunities by location preferences (e.g., California, Washington, Virginia, Maryland, Washington DC, Remote, Hybrid) and salary bounds.
- **AI Match Engine**: Powered by Google's **Gemini AI API** (`@google/genai`) to generate quantitative fit scores (0-100%), detailed match reasons, missing skills gaps, and tailored cover letter action items. Automatically falls back to a deterministic **ATS Heuristic Engine** if an API key is missing or invalid.
- **Database Viewer & Batch Evaluation**: Dedicated database management view offering live search, status filtering (Applied / Saved), single-click **AI Evaluate** for pending jobs, and **Evaluate All Pending** batch evaluation.
- **Scan Progress Console & Reports**: Terminal modal interface displaying live job discovery steps, resume parsing status, and Gemini evaluation outputs. Formatted report view supports styled external application links.
- **Saved Jobs & Status Tracking**: Bookmark favorites, filter qualified matches (Score ≥ 60%), mark application status (Applied / Interviewing / Offer / Saved), and export reports.

---

## 🛠️ Local Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Gemini API Key** *(Optional, required for live AI match evaluation)*: Obtain a free key from [Google AI Studio](https://aistudio.google.com/).

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
├── server.ts                   # Full-stack Express backend server & Gemini API pipeline
├── src/
│   ├── App.tsx                 # Primary dashboard controller, cancel handlers & filter views
│   ├── components/             # React UI components
│   │   ├── Header.tsx          # Navigation, tab switching & scan launcher
│   │   ├── ScanProgressModal.tsx # Live terminal log modal with Cancel Scan control
│   │   ├── ConfigEditor.tsx    # Role, company, threshold & lookback config panel
│   │   ├── ReportView.tsx      # Formatted Markdown report viewer with threshold link gating
│   │   ├── DatabaseViewer.tsx  # Direct database manager with search & batch evaluation
│   │   ├── JobCard.tsx         # Detailed job item & AI evaluation breakdown
│   │   └── ...
│   ├── data/                   # Default seed data and fallback initial configurations
│   ├── types.ts                # Global TypeScript interfaces & types
│   └── main.tsx                # React Vite client entry point
├── database/                   # Persistent database directory (.gitkeep tracked)
│   └── .gitkeep
├── config/                     # User settings directory (.gitkeep tracked)
│   └── .gitkeep
├── output/                     # Generated reports directory (.gitkeep tracked)
│   └── .gitkeep
├── resume/                     # Candidate resume store directory (.gitkeep tracked)
│   └── .gitkeep
└── package.json
```

### 🔒 Git Ignore & Data Privacy Best Practices

Runtime user data (scanned jobs `database/*`, customized settings `config/*`, generated reports `output/*`, candidate resumes `resume/*`, and environment files `.env`) contain personal details and local state.

To preserve folder structures in Git without committing local runtime data, the repository uses `.gitkeep` placeholders combined with `.gitignore` exclusion rules:

```gitignore
# Local User Data, Databases & Generated Reports
# Retain directory structure with .gitkeep while ignoring user data & generated outputs
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

1. **Upload / View Resume**: Verify or edit your candidate resume in the **Candidate Resume** tab or upload a PDF resume for AI parsing.
2. **Configure Pipeline Settings**:
   - Add your target **Roles** (e.g., *Full Stack Engineer*, *AI Platform Engineer*).
   - Add **Target Companies** (or leave empty to scan broadly across open web ATS adapters).
   - Set **Minimum Match Score Threshold** for report listing links (e.g., `65%`).
   - Set **Job Publication Lookback Window** (e.g. `24 Hours`, `7 Days`, `1 Month`).
   - Customize **Preferred Locations** and **Salary Range**.
3. **Execute or Cancel Pipeline**: Click **"Scan"** in top navigation to launch scanning. If started by mistake, click **"Cancel Scan"** to halt processing immediately.
4. **Review Matched Jobs & Reports**: Inspect match scores, missing skill gaps, and direct listing links in the **Scan History** tab.
