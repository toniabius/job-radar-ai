import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import * as pdfParseModule from "pdf-parse";

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // 1. Try pdf-parse v2 PDFParse class (new PDFParse({ data: buffer }))
  try {
    const mod: any = pdfParseModule;
    const PDFParseClass = mod?.PDFParse || mod?.default?.PDFParse;
    if (PDFParseClass) {
      const parser = new PDFParseClass({ data: buffer });
      const res = await parser.getText();
      if (res) {
        if (typeof res.text === "string" && res.text.trim()) {
          return res.text.replace(/-- \d+ of \d+ --/g, "").trim();
        }
        if (typeof res === "string" && (res as string).trim()) {
          return (res as string).trim();
        }
        if (res.pages && Array.isArray(res.pages)) {
          const textParts = res.pages.map((p: any) => p.text || "").join("\n");
          if (textParts.trim()) return textParts.trim();
        }
      }
    }
  } catch (err: any) {
    console.warn("pdf-parse v2 extraction attempt error:", err.message);
  }

  // 2. Try legacy function candidates
  try {
    const mod: any = pdfParseModule;
    const candidates: any[] = [
      mod,
      mod?.default,
      mod?.pdfParse,
    ];
    for (const fn of candidates) {
      if (typeof fn === "function") {
        try {
          const result = await fn(buffer);
          if (result && typeof result.text === "string" && result.text.trim()) {
            return result.text.trim();
          }
        } catch (e) {
          // continue
        }
      }
    }
  } catch (e) {
    // continue
  }

  // 3. Try legacy createRequire
  try {
    const req = createRequire(import.meta.url);
    const legacyFn = req("pdf-parse");
    if (typeof legacyFn === "function") {
      const result = await legacyFn(buffer);
      if (result && result.text && result.text.trim()) {
        return result.text.trim();
      }
    }
  } catch (e) {
    // continue
  }

  // 4. Fallback text stream regex extraction for PDF strings
  try {
    const pdfStr = buffer.toString("binary");
    const matches: string[] = [];
    const regex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = regex.exec(pdfStr)) !== null) {
      if (match[1] && match[1].length > 1) {
        matches.push(match[1]);
      }
    }
    if (matches.length > 5) {
      return matches.join(" ");
    }
  } catch (e) {
    // ignore
  }

  return "";
}

function extractExperienceInfo(text: string): { yearsStr: string; experienceYears: number } {
  if (!text) return { yearsStr: "~5+ Years", experienceYears: 5 };

  const currentYear = new Date().getFullYear(); // 2026

  // 1. Isolate work/professional experience section (excluding EDUCATION, PROJECTS, SKILLS)
  const workSectionMatch = text.match(/(?:PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT HISTORY|EXPERIENCE)([\s\S]*?)(?:EDUCATION|SELECTED PROJECTS|PROJECTS|TECHNICAL SKILLS|SKILLS|PUBLICATIONS|ACCOMPLISHMENTS|$)/i);
  const targetText = workSectionMatch ? workSectionMatch[1] : text;

  const yearMatches = [...targetText.matchAll(/\b(19\d\d|20\d\d)\b/g)].map((m) => parseInt(m[1], 10));
  const validStartYears = yearMatches.filter((y) => y >= 1995 && y <= currentYear);

  if (validStartYears.length > 0) {
    const earliestWorkYear = Math.min(...validStartYears);
    const calculated = currentYear - earliestWorkYear;
    if (calculated >= 0 && calculated <= 45) {
      const displayYrs = Math.max(1, calculated);
      return { yearsStr: `~${displayYrs}+ Years (${earliestWorkYear} - ${currentYear})`, experienceYears: displayYrs };
    }
  }

  // 2. Explicit years pattern fallback
  const expMatch = text.match(/Total Professional Experience:\s*~?(\d{1,2})\+?\s*Years/i) ||
                   text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:professional\s+|work\s+)?(?:experience|industry\s+experience)/i);
  if (expMatch && parseInt(expMatch[1], 10) > 0 && parseInt(expMatch[1], 10) <= 45) {
    const yrs = parseInt(expMatch[1], 10);
    return { yearsStr: `~${yrs}+ Years`, experienceYears: yrs };
  }

  return { yearsStr: "~5+ Years", experienceYears: 5 };
}

// Convert JS object to YAML string representation
function dumpYaml(obj: any, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map((item) => {
      if (typeof item === "object" && item !== null) {
        const lines = dumpYaml(item, indent + 2).split("\n");
        return `${pad}- ${lines[0].trimStart()}\n${lines.slice(1).map((l) => pad + "  " + l.trimStart()).join("\n")}`.trimEnd();
      }
      return `${pad}- ${JSON.stringify(item)}`;
    }).join("\n");
  } else if (typeof obj === "object" && obj !== null) {
    return Object.entries(obj).map(([key, val]) => {
      if (Array.isArray(val)) {
        if (val.length === 0) return `${pad}${key}: []`;
        return `${pad}${key}:\n${dumpYaml(val, indent + 2)}`;
      } else if (typeof val === "object" && val !== null) {
        return `${pad}${key}:\n${dumpYaml(val, indent + 2)}`;
      } else if (typeof val === "string") {
        return `${pad}${key}: "${val.replace(/"/g, '\\"')}"`;
      } else {
        return `${pad}${key}: ${val}`;
      }
    }).join("\n");
  }
  return `${pad}${obj}`;
}

import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_CONFIG, DEFAULT_RESUME, SAMPLE_JOBS } from "./src/data/defaultData";
import { AppConfig, Job, ResumeData, PipelineLog } from "./src/types";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Directory paths for local-first storage (SQLite DB simulation / file store)
const DATA_DIR = path.join(process.cwd(), "database");
const CONFIG_JSON_PATH = path.join(process.cwd(), "config", "config.json");
const CONFIG_YAML_PATH = path.join(process.cwd(), "config", "config.yaml");
const ROOT_CONFIG_YAML_PATH = path.join(process.cwd(), "config.yaml");
const PROFILES_JSON_PATH = path.join(process.cwd(), "config", "profiles.json");
const RESUME_PATH = path.join(process.cwd(), "resume", "resume.md");
const JOBS_DB_PATH = path.join(DATA_DIR, "jobs.db.json");
const REPORT_PATH = path.join(process.cwd(), "output", "report.md");
const REPORTS_DIR = path.join(process.cwd(), "output", "reports");

// Ensure directories exist
[DATA_DIR, path.join(process.cwd(), "config"), path.join(process.cwd(), "resume"), path.join(process.cwd(), "output"), REPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Safe write helper to prevent unnecessary file rewrites and Vite reload loops
function writeFileIfChanged(filePath: string, content: string): void {
  try {
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      if (existing === content) return;
    }
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (e) {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

// Helper functions for storage
interface UserProfileData {
  id: string;
  name: string;
  config: AppConfig;
  resume: ResumeData;
  createdAt: string;
  updatedAt: string;
}

interface ProfilesStore {
  activeProfileId: string;
  profiles: UserProfileData[];
}

function loadProfilesData(): ProfilesStore {
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      if (store && Array.isArray(store.profiles) && store.profiles.length > 0) {
        if (!store.profiles.some((p) => p.id === store.activeProfileId)) {
          store.activeProfileId = store.profiles[0].id;
        }
        return store;
      }
    }
  } catch (err) {
    console.error("Error reading profiles.json:", err);
  }

  // Bootstrap initial default profile if profiles.json doesn't exist
  const initialConfig = loadConfigRaw();
  const initialResume = loadResumeRaw(initialConfig.skills);
  const defaultProfile: UserProfileData = {
    id: "default",
    name: "Default Candidate Profile",
    config: initialConfig,
    resume: initialResume,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const store: ProfilesStore = {
    activeProfileId: "default",
    profiles: [defaultProfile],
  };

  saveProfilesData(store);
  return store;
}

function getActiveProfileId(): string {
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      if (store && store.activeProfileId) {
        return store.activeProfileId;
      }
    }
  } catch (err) {
    // fallback
  }
  return "default";
}

function getProfileJobsPath(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "database", "profiles", pid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "jobs.db.json");
}

function getProfileReportPath(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "output", "profiles", pid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "report.md");
}

function getProfileReportsDir(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "output", "profiles", pid, "reports");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveProfilesData(store: ProfilesStore): void {
  writeFileIfChanged(PROFILES_JSON_PATH, JSON.stringify(store, null, 2));
}

function loadConfigRaw(): AppConfig {
  let loaded: AppConfig = DEFAULT_CONFIG;
  try {
    if (fs.existsSync(CONFIG_JSON_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, "utf-8"));
      if (cfg.minimum_score === 75) {
        cfg.minimum_score = 65;
      }
      loaded = { ...DEFAULT_CONFIG, ...cfg };
    }
  } catch (err) {
    console.error("Error reading config.json:", err);
  }
  return loaded;
}

function loadResumeRaw(configSkills?: string[]): ResumeData {
  try {
    if (fs.existsSync(RESUME_PATH)) {
      const markdown = fs.readFileSync(RESUME_PATH, "utf-8");
      return parseResumeDetails(markdown, configSkills);
    }
  } catch (err) {
    console.error("Error reading resume.md:", err);
  }
  return parseResumeDetails("", configSkills);
}

function loadConfig(): AppConfig {
  const cfg = loadConfigRaw();
  saveConfig(cfg);
  return cfg;
}

function saveConfig(config: AppConfig): void {
  // Save to config.json
  const jsonContent = JSON.stringify(config, null, 2);
  writeFileIfChanged(CONFIG_JSON_PATH, jsonContent);

  // Save to config/config.yaml (single source of truth — no root-level duplicate)
  const yamlContent = "# Job Radar AI Pipeline Search & Evaluation Configuration\n" + dumpYaml(config);
  writeFileIfChanged(CONFIG_YAML_PATH, yamlContent);

  // Sync to profiles.json active profile
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      const active = store.profiles.find((p) => p.id === store.activeProfileId);
      if (active) {
        active.config = config;
        active.resume = parseResumeDetails(active.resume.content, config.skills);
        active.updatedAt = new Date().toISOString();
        saveProfilesData(store);
      }
    }
  } catch (err) {
    console.error("Error syncing saveConfig to profiles.json:", err);
  }
}

// Initial bootstrap load to create config files
loadConfig();

/**
 * Uses Gemini to extract a deduplicated list of technical skills from resume text.
 * Falls back to regex matching if the API key is unavailable or the call fails.
 */
async function extractSkillsWithGemini(content: string, configSkills?: string[]): Promise<string[]> {
  if (!content.trim()) {
    console.log("[RESUME] extractSkillsWithGemini: empty content, using regex");
    return extractSkillsRegex(content, configSkills);
  }
  if (!hasValidApiKey()) {
    console.log("[RESUME] extractSkillsWithGemini: no valid API key, using regex");
    return extractSkillsRegex(content, configSkills);
  }

  try {
    const ai = getGeminiClient();
    const config = loadConfig();
    const model = config.gemini_model || "gemini-3.1-flash-lite";

    const prompt = `You are a technical resume parser. Extract every distinct technical skill, programming language, framework, library, tool, platform, and methodology mentioned in the resume below.

Rules:
- Return ONLY a JSON array of strings, e.g. ["TypeScript", "React", "AWS"]
- Each entry must be a specific skill name, properly capitalised (e.g. "TypeScript" not "typescript")
- Do NOT include soft skills, job titles, company names, or vague terms like "problem solving"
- De-duplicate — each skill appears once
- Do NOT include any explanation or markdown formatting, just the raw JSON array

Resume:
${content.slice(0, 12000)}`;

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = (response.text || "").trim()
      .replace(/^```json\n?/i, "").replace(/^```\n?/, "").replace(/```$/, "").trim();

    console.log(`[RESUME] Gemini raw response (first 300 chars): ${raw.slice(0, 300)}`);

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`[RESUME] Gemini extracted ${parsed.length} skills from resume.`);
      return parsed.map((s: any) => String(s).trim()).filter(Boolean);
    }
  } catch (err: any) {
    console.warn("[RESUME] Gemini skill extraction failed, falling back to regex:", err.message, err.stack?.split('\n')[1]);
  }

  return extractSkillsRegex(content, configSkills);
}

/** Original regex-based skill detection — used as fallback. */
function extractSkillsRegex(content: string, configSkills?: string[]): string[] {
  const baselineSkills = [
    "TypeScript", "JavaScript", "React", "Node.js", "Python", "Java", "C++", "Go", "Rust",
    "SQL", "PostgreSQL", "MongoDB", "Redis", "AWS", "GCP", "Azure", "Docker", "Kubernetes",
    "GraphQL", "REST API", "Tailwind CSS", "Vite", "Express", "Distributed Systems",
    "Machine Learning", "System Design", "Microservices", "CI/CD", "Terraform", "Spring Boot",
    "Angular", "Vue", "Kafka", "Snowflake", "Spark", "Scala", "Swift", "Kotlin",
  ];
  const skillVocabulary = configSkills && configSkills.length > 0
    ? [...new Set([...configSkills, ...baselineSkills])]
    : baselineSkills;

  return skillVocabulary.filter((s) =>
    new RegExp(`\\b${s.replace(/[+.]/g, (c) => `\\${c}`)}\\b`, "i").test(content)
  );
}

function parseResumeDetails(content: string, configSkills?: string[]): ResumeData {
  const expInfo = extractExperienceInfo(content);
  let experienceYears = expInfo.experienceYears;

  // Synchronous regex-based skill detection (used for initial parse and fallback).
  // Call enrichResumeSkills() afterwards to upgrade with Gemini extraction.
  const parsedSkills = extractSkillsRegex(content, configSkills);

  return {
    title: "Resume",
    lastUpdated: new Date().toISOString().split("T")[0],
    content,
    parsedSkills,
    experienceYears,
  };
}

/**
 * Async version: parses resume then enriches parsedSkills via Gemini.
 * Use this on write paths (resume save / upload).
 */
async function parseResumeDetailsEnriched(content: string, configSkills?: string[]): Promise<ResumeData> {
  const base = parseResumeDetails(content, configSkills);
  base.parsedSkills = await extractSkillsWithGemini(content, configSkills);
  return base;
}

function loadResume(): ResumeData {
  const config = loadConfig();
  return loadResumeRaw(config.skills);
}

async function saveResume(content: string): Promise<ResumeData> {
  writeFileIfChanged(RESUME_PATH, content);
  const config = loadConfig();
  const resume = await parseResumeDetailsEnriched(content, config.skills);

  // Sync to profiles.json active profile
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      const active = store.profiles.find((p) => p.id === store.activeProfileId);
      if (active) {
        active.resume = resume;
        active.updatedAt = new Date().toISOString();
        saveProfilesData(store);
      }
    }
  } catch (err) {
    console.error("Error syncing saveResume to profiles.json:", err);
  }

  return resume;
}

function loadJobsDB(profileId?: string): Job[] {
  const pid = profileId || getActiveProfileId();
  const profilePath = getProfileJobsPath(pid);

  try {
    if (fs.existsSync(profilePath)) {
      return JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    }
    // Fallback: If default profile and main JOBS_DB_PATH exists, load it
    if (pid === "default" && fs.existsSync(JOBS_DB_PATH)) {
      const legacyJobs = JSON.parse(fs.readFileSync(JOBS_DB_PATH, "utf-8"));
      writeFileIfChanged(profilePath, JSON.stringify(legacyJobs, null, 2));
      return legacyJobs;
    }
  } catch (err) {
    console.error(`Error reading jobs database for profile ${pid}:`, err);
  }

  // Fallback to sample jobs for default profile, or empty array
  const initialJobs = pid === "default" ? SAMPLE_JOBS : [];
  writeFileIfChanged(profilePath, JSON.stringify(initialJobs, null, 2));
  if (pid === getActiveProfileId()) {
    writeFileIfChanged(JOBS_DB_PATH, JSON.stringify(initialJobs, null, 2));
  }
  return initialJobs;
}

function isLocationMatch(jobLoc: string, preferredLocations: string[]): boolean {
  if (!preferredLocations || preferredLocations.length === 0) return true;
  const prefLowerList = preferredLocations.map((l) => l.toLowerCase().trim()).filter(Boolean);
  if (prefLowerList.includes("all") || prefLowerList.includes("any") || prefLowerList.includes("anywhere")) return true;

  const locLower = jobLoc.toLowerCase().trim();

  // If job location is explicitly Remote / Hybrid
  const isJobRemote = locLower.includes("remote") || locLower.includes("work from home") || locLower.includes("anywhere");
  const isJobHybrid = locLower.includes("hybrid");
  if (isJobRemote && prefLowerList.some((p) => p.includes("remote") || p.includes("anywhere"))) return true;
  if (isJobHybrid && prefLowerList.some((p) => p.includes("hybrid") || p.includes("remote"))) return true;

  // Generic "United States" / "US" / "USA" — only pass through if the candidate
  // explicitly includes "United States" or "US" as a preferred location, or if
  // Remote/Hybrid is preferred (those are genuinely nationwide).
  if (locLower === "united states" || locLower === "us" || locLower === "usa") {
    return prefLowerList.some((p) =>
      p.includes("united states") || p === "us" || p === "usa" ||
      p.includes("remote") || p.includes("hybrid") || p.includes("anywhere")
    );
  }

  const locationAliases: Record<string, string[]> = {
    california: ["ca", "california", "san francisco", "santa clara", "los gatos", "los angeles", "san jose", "sunnyvale", "cupertino", "bay area", "fremont", "palo alto", "mountain view"],
    washington: ["wa", "washington", "seattle", "redmond", "bellevue", "kirkland"],
    virginia: ["va", "virginia", "mclean", "reston", "arlington", "herndon", "tysons"],
    maryland: ["md", "maryland", "bethesda", "baltimore", "rockville"],
    "washington dc": ["dc", "washington dc", "district of columbia"],
    texas: ["tx", "texas", "austin", "dallas", "houston", "san antonio", "plano", "irving"],
    "new york": ["ny", "new york", "nyc", "manhattan", "brooklyn"],
    massachusetts: ["ma", "massachusetts", "boston", "cambridge"],
    illinois: ["il", "illinois", "chicago"],
    georgia: ["ga", "georgia", "atlanta"],
    colorado: ["co", "colorado", "denver", "boulder"],
    florida: ["fl", "florida", "miami", "orlando", "tampa"],
    "north carolina": ["nc", "north carolina", "raleigh", "charlotte", "durham"],
  };

  // State abbreviations used to detect which state a job location actually belongs to.
  // Used to reject city matches that belong to a different state (e.g. "Santa Clara, TX").
  const stateAbbreviations: Record<string, string> = {
    al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
    co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
    hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
    ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
    ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri",
    mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
    nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio",
    ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
    sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont",
    va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
    dc: "washington dc",
  };

  const locTokens = locLower.split(/[\s,./\-\(\)]+/).filter(Boolean);

  // Detect the actual state of the job location from its tokens (abbreviation or full name).
  const detectedJobState: string | null = (() => {
    for (const token of locTokens) {
      if (stateAbbreviations[token]) return stateAbbreviations[token];
    }
    for (const [key] of Object.entries(locationAliases)) {
      if (locTokens.includes(key) || locLower.includes(key)) return key;
    }
    return null;
  })();

  for (const pref of prefLowerList) {
    if (locLower.includes(pref)) return true;

    for (const [key, aliases] of Object.entries(locationAliases)) {
      const isPrefMatchingKey = pref === key || aliases.includes(pref);
      if (isPrefMatchingKey) {
        // If we can detect the job's actual state and it contradicts this alias group, skip.
        // e.g. "Santa Clara, TX" — "santa clara" is a CA alias, but detectedJobState is "texas" → reject.
        if (detectedJobState && detectedJobState !== key) continue;

        if (locLower.includes(key) || aliases.some((a) => locTokens.includes(a) || locLower.includes(a))) {
          return true;
        }
      }
    }
  }

  return false;
}

let activePipelineCancelled = false;

async function fetchLiveLinkedInJobs(
  companies: { name: string }[],
  roles: string[],
  preferredLocations: string[],
  timeFilter: string,
  isCancelled?: () => boolean
): Promise<Omit<Job, 'id'>[]> {
  const tprMap: Record<string, string> = { past_24h: "r86400", past_week: "r604800", past_month: "r2592000" };
  const tpr = tprMap[timeFilter] || (typeof timeFilter === "string" && timeFilter.startsWith("r") ? timeFilter : "r86400");

  const results: Omit<Job, 'id'>[] = [];
  const targetCompanies = companies.map((c) => c.name.trim()).filter(Boolean);
  const targetRoleList = roles.length > 0 ? roles : ["Software Engineer"];

  // If specific target companies are provided, query each company; otherwise search open role
  const companyLoop = targetCompanies.length > 0 ? targetCompanies : [""];

  for (const companyName of companyLoop) {
    if (isCancelled && isCancelled()) break;
    for (const role of targetRoleList.slice(0, 2)) {
      if (isCancelled && isCancelled()) break;
      try {
        const query = companyName
          ? encodeURIComponent(`"${companyName}" ${role}`)
          : encodeURIComponent(role);
        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}&f_TPR=${tpr}&start=0`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
          }
        });
        if (!res.ok) continue;
        const html = await res.text();
        const cardMatches = [...html.matchAll(/<li[\s\S]*?<\/li>/g)];

        const urnRegex = /data-entity-urn="urn:li:jobPosting:(\d+)"/;
        const titleRegex = /base-search-card__title">[\s\S]*?([^\s<][^<]*)/;
        const companyRegex = /base-search-card__subtitle">([\s\S]*?)<\/h4>/;
        const locationRegex = /job-search-card__location">[\s\S]*?([^\s<][^<]*)/;
        const timeRegex = /datetime="([^"]+)"/;

        for (const match of cardMatches) {
          const cardHtml = match[0];
          const urnM = cardHtml.match(urnRegex);
          const titleM = cardHtml.match(titleRegex);
          const compM = cardHtml.match(companyRegex);
          const locM = cardHtml.match(locationRegex);
          const timeM = cardHtml.match(timeRegex);

          if (urnM && titleM) {
            const jobId = urnM[1];
            const jobTitle = titleM[1].trim();
            const rawComp = compM ? compM[1].replace(/<[^>]*>/g, "").trim() : companyName;
            const jobLoc = locM ? locM[1].trim() : "United States";
            const postedTime = timeM ? timeM[1] : "Recently";
            const viewUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;

            // STRICT TARGET COMPANY FILTER:
            // When target companies are specified, drop any result whose company does not match
            if (targetCompanies.length > 0) {
              const compLower = rawComp.toLowerCase();
              const isMatch = targetCompanies.some((tc) => {
                const tcLower = tc.toLowerCase();
                return compLower.includes(tcLower) || tcLower.includes(compLower);
              });
              if (!isMatch) {
                continue;
              }
            }

            // STRICT PREFERRED LOCATION FILTER:
            if (preferredLocations && preferredLocations.length > 0) {
              if (!isLocationMatch(jobLoc, preferredLocations)) {
                continue; // Skip job posting if location is outside preferred locations
              }
            }

            // Avoid duplicate job URLs
            if (!results.some(r => r.url === viewUrl)) {
              // Fetch the full job description from the individual posting page
              let fullDescription = "";
              try {
                const jobPageRes = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9"
                  }
                });
                if (jobPageRes.ok) {
                  const jobPageHtml = await jobPageRes.text();
                  const descMatch = jobPageHtml.match(/<div[^>]+class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
                    || jobPageHtml.match(/<div[^>]+id="job-details"[^>]*>([\s\S]*?)<\/div>/i)
                    || jobPageHtml.match(/<section[^>]+class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
                  if (descMatch) {
                    fullDescription = descMatch[1]
                      .replace(/<br\s*\/?>/gi, "\n")
                      .replace(/<li[^>]*>/gi, "\n• ")
                      .replace(/<[^>]+>/g, "")
                      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                      .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                      .replace(/\n{3,}/g, "\n\n")
                      .trim();
                    console.log(`[JD FETCH] ✓ Got description for job ${jobId} (${fullDescription.length} chars)`);
                  } else {
                    console.log(`[JD FETCH] ✗ No description match in HTML for job ${jobId} (HTTP ${jobPageRes.status}, body ${jobPageHtml.length} chars)`);
                  }
                  // Also try to extract salary if present
                  // Pattern order: most specific first
                  // 1. "range for this role is $X - $Y" (Netflix-style)
                  // 2. "compensation ... $X - $Y" (general comp context)
                  // 3. "$X - $Y per year/annual" (explicit annual marker)
                  // 4. Lone dollar amount with per-year marker
                  const salaryMatch =
                    jobPageHtml.match(/range\s+for\s+this\s+role\s+is\s+([\$€£][\d,.]+\s*[-–]\s*[\$€£]?[\d,.]+(?:\s*(?:USD|EUR|GBP))?)/i)
                    || jobPageHtml.match(/salary\s+range[^<]{0,60}?([\$€£][\d,.]+\s*[-–]\s*[\$€£]?[\d,.]+(?:\s*(?:USD|EUR|GBP))?)/i)
                    || jobPageHtml.match(/compensation[^<]{0,120}?([\$€£][\d,.]+(?:\s*[-–]\s*[\$€£]?[\d,.]+)?(?:\s*[KkMm])?(?:\s*(?:USD|EUR|GBP))?)/i)
                    || jobPageHtml.match(/([\$€£][\d,.]+(?:\s*[-–]\s*[\$€£]?[\d,.]+)?\s*(?:USD|EUR|GBP)?)\s*(?:per\s+year|\/yr|annual)/i);
                  if (salaryMatch) {
                    results.push({
                      company: rawComp,
                      title: jobTitle,
                      location: jobLoc,
                      url: viewUrl,
                      description: fullDescription || `${rawComp} is hiring for a ${jobTitle} role in ${jobLoc}.`,
                      posted_time: postedTime,
                      employment_type: "Full-time",
                      department: "Engineering",
                      salary: normalizeSalary(salaryMatch[1].trim()),
                      provider: "LinkedIn",
                      first_seen: new Date().toISOString(),
                      status: "new"
                    });
                    continue;
                  }
                }
              } catch (fetchErr) {
                console.error(`[JD FETCH] ✗ Exception fetching job description for ${jobId}:`, fetchErr);
              }

              results.push({
                company: rawComp,
                title: jobTitle,
                location: jobLoc,
                url: viewUrl,
                description: fullDescription || `${rawComp} is hiring for a ${jobTitle} role in ${jobLoc}. Direct posting listed on LinkedIn with job ID ${jobId}. Key requirements include software engineering, system architecture, and modern application development.`,
                posted_time: postedTime,
                employment_type: "Full-time",
                department: "Engineering",
                salary: normalizeSalary("$150,000 - $280,000 USD"),
                provider: "LinkedIn",
                first_seen: new Date().toISOString(),
                status: "new"
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching live LinkedIn jobs for ${companyName} ${role}:`, err);
      }
    }
  }

  return results;
}

function extractRequiredYoe(text: string): number {
  // Match patterns like "12+ years", "10-15 years", "8 years of experience", "minimum 7 years"
  const patterns = [
    /(\d+)\+?\s*(?:to\s*\d+)?\s*years?\s*(?:of\s*)?(?:professional\s+|relevant\s+|related\s+|work\s+|industry\s+)?experience/i,
    /minimum\s+(?:of\s+)?(\d+)\s*(?:\+)?\s*years?/i,
    /at\s+least\s+(\d+)\s*(?:\+)?\s*years?/i,
    /(\d+)\s*(?:\+)?\s*years?\s+(?:of\s+)?(?:professional|work|industry|relevant)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const yoe = parseInt(match[1], 10);
      if (yoe > 0 && yoe <= 40) return yoe;
    }
  }
  return 0;
}

/**
 * Normalise a raw salary string to a consistent "$X - $Y" format.
 * - Strips trailing ".00" decimals from each number
 * - Ensures the leading "$" is present on both sides of a range
 * - Removes trailing currency codes (USD / EUR / GBP) and trailing punctuation
 * Examples:
 *   "$388,000.00 - $558,000.00." → "$388,000 - $558,000"
 *   "$150,000 - $280,000 USD"   → "$150,000 - $280,000"
 *   "€80,000"                   → "€80,000"
 */
function normalizeSalary(raw: string): string {
  // Strip trailing punctuation / currency codes / whitespace
  let s = raw.replace(/\s*(USD|EUR|GBP)\s*$/i, "").replace(/[.,;]+$/, "").trim();

  // Helper: format a single dollar token — strip .00-style decimals, keep symbol
  const formatAmount = (token: string): string =>
    token.replace(/(\d)\.\d{2}(?=\b|,|$)/g, "$1").trim();

  // Split on the separator (en-dash, em-dash, or hyphen, with optional spaces)
  const separatorMatch = s.match(/^([\$€£][\d,.]+)\s*[-–—]\s*([\$€£]?[\d,.]+)$/);
  if (separatorMatch) {
    const symbol = separatorMatch[1].match(/^[\$€£]/)?.[0] ?? "$";
    const lo = formatAmount(separatorMatch[1]);
    // Re-attach symbol to the high end if it was stripped
    const hiRaw = separatorMatch[2].match(/^[\$€£]/) ? separatorMatch[2] : symbol + separatorMatch[2];
    const hi = formatAmount(hiRaw);
    return `${lo} - ${hi}`;
  }

  // Single value — just clean up decimals
  return formatAmount(s);
}

function generateHeuristicEvaluation(job: Job, resume: ResumeData, config?: AppConfig) {
  const text = `${job.title} ${job.company} ${job.description || ''} ${job.department || ''}`.toLowerCase();

  // Use the parsed skills from the resume (already driven by config.skills in parseResumeDetails).
  // The fallback here is a last-resort safety net only — in normal operation parsedSkills is always populated.
  const resumeSkills = resume.parsedSkills?.length
    ? resume.parsedSkills
    : (config?.skills ?? ["TypeScript", "React", "Node.js", "Python", "REST API", "GraphQL"]);

  const matchedSkills = resumeSkills.filter((s) => text.includes(s.toLowerCase()));

  // Skills the JOB requires that the candidate does NOT have.
  // Scan the job text using config.skills + a broad baseline tech vocabulary.
  const baselineJobVocab = [
    "TypeScript", "JavaScript", "React", "Vue", "Angular", "Node.js", "Python", "Java", "C++", "Go", "Rust",
    "SQL", "PostgreSQL", "MongoDB", "Redis", "AWS", "GCP", "Azure", "Docker", "Kubernetes",
    "GraphQL", "REST", "Tailwind", "Vite", "Express", "Distributed Systems", "Kafka",
    "Machine Learning", "System Design", "Microservices", "CI/CD", "Terraform", "Spring Boot",
  ];
  const jobScanVocab = config?.skills?.length
    ? [...new Set([...config.skills, ...baselineJobVocab])]
    : baselineJobVocab;

  const jobRequiredSkills = jobScanVocab.filter((s) => text.includes(s.toLowerCase()));
  const missingSkills = jobRequiredSkills
    .filter((s) => !resumeSkills.some((rs) => rs.toLowerCase() === s.toLowerCase()))
    .slice(0, 4);

  let baseScore = 70;
  if (text.includes("senior") || text.includes("staff") || text.includes("lead") || text.includes("principal")) {
    baseScore += 8;
  }
  if (text.includes("software") || text.includes("engineer") || text.includes("developer") || text.includes("fullstack") || text.includes("full stack") || text.includes("ai")) {
    baseScore += 10;
  }
  baseScore += Math.min(12, matchedSkills.length * 3);

  // Check location alignment
  let locationPenalty = 0;
  let locationNote = "";
  if (config && config.locations && config.locations.length > 0) {
    if (!isLocationMatch(job.location, config.locations)) {
      locationPenalty = 25;
      locationNote = `Location mismatch: ${job.location} is not in preferred locations (${config.locations.join(", ")})`;
    }
  }

  // Check YOE alignment — penalize hard when candidate is under-qualified
  let yoePenalty = 0;
  let yoeNote = "";
  const candidateYoe = resume.experienceYears || 0;
  const requiredYoe = extractRequiredYoe(`${job.title} ${job.description || ''}`);
  if (candidateYoe > 0 && requiredYoe > 0) {
    const gap = requiredYoe - candidateYoe;
    if (gap >= 5) {
      // Severe gap: 40-point penalty (mirrors Gemini prompt Rule #1)
      yoePenalty = 40;
      yoeNote = `Experience Gap: Candidate has ~${candidateYoe} years total experience, but role requires ${requiredYoe}+ years`;
    } else if (gap >= 3) {
      // Moderate gap
      yoePenalty = 20;
      yoeNote = `Experience Gap: Candidate has ~${candidateYoe} years experience; role prefers ${requiredYoe}+ years`;
    } else if (gap >= 1) {
      yoePenalty = 10;
      yoeNote = `Minor experience gap: Candidate has ~${candidateYoe} years; role asks for ${requiredYoe}+ years`;
    }
  }

  let hash = 0;
  for (let i = 0; i < job.title.length; i++) {
    hash = (hash << 5) - hash + job.title.charCodeAt(i);
    hash |= 0;
  }
  const variance = (Math.abs(hash) % 11) - 5;
  const finalScore = Math.min(96, Math.max(10, baseScore + variance - locationPenalty - yoePenalty));

  let matchLevel: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched' = 'Good Match';
  if (finalScore >= 80) matchLevel = 'Strong Match';
  else if (finalScore >= 60) matchLevel = 'Good Match';
  else if (finalScore >= 40) matchLevel = 'Weak Match';
  else matchLevel = 'Unmatched';

  const reasons = [
    `Role title and seniority (${job.title}) align with candidate engineering background.`,
    `Matched core skills: ${matchedSkills.length > 0 ? matchedSkills.join(", ") : "TypeScript, React, Node.js"}.`
  ];

  if (locationNote) {
    reasons.push(locationNote);
  }
  if (yoeNote) {
    reasons.push(yoeNote);
  }

  const missingList = [...missingSkills];
  if (locationNote) {
    missingList.unshift(`Location: ${job.location}`);
  }
  if (yoeNote) {
    missingList.unshift(yoeNote);
  }

  const noteSuffix = [locationNote ? '[Location penalty]' : '', yoeNote ? '[YOE penalty]' : ''].filter(Boolean).join(' ');
  return {
    score: finalScore,
    match_level: matchLevel,
    summary: `The position of ${job.title} at ${job.company} (${job.location}) shows a ${finalScore}% match against candidate qualifications${noteSuffix ? ' ' + noteSuffix : ''}.`,
    reasons,
    missing_skills: missingList,
    recommended_actions: [
      `Tailor resume summary to emphasize experience with ${matchedSkills.slice(0, 2).join(" and ") || "web engineering"}.`,
      `Apply directly via LinkedIn link or official company career portal.`
    ]
  };
}

function saveJobsDB(jobs: Job[], profileId?: string): void {
  const pid = profileId || getActiveProfileId();
  const profilePath = getProfileJobsPath(pid);
  const jsonContent = JSON.stringify(jobs, null, 2);

  writeFileIfChanged(profilePath, jsonContent);

  // Sync to root JOBS_DB_PATH if saving for active profile
  if (pid === getActiveProfileId()) {
    writeFileIfChanged(JOBS_DB_PATH, jsonContent);
  }
}

function generateMarkdownReport(jobs: Job[], profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const config = loadConfig();
  const minThreshold = config.minimum_score || 65;

  const evaluatedJobs = jobs.filter((j) => j.status === "evaluated" || j.score !== undefined);
  const strongMatches = evaluatedJobs.filter((j) => (j.score || 0) >= 80);
  const goodMatches = evaluatedJobs.filter((j) => (j.score || 0) >= 60 && (j.score || 0) < 80);
  const weakMatches = evaluatedJobs.filter((j) => (j.score || 0) < 60);

  const timestamp = new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "medium" });

  let md = `# 🎯 Job Radar AI - Pipeline Evaluation Report\n\n`;
  md += `**Generated:** ${timestamp}\n`;
  md += `**Minimum Score Threshold for Listing Links:** \`${minThreshold}%\`\n\n`;
  md += `**Summary Metrics:**\n`;
  md += `- **Total Jobs Scanned:** ${jobs.length}\n`;
  md += `- **Evaluated Jobs:** ${evaluatedJobs.length}\n`;
  md += `- **🔥 Strong Matches (Score ≥ 80):** ${strongMatches.length}\n`;
  md += `- **👍 Good Matches (60 - 79):** ${goodMatches.length}\n`;
  md += `- **⚠️ Weak Matches (< 60):** ${weakMatches.length}\n\n`;
  md += `---\n\n`;

  const renderSection = (title: string, list: Job[], emoji: string) => {
    let sectionMd = `## ${emoji} ${title} (${list.length})\n\n`;
    if (list.length === 0) {
      sectionMd += `*No jobs in this category.*\n\n`;
      return sectionMd;
    }
    list.forEach((job, idx) => {
      const score = job.score || 0;
      const meetsThreshold = score >= minThreshold;

      sectionMd += `### ${idx + 1}. ${job.title} @ **${job.company}**\n`;
      sectionMd += `- **Match Score:** \`${score}/100\` (${job.match_level})\n`;
      sectionMd += `- **Location:** ${job.location}\n`;
      sectionMd += `- **Posted:** ${job.posted_time} | **ATS Provider:** ${job.provider}\n`;

      if (meetsThreshold) {
        sectionMd += `- **Listing Link:** [🔗 View Job Posting](${job.url})\n\n`;
      } else {
        sectionMd += `- **Listing Link:** *(Omitted — match score ${score}% is below threshold of ${minThreshold}%)*\n\n`;
      }

      if (job.summary) {
        sectionMd += `**AI Match Summary:**\n> ${job.summary}\n\n`;
      }
      if (job.reasons && job.reasons.length > 0) {
        sectionMd += `**Key Match Reasons:**\n`;
        job.reasons.forEach((r) => (sectionMd += `- ✅ ${r}\n`));
        sectionMd += `\n`;
      }
      if (job.missing_skills && job.missing_skills.length > 0) {
        sectionMd += `**Identified Skill Gaps / Missing Items:**\n`;
        job.missing_skills.forEach((s) => (sectionMd += `- ⚠️ ${s}\n`));
        sectionMd += `\n`;
      }
      if (job.recommended_actions && job.recommended_actions.length > 0) {
        sectionMd += `**Recommended Next Steps:**\n`;
        job.recommended_actions.forEach((a) => (sectionMd += `- 💡 ${a}\n`));
        sectionMd += `\n`;
      }
      sectionMd += `---\n\n`;
    });
    return sectionMd;
  };

  md += renderSection("Strong Matches", strongMatches, "🔥");
  md += renderSection("Good Matches", goodMatches, "👍");
  md += renderSection("Weak Matches", weakMatches, "⚠️");

  // Write to profile report path
  const profileReportPath = getProfileReportPath(pid);
  fs.writeFileSync(profileReportPath, md, "utf-8");

  // Sync to root REPORT_PATH if active profile
  if (pid === getActiveProfileId()) {
    fs.writeFileSync(REPORT_PATH, md, "utf-8");
  }

  // Save timestamped history report in output/profiles/<profileId>/reports/
  // Only write when there are actual evaluated jobs — skip empty/zero-result runs.
  try {
    if (evaluatedJobs.length > 0) {
      const profileReportsDir = getProfileReportsDir(pid);
      const store = loadProfilesData();
      const profileObj = store.profiles.find((p) => p.id === pid);
      const profileName = profileObj ? profileObj.name : "Report";
      const cleanProfileName = profileName
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateFormatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const historyFilename = `report_${cleanProfileName || "scan"}_${dateFormatted}.md`;
      const historyFile = path.join(profileReportsDir, historyFilename);
      fs.writeFileSync(historyFile, md, "utf-8");
    }
  } catch (err) {
    console.error("Error saving historical report file:", err);
  }

  return md;
}

// Initialize Gemini Client (lazy getter)
let isApiKeyKnownInvalid = false;

function hasValidApiKey(): boolean {
  if (isApiKeyKnownInvalid) return false;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed === "MY_GEMINI_API_KEY" || trimmed.startsWith("MY_") || trimmed.length < 15) {
    return false;
  }
  return true;
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !hasValidApiKey()) {
    throw new Error("GEMINI_API_KEY is not valid or not configured in environment variables.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API Routes

// 0. Profile Endpoints
app.get("/api/profiles", (req, res) => {
  const store = loadProfilesData();
  res.json(store);
});

app.post("/api/profiles/select", (req, res) => {
  const { profileId } = req.body;
  const store = loadProfilesData();
  const target = store.profiles.find((p) => p.id === profileId);
  if (!target) {
    return res.status(404).json({ error: "Profile not found" });
  }

  store.activeProfileId = profileId;
  saveProfilesData(store);

  // Sync to config files & resume file
  saveConfig(target.config);
  writeFileIfChanged(RESUME_PATH, target.resume.content);

  // Sync profile's jobs database & report
  const profileJobs = loadJobsDB(profileId);
  saveJobsDB(profileJobs, profileId);
  const reportMd = generateMarkdownReport(profileJobs, profileId);

  const updatedStore = loadProfilesData();
  res.json({
    success: true,
    activeProfileId: updatedStore.activeProfileId,
    profiles: updatedStore.profiles,
    activeProfile: target,
    config: target.config,
    resume: loadResume(),
    jobs: profileJobs,
    report: reportMd,
  });
});

app.post("/api/profiles", (req, res) => {
  const { name, copyFromProfileId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Profile name is required" });
  }

  const store = loadProfilesData();
  let baseConfig = loadConfig();
  let baseResumeContent = loadResume().content;
  let baseJobs: Job[] = [];

  if (copyFromProfileId) {
    const source = store.profiles.find((p) => p.id === copyFromProfileId);
    if (source) {
      baseConfig = JSON.parse(JSON.stringify(source.config));
      baseResumeContent = source.resume.content;
      baseJobs = JSON.parse(JSON.stringify(loadJobsDB(copyFromProfileId)));
    }
  }

  const newId = `profile-${Date.now()}`;
  const parsedResume = parseResumeDetails(baseResumeContent, baseConfig.skills);
  const newProfile: UserProfileData = {
    id: newId,
    name: name.trim(),
    config: baseConfig,
    resume: parsedResume,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.profiles.push(newProfile);
  store.activeProfileId = newId;
  saveProfilesData(store);

  // Sync to config, resume, jobs and report files
  saveConfig(baseConfig);
  writeFileIfChanged(RESUME_PATH, baseResumeContent);
  saveJobsDB(baseJobs, newId);
  const reportMd = generateMarkdownReport(baseJobs, newId);

  const updatedStore = loadProfilesData();
  res.json({
    success: true,
    activeProfileId: updatedStore.activeProfileId,
    profiles: updatedStore.profiles,
    activeProfile: newProfile,
    config: baseConfig,
    resume: loadResume(),
    jobs: baseJobs,
    report: reportMd,
  });
});

app.put("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;
  const { name, config: newConfig, resumeContent } = req.body;

  const store = loadProfilesData();
  const index = store.profiles.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Profile not found" });
  }

  const existing = store.profiles[index];
  if (name !== undefined && name.trim()) {
    existing.name = name.trim();
  }
  if (newConfig) {
    existing.config = newConfig;
  }
  if (resumeContent !== undefined) {
    existing.resume = await parseResumeDetailsEnriched(resumeContent, existing.config.skills);
  }
  existing.updatedAt = new Date().toISOString();

  store.profiles[index] = existing;
  saveProfilesData(store);

  // If this is the active profile, sync to files
  if (id === store.activeProfileId) {
    if (newConfig) saveConfig(newConfig);
    if (resumeContent !== undefined) await saveResume(resumeContent);
  }

  const updatedStore = loadProfilesData();
  const activePid = updatedStore.activeProfileId;
  const activeJobs = loadJobsDB(activePid);

  res.json({
    success: true,
    activeProfileId: updatedStore.activeProfileId,
    profiles: updatedStore.profiles,
    activeProfile: existing,
    config: loadConfig(),
    resume: loadResume(),
    jobs: activeJobs,
  });
});

app.delete("/api/profiles/:id", (req, res) => {
  const { id } = req.params;
  const store = loadProfilesData();

  if (store.profiles.length <= 1) {
    return res.status(400).json({ error: "Cannot delete the last remaining profile" });
  }

  const index = store.profiles.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Profile not found" });
  }

  store.profiles.splice(index, 1);

  // Clean up profile database/report directories if exist
  try {
    const pJobsDir = path.join(process.cwd(), "database", "profiles", id);
    if (fs.existsSync(pJobsDir)) fs.rmSync(pJobsDir, { recursive: true, force: true });
    const pReportDir = path.join(process.cwd(), "output", "profiles", id);
    if (fs.existsSync(pReportDir)) fs.rmSync(pReportDir, { recursive: true, force: true });
  } catch (err) {
    console.error("Error cleaning up profile data directory:", err);
  }

  if (store.activeProfileId === id) {
    store.activeProfileId = store.profiles[0].id;
    const newActive = store.profiles[0];
    saveConfig(newActive.config);
    writeFileIfChanged(RESUME_PATH, newActive.resume.content);
  }

  saveProfilesData(store);

  const activePid = store.activeProfileId;
  const activeJobs = loadJobsDB(activePid);
  saveJobsDB(activeJobs, activePid);
  const reportMd = generateMarkdownReport(activeJobs, activePid);

  const updatedStore = loadProfilesData();
  res.json({
    success: true,
    activeProfileId: updatedStore.activeProfileId,
    profiles: updatedStore.profiles,
    config: loadConfig(),
    resume: loadResume(),
    jobs: activeJobs,
    report: reportMd,
  });
});

// 1. Config Endpoints
app.get("/api/config", (req, res) => {
  res.json(loadConfig());
});

app.post("/api/config", (req, res) => {
  const config = req.body as AppConfig;
  saveConfig(config);
  res.json({ success: true, config });
});

// 2. Resume Endpoints
app.get("/api/resume", (req, res) => {
  res.json(loadResume());
});

app.post("/api/resume", async (req, res) => {
  const { content } = req.body;
  const resume = await saveResume(content || "");
  res.json({ success: true, resume });
});

// Dedicated skill re-extraction endpoint — runs Gemini on the provided content
// and persists the updated skills to profiles.json without rewriting resume.md.
app.post("/api/resume/extract-skills", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "No resume content provided." });
    }

    const config = loadConfig();
    console.log("[RESUME] Starting Gemini skill extraction via /api/resume/extract-skills...");
    const skills = await extractSkillsWithGemini(content, config.skills);
    console.log(`[RESUME] Extraction complete — ${skills.length} skills: ${skills.slice(0, 8).join(", ")}...`);

    // Persist updated skills to the active profile without touching resume.md
    try {
      if (fs.existsSync(PROFILES_JSON_PATH)) {
        const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
        const active = store.profiles.find((p) => p.id === store.activeProfileId);
        if (active) {
          active.resume = { ...active.resume, parsedSkills: skills };
          active.updatedAt = new Date().toISOString();
          saveProfilesData(store);
        }
      }
    } catch (syncErr) {
      console.error("[RESUME] Failed to sync skills to profiles.json:", syncErr);
    }

    res.json({ success: true, skills });
  } catch (err: any) {
    console.error("[RESUME] extract-skills error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/resume/parse-pdf", async (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF base64 payload provided." });
    }

    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
    const pdfBuffer = Buffer.from(cleanBase64, "base64");

    // 1. Extract raw PDF text using pdf-parse
    let extractedPdfText = "";
    try {
      extractedPdfText = await extractTextFromPdf(pdfBuffer);
    } catch (pdfErr: any) {
      console.warn("pdf-parse extraction warning:", pdfErr.message);
    }

    let extractedMarkdown = "";

    // 2. If Gemini API Key is configured and valid, use Gemini to format the text into clean Markdown
    if (hasValidApiKey()) {
      try {
        const ai = getGeminiClient();
        const userPrompt = `You are an expert ATS resume parser. Convert and format this candidate PDF resume document (${filename || 'resume.pdf'}) into clean, complete, beautifully structured Markdown text.

CRITICAL INSTRUCTION FOR EXPERIENCE COMPUTATION:
1. Carefully calculate the total years of professional work experience from the candidate's employment timeline.
2. Explicitly place this line near the top of the resume under candidate contact/summary header:
   **Total Professional Experience:** ~X Years (YYYY-Present)
3. Include full candidate name, contact info, professional summary, work history with all bullet points, projects, education, and technical skills. Preserve all facts, technologies, dates, and metrics verbatim.
4. Return ONLY raw Markdown content without code block backticks or metadata commentary.`;

        const parts: any[] = extractedPdfText
          ? [{ text: `${userPrompt}\n\n=== RAW EXTRACTED RESUME TEXT ===\n${extractedPdfText}` }]
          : [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: cleanBase64,
                },
              },
              { text: userPrompt },
            ];

        const response = await ai.models.generateContent({
          model: loadConfig().gemini_model || "gemini-3.1-flash-lite",
          contents: [{ role: "user", parts }],
        });

        extractedMarkdown = response.text || "";
        extractedMarkdown = extractedMarkdown.replace(/^```markdown\n?/i, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
      } catch (aiErr: any) {
        const errMsg = aiErr?.message || String(aiErr);
        if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
          isApiKeyKnownInvalid = true;
          console.log("Notice: Gemini API key invalid. Using direct PDF text parsing fallback.");
        } else {
          console.log("Notice: PDF formatting fallback to direct text extraction.");
        }
      }
    }

    // 3. Fallback: If Gemini was not used or failed, use the complete extracted text directly from pdf-parse
    if (!extractedMarkdown && extractedPdfText) {
      extractedMarkdown = `# ${filename ? filename.replace(/\.pdf$/i, "") : "Uploaded Resume"}\n\n` +
        `*Parsed directly from PDF text layer (${new Date().toISOString().split("T")[0]})*\n\n---\n\n` +
        extractedPdfText;
    } else if (!extractedMarkdown) {
      extractedMarkdown = `# Uploaded Resume (${filename || "resume.pdf"})\n\nUnable to extract text layer from PDF file.`;
    }

    // 4. Ensure Total Professional Experience is explicitly highlighted in the Markdown
    const expInfo = extractExperienceInfo(extractedPdfText || extractedMarkdown);
    if (extractedMarkdown) {
      if (/Total Professional Experience/i.test(extractedMarkdown)) {
        extractedMarkdown = extractedMarkdown.replace(
          /- \*\*Total Professional Experience:\*\*.*$/m,
          `- **Total Professional Experience:** ${expInfo.yearsStr}`
        );
      } else {
        const lines = extractedMarkdown.split("\n");
        const titleIdx = lines.findIndex((l) => l.startsWith("#"));
        const experienceBadge = `\n- **Total Professional Experience:** ${expInfo.yearsStr}\n`;
        if (titleIdx >= 0) {
          lines.splice(titleIdx + 1, 0, experienceBadge);
          extractedMarkdown = lines.join("\n");
        } else {
          extractedMarkdown = `# Candidate Resume\n${experienceBadge}\n` + extractedMarkdown;
        }
      }
    }

    const resume = await saveResume(extractedMarkdown);
    res.json({ success: true, resume, extractedMarkdown, rawTextLength: extractedPdfText.length });
  } catch (err: any) {
    console.error("PDF Resume parse error:", err);
    res.status(500).json({ error: "Failed to parse PDF resume: " + err.message });
  }
});

// 3. Jobs DB Endpoints
app.get("/api/jobs", (req, res) => {
  const jobs = loadJobsDB();
  res.json(jobs);
});

app.post("/api/jobs", (req, res) => {
  const newJob = req.body as Job;
  const jobs = loadJobsDB();
  const index = jobs.findIndex((j) => j.id === newJob.id);
  if (index >= 0) {
    jobs[index] = { ...jobs[index], ...newJob };
  } else {
    jobs.unshift(newJob);
  }
  saveJobsDB(jobs);
  res.json({ success: true, job: newJob });
});

app.delete("/api/jobs/:id", (req, res) => {
  const { id } = req.params;
  let jobs = loadJobsDB();
  jobs = jobs.filter((j) => j.id !== id);
  saveJobsDB(jobs);
  res.json({ success: true });
});

app.post("/api/jobs/reset", (req, res) => {
  saveJobsDB([]);
  generateMarkdownReport([]);
  res.json({ success: true, jobs: [] });
});

// Helper for unified Gemini evaluation across single-job evaluate and pipeline scans
async function evaluateJobWithGemini(
  job: Job,
  resumeContent: string,
  configObj: AppConfig
): Promise<{
  score: number;
  match_level: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched';
  summary: string;
  reasons: string[];
  missing_skills: string[];
  recommended_actions: string[];
  model_used: string;
}> {
  const selectedModel = configObj.gemini_model || "gemini-3.1-flash-lite";

  if (!hasValidApiKey()) {
    const resumeParsed = parseResumeDetails(resumeContent, configObj.skills);
    const heur = generateHeuristicEvaluation(
      job,
      resumeParsed,
      configObj
    );
    return { ...heur, model_used: "ATS Heuristic Engine" };
  }

  try {
    const ai = getGeminiClient();
    const prompt = `You are the AI Matcher engine in Job Radar AI. Evaluate the job posting against the candidate's resume and return a structured match evaluation.

=== CANDIDATE RESUME ===
${resumeContent}

=== TARGET SALARY ===
${configObj.min_salary || 200000} ${configObj.salary_currency || 'USD'} (Includes postings where disclosed salary range reaches or exceeds target)

=== PREFERRED LOCATIONS ===
${configObj.locations && configObj.locations.length > 0 ? configObj.locations.join(", ") : "Any"}

=== JOB POSTING ===
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary Disclosed: ${job.salary || "Not disclosed"}
Description:
${job.description}

EVALUATION & SCORING RULES:
1. CRITICAL YEARS OF EXPERIENCE (YoE) COMPARISON RULE — apply this FIRST before all other scoring:
   - Carefully compute the candidate's total professional work experience in years from the resume timeline (e.g., start year of first job to present).
   - Extract the required minimum experience from the job posting (e.g., "8+ years required", "10+ years experience", "12+ years required").
   - Apply the following MANDATORY deductions based on the gap (required YoE minus candidate YoE):
     * Gap of 1-2 years: deduct 10 points
     * Gap of 3-4 years: deduct 25 points, set match_level to at most 'Good Match'
     * Gap of 5-7 years: deduct 40 points, set match_level to 'Weak Match'
     * Gap of 8+ years: deduct 55 points, set match_level to 'Unmatched'
   - These deductions are NON-NEGOTIABLE. Do NOT offset them with skill alignment bonuses.
   - You MUST explicitly list the experience gap in missing_skills (e.g., "Experience Gap: Candidate has ~5 years total experience, but role requires 12+ years").
   - EXAMPLE: If candidate has 5 years and job requires 12 years → gap is 7 years → deduct 40 points → 'Weak Match' regardless of skill overlap.

2. SALARY & LOCATION ALIGNMENT:
   - If job location (${job.location}) is outside preferred locations (${configObj.locations ? configObj.locations.join(", ") : "Any"}), deduct 20-25 points and note the location mismatch.
   - If disclosed salary is below minimum target (${configObj.min_salary || 200000}), note the salary gap.

3. TECHNICAL & SKILLS ALIGNMENT:
   - Analyze overlap in core technologies, domain expertise, and responsibilities.
   - Skill alignment bonuses should be moderate (max +15 points total) and cannot override a YoE penalty.

Return JSON object matching schema:
- score: integer (0-100)
- match_level: "Strong Match" (>=80) | "Good Match" (60-79) | "Weak Match" (40-59) | "Unmatched" (<40)
- summary: 2-3 sentence executive match summary highlighting fit and any major experience or skill gaps
- reasons: 3-4 bullet strings of key alignments
- missing_skills: skills or qualifications the JOB REQUIRES that are absent or unclear in the candidate's resume. Do NOT list skills the candidate has just because they aren't mentioned in the job description. Only list genuine gaps where the job explicitly or implicitly requires something the resume does not demonstrate.
- recommended_actions: 2-3 actionable advice strings for candidate application`;

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        temperature: 0.2, // Low temperature for deterministic & repeatable scoring
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: "Match score from 0 to 100" },
            match_level: {
              type: Type.STRING,
              description: "Strong Match | Good Match | Weak Match | Unmatched",
            },
            summary: { type: Type.STRING, description: "2-3 sentence executive match summary" },
            reasons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Bullet list of matching skills, experience, or alignments",
            },
            missing_skills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Identified skill gaps, technical missing items, or YoE gap",
            },
            recommended_actions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Concrete next steps for applying or tailoring the resume",
            },
          },
          required: ["score", "match_level", "summary", "reasons", "missing_skills", "recommended_actions"],
        },
      },
    });

    const resObj = JSON.parse(response.text || "{}");
    if (resObj && typeof resObj.score === "number") {
      return {
        ...resObj,
        model_used: selectedModel,
      };
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
      isApiKeyKnownInvalid = true;
      console.log("Notice: Gemini API key invalid or inactive. Falling back to ATS Heuristic Engine.");
    } else {
      console.log("Notice: Gemini evaluation fallback to ATS Heuristic Engine.");
    }
  }

  const resumeParsed = parseResumeDetails(resumeContent, configObj.skills);
  const heur = generateHeuristicEvaluation(
    job,
    resumeParsed,
    configObj
  );
  return { ...heur, model_used: "ATS Heuristic Fallback" };
}

// 4. Gemini Matcher AI Endpoint
app.post("/api/jobs/evaluate", async (req, res) => {
  try {
    const { jobId, job: inputJob, resume: inputResume } = req.body;
    let jobToEval: Job;
    const allJobs = loadJobsDB();

    if (jobId) {
      const found = allJobs.find((j) => j.id === jobId);
      if (found) {
        jobToEval = found;
      } else if (inputJob) {
        jobToEval = inputJob;
      } else {
        return res.status(404).json({ error: "Job not found" });
      }
    } else if (inputJob) {
      jobToEval = inputJob;
    } else {
      return res.status(400).json({ error: "Job ID or Job object required" });
    }

    const activeProfileData = loadProfilesData().profiles.find(p => p.id === getActiveProfileId());
    const resumeObj = activeProfileData?.resume ?? loadResume();
    const configObj = loadConfig();
    const resumeText = inputResume || resumeObj.content;

    const evalData = await evaluateJobWithGemini(jobToEval, resumeText, configObj);

    // Update job in database
    const updatedJob: Job = {
      ...jobToEval,
      score: evalData.score,
      match_level: evalData.match_level,
      summary: evalData.summary,
      reasons: evalData.reasons,
      missing_skills: evalData.missing_skills,
      recommended_actions: evalData.recommended_actions,
      model_used: evalData.model_used,
      processed_at: new Date().toISOString(),
      status: "evaluated",
    };

    const updatedJobsList = allJobs.map((j) => (j.id === updatedJob.id ? updatedJob : j));
    if (!allJobs.some((j) => j.id === updatedJob.id)) {
      updatedJobsList.unshift(updatedJob);
    }
    saveJobsDB(updatedJobsList);
    generateMarkdownReport(updatedJobsList);

    return res.json({ success: true, evaluation: evalData, job: updatedJob });
  } catch (error: any) {
    console.error("Evaluation error:", error);
    return res.status(500).json({ error: error.message || "Failed to evaluate job" });
  }
});

// 5. Full Pipeline Runner Endpoint (`python run.py` simulation & execution)
app.post("/api/pipeline/cancel", (req, res) => {
  activePipelineCancelled = true;
  res.json({ success: true, message: "Pipeline cancellation requested." });
});

app.post("/api/pipeline/run", async (req, res) => {
  activePipelineCancelled = false;
  const isCancelled = () => req.destroyed || activePipelineCancelled;

  const logs: PipelineLog[] = [];
  const addLog = (stage: PipelineLog["stage"], message: string, details?: string) => {
    logs.push({
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      stage,
      message,
      details,
    });
  };

  try {
    addLog("CONFIG", "Loading runtime configuration from config/config.yaml...");
    const config = loadConfig();
    const activeCompanies = config.companies.filter((c) => c.enabled);
    const targetRoles = config.target_roles && config.target_roles.length > 0
      ? config.target_roles
      : ["Software Engineer", "Full Stack AI Engineer"];

    addLog(
      "CONFIG",
      `Loaded configuration: ${activeCompanies.length > 0 ? `${activeCompanies.length} active company target providers` : 'Open Web Search Mode (no company restrictions)'} across ${targetRoles.length} search role queries`,
      `Companies: ${activeCompanies.length > 0 ? activeCompanies.map((c) => `${c.name} (${c.provider})`).join(", ") : "All Open Web ATS Providers"} | Roles: ${targetRoles.join(", ")}`
    );

    if (isCancelled()) {
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user.", logs });
    }

    addLog("RESUME", "Loading candidate resume...");
    const activeProfileData = loadProfilesData().profiles.find(p => p.id === getActiveProfileId());
    const resume = activeProfileData?.resume ?? loadResume();
    addLog("RESUME", `Resume loaded: "${resume.title}"`, `Skills detected: ${resume.parsedSkills.slice(0, 6).join(", ")}...`);

    let tfParam = "r86400";
    let tfLabel = "Last 24 Hours (f_TPR=r86400)";
    if (config.time_filter_value && config.time_filter_unit) {
      const val = config.time_filter_value;
      const unit = config.time_filter_unit;
      const mult: Record<string, number> = { hours: 3600, days: 86400, weeks: 604800, months: 2592000 };
      const secs = val * (mult[unit] || 3600);
      tfParam = `r${secs}`;
      tfLabel = `${val} ${unit.charAt(0).toUpperCase() + unit.slice(1)} (f_TPR=r${secs})`;
    } else if (config.linkedin_time_filter === 'past_month') {
      tfParam = 'r2592000';
      tfLabel = 'Past Month (f_TPR=r2592000)';
    } else if (config.linkedin_time_filter === 'past_week') {
      tfParam = 'r604800';
      tfLabel = 'Past Week (f_TPR=r604800)';
    } else if (config.linkedin_time_filter === 'past_24h') {
      tfParam = 'r86400';
      tfLabel = 'Last 24 Hours (f_TPR=r86400)';
    } else if (config.lookback_hours && config.lookback_hours > 0) {
      const secs = config.lookback_hours * 3600;
      tfParam = `r${secs}`;
      tfLabel = `Custom ${config.lookback_hours} Hours (f_TPR=r${secs})`;
    }

    const preferredLocs = config.locations || [];
    addLog("SCANNER", `Launching Live Job Scanner [Filter: ${tfLabel}] for roles [${targetRoles.join(", ")}] across ${activeCompanies.length} target companies (Locations: ${preferredLocs.length > 0 ? preferredLocs.join(", ") : "Any"})...`);
    const previousJobsDB = loadJobsDB();

    if (isCancelled()) {
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user.", logs });
    }

    // Fetch live job postings from LinkedIn Guest API for active company providers & preferred locations
    const liveCandidates = await fetchLiveLinkedInJobs(activeCompanies, targetRoles, preferredLocs, tfParam, isCancelled);

    if (isCancelled()) {
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user.", logs });
    }

    addLog("SCANNER", `Discovered ${liveCandidates.length} live job posting(s) matching your configured target company providers and preferred locations (${preferredLocs.join(", ") || "Any"}).`);

    const ts = Date.now().toString().slice(-5);
    // Map latest scan candidates, preserving scores/evaluations if job was previously evaluated
    const latestScanJobs: Job[] = liveCandidates.map((c, idx) => {
      const jobIdM = c.url.match(/\/view\/(\d+)\//);
      const jobId = jobIdM ? jobIdM[1] : `${ts}-${idx}`;
      const id = `li-${jobId}`;

      const prev = previousJobsDB.find((j) => j.id === id || j.url === c.url);

      // Only reuse a previous evaluation if the stored description is real (not a placeholder).
      // If the description is the generic fallback, treat the job as new so it gets
      // re-fetched and re-evaluated with the actual job description.
      const isPlaceholderDescription = (desc?: string) =>
        !desc || desc.includes("Key requirements include software engineering, system architecture");

      if (prev && prev.score !== undefined && !isPlaceholderDescription(prev.description)) {
        return {
          ...c,
          id,
          score: prev.score,
          match_level: prev.match_level,
          summary: prev.summary,
          reasons: prev.reasons,
          missing_skills: prev.missing_skills,
          recommended_actions: prev.recommended_actions,
          processed_at: prev.processed_at,
          status: prev.status || "evaluated",
        };
      }

      return {
        ...c,
        id,
      };
    });

    addLog("NORMALIZER", `Normalized ${latestScanJobs.length} posting(s) from the latest scan.`);

    let existingJobs = latestScanJobs;

    // Identify all jobs needing evaluation (newly discovered or un-evaluated)
    const jobsNeedingEval = existingJobs.filter((j) => j.status === "new" || j.score === undefined);
    let evaluatedJobsCount = 0;

    if (config.auto_evaluate && jobsNeedingEval.length > 0) {
      const selectedModel = config.gemini_model || "gemini-3.1-flash-lite";
      addLog("GEMINI_AI", `Evaluating ${jobsNeedingEval.length} un-evaluated job(s) with AI Matcher engine (Model: ${selectedModel})...`);

      for (const job of jobsNeedingEval) {
        if (isCancelled()) {
          return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user. No results were saved.", logs });
        }

        addLog("GEMINI_AI", `Evaluating job fit: ${job.title} @ ${job.company} [${selectedModel}]...`);
        const resData = await evaluateJobWithGemini(job, resume.content, config);

        job.score = resData.score;
        job.match_level = resData.match_level;
        job.summary = resData.summary;
        job.reasons = resData.reasons;
        job.missing_skills = resData.missing_skills;
        job.recommended_actions = resData.recommended_actions;
        job.model_used = resData.model_used;
        job.processed_at = new Date().toISOString();
        job.status = "evaluated";
        evaluatedJobsCount++;
      }
    } else if (jobsNeedingEval.length > 0) {
      if (!config.auto_evaluate) {
        addLog("GEMINI_AI", "Automatic evaluation is disabled in Pipeline Settings. New jobs saved as 'Un-evaluated'.");
      }
    } else {
      addLog("GEMINI_AI", "All tracked postings up to date. Skipping evaluation.");
    }

    if (isCancelled()) {
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user. No results were saved.", logs });
    }

    // Save to database only on successful full completion
    saveJobsDB(existingJobs);

    addLog("REPORT", "Generating Markdown report output/report.md...");
    const reportMd = generateMarkdownReport(existingJobs);

    addLog("SUCCESS", "Pipeline execution finished successfully! Database and output/report.md updated.");

    const summaryText = existingJobs.length > 0
      ? `Scan complete. Found ${existingJobs.length} live job posting(s) for latest scan and evaluated ${evaluatedJobsCount} job(s) with Gemini AI.`
      : `Scan complete. No postings matched configured criteria in the selected lookback window.`;

    res.json({
      success: true,
      logs,
      newJobsCount: existingJobs.length,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: existingJobs.length,
      summary: summaryText,
      reportPath: "output/report.md",
    });
  } catch (error: any) {
    addLog("ERROR", `Pipeline execution failed: ${error.message}`);
    res.status(500).json({ success: false, logs, error: error.message });
  }
});

// 6. Report Endpoints
app.delete("/api/reports", (req, res) => {
  try {
    const pid = getActiveProfileId();
    const profileReportsDir = getProfileReportsDir(pid);
    const profileReportPath = getProfileReportPath(pid);

    // Delete all report files in profile reports directory
    if (fs.existsSync(profileReportsDir)) {
      const files = fs.readdirSync(profileReportsDir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          fs.unlinkSync(path.join(profileReportsDir, file));
        }
      }
    }

    // Delete profile main report.md
    if (fs.existsSync(profileReportPath)) {
      fs.unlinkSync(profileReportPath);
    }

    // Clean root REPORTS_DIR & REPORT_PATH if default profile
    if (pid === "default") {
      if (fs.existsSync(REPORTS_DIR)) {
        const files = fs.readdirSync(REPORTS_DIR);
        for (const file of files) {
          if (file.endsWith(".md")) {
            fs.unlinkSync(path.join(REPORTS_DIR, file));
          }
        }
      }
      if (fs.existsSync(REPORT_PATH)) {
        fs.unlinkSync(REPORT_PATH);
      }
    }

    res.json({ success: true, message: "All generated reports cleared successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports", (req, res) => {
  try {
    const pid = getActiveProfileId();
    const profileReportsDir = getProfileReportsDir(pid);
    const reports: Array<{
      id: string;
      filename: string;
      createdAt: string;
      title: string;
      sizeBytes: number;
    }> = [];

    // ONLY scan active profile's reports directory to prevent cross-profile report leakage
    if (fs.existsSync(profileReportsDir)) {
      const files = fs.readdirSync(profileReportsDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const fullPath = path.join(profileReportsDir, file);
        const stats = fs.statSync(fullPath);

        let prettyTitle = file;
        const matchWithProfile = file.match(/^report_(.+)_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.md$/);
        const matchStandard = file.match(/^report_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.md$/);

        if (matchWithProfile) {
          const profTag = matchWithProfile[1].replace(/_/g, " ");
          const dateStr = matchWithProfile[2];
          const timeStr = `${matchWithProfile[3]}:${matchWithProfile[4]}:${matchWithProfile[5]}`;
          prettyTitle = `[${profTag}] Scan Report — ${dateStr} ${timeStr}`;
        } else if (matchStandard) {
          prettyTitle = `Scan Report — ${matchStandard[1]} ${matchStandard[2]}:${matchStandard[3]}:${matchStandard[4]}`;
        }

        reports.push({
          id: file,
          filename: file,
          createdAt: stats.mtime.toISOString(),
          title: prettyTitle,
          sizeBytes: stats.size,
        });
      }
    }

    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const activeProfileReportPath = getProfileReportPath(pid);
    if (reports.length === 0 && fs.existsSync(activeProfileReportPath)) {
      const stats = fs.statSync(activeProfileReportPath);
      reports.push({
        id: "latest",
        filename: "report.md",
        createdAt: stats.mtime.toISOString(),
        title: "Latest Scan Report",
        sizeBytes: stats.size,
      });
    }

    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const pid = getActiveProfileId();
    const profileReportPath = getProfileReportPath(pid);
    const profileReportsDir = getProfileReportsDir(pid);
    let filePath = profileReportPath;

    if (filename !== "latest" && filename !== "report.md") {
      const safeFilename = path.basename(filename);
      const pFile = path.join(profileReportsDir, safeFilename);
      const rootFile = path.join(REPORTS_DIR, safeFilename);
      if (fs.existsSync(pFile)) {
        filePath = pFile;
      } else if (fs.existsSync(rootFile)) {
        filePath = rootFile;
      } else {
        return res.status(404).json({ error: "Report file not found" });
      }
    } else {
      if (!fs.existsSync(filePath)) {
        if (fs.existsSync(REPORT_PATH)) {
          filePath = REPORT_PATH;
        } else {
          return res.status(404).json({ error: "Report file not found" });
        }
      }
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const stats = fs.statSync(filePath);

    res.json({
      filename: path.basename(filePath),
      content,
      createdAt: stats.mtime.toISOString(),
      path: `output/profiles/${pid}/reports/${path.basename(filePath)}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/reports/:filename", (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const pid = getActiveProfileId();
    const profileReportsDir = getProfileReportsDir(pid);
    const filePath = path.join(profileReportsDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Report not found" });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/report", (req, res) => {
  try {
    const pid = getActiveProfileId();
    const profileReportPath = getProfileReportPath(pid);
    let md = "";

    if (fs.existsSync(profileReportPath)) {
      md = fs.readFileSync(profileReportPath, "utf-8");
    } else if (fs.existsSync(REPORT_PATH)) {
      md = fs.readFileSync(REPORT_PATH, "utf-8");
    } else {
      const jobs = loadJobsDB(pid);
      md = generateMarkdownReport(jobs, pid);
    }
    res.json({ content: md, path: `output/profiles/${pid}/report.md` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite / Production Static Serving logic
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Job Radar AI Server running at http://localhost:${PORT}`);
  });
}

startServer();
