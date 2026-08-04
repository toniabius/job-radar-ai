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

function getProfileLogsPath(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "output", "profiles", pid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "pipeline_logs.json");
}

function saveProfilesData(store: ProfilesStore): void {
  writeFileIfChanged(PROFILES_JSON_PATH, JSON.stringify(store, null, 2));
}

function loadConfigRaw(): AppConfig {
  let loaded: AppConfig = DEFAULT_CONFIG;
  try {
    if (fs.existsSync(CONFIG_JSON_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, "utf-8"));
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
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      const active = store.profiles.find((p) => p.id === store.activeProfileId);
      if (active && active.config) {
        return active.config;
      }
    }
  } catch (err) {
    console.error("Error loading profile config:", err);
  }
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
        const currentSkills = active.resume?.parsedSkills || [];
        const newParsed = parseResumeDetails(active.resume.content, config.skills);
        // Preserve user-added or active skills
        if (currentSkills.length > 0) {
          newParsed.parsedSkills = Array.from(new Set([...currentSkills, ...newParsed.parsedSkills]));
        }
        active.resume = newParsed;
        active.updatedAt = new Date().toISOString();
        saveProfilesData(store);
      }
    }
  } catch (err) {
    console.error("Error syncing saveConfig to profiles.json:", err);
  }
}

let lastLinkedInReqTime = 0;

async function fetchLinkedInWithRetry(
  url: string,
  taskLabel: string,
  startPage: number,
  addLog?: (category: string, message: string, details?: string) => void,
  maxRetries = 3
): Promise<Response> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9"
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Inter-request pacing (~600ms gap) to prevent rate limits
    const now = Date.now();
    const scheduled = Math.max(now, lastLinkedInReqTime + 600);
    lastLinkedInReqTime = scheduled;
    const gap = scheduled - now;
    if (gap > 0) {
      await new Promise((r) => setTimeout(r, gap));
    }

    const res = await fetch(url, { headers });

    if (res.status !== 429) {
      return res;
    }

    // Exponential backoff + randomized jitter on 429
    if (attempt < maxRetries) {
      const baseDelay = Math.pow(2, attempt) * 2500; // 2.5s, 5s, 10s
      const jitter = Math.floor(Math.random() * 1500); // 0-1.5s randomized jitter
      const totalWait = baseDelay + jitter;

      if (addLog) {
        addLog(
          "SCANNER",
          `LinkedIn rate limited (429) for "${taskLabel}" at page start=${startPage} (Attempt ${attempt + 1}/${maxRetries + 1}). Backing off ${(totalWait / 1000).toFixed(1)}s before automatic retry...`,
          `LinkedIn Endpoint: ${url}`
        );
      }
      await new Promise((r) => setTimeout(r, totalWait));
    } else {
      return res; // Max retries reached
    }
  }

  return await fetch(url, { headers });
}

// Initial bootstrap load to create config files
loadConfig();

const ALL_GEMINI_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview"
];

const GEMINI_MODEL_DELAYS: Record<string, number> = {
  "gemini-3.1-flash-lite": 500,
  "gemini-3.5-flash-lite": 500,
  "gemini-3.5-flash": 1000,
  "gemini-3-flash-preview": 1000,
};

const lastGeminiCallTime: Record<string, number> = {};

async function enforceGeminiRateLimit(modelName: string) {
  const minInterval = GEMINI_MODEL_DELAYS[modelName] || 2000;
  const now = Date.now();
  const scheduledTime = Math.max(now, (lastGeminiCallTime[modelName] || 0) + minInterval);
  lastGeminiCallTime[modelName] = scheduledTime;

  const waitMs = scheduledTime - now;
  if (waitMs > 0) {
    console.log(`[GEMINI PACE] Waiting ${waitMs}ms before calling ${modelName} (${minInterval === 2000 ? '30' : '15'} RPM)...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/**
 * Uses Gemini to extract a deduplicated list of technical skills from resume text.
 * Falls back to regex matching if the API key is unavailable, rate-limited, or the call fails.
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

  const config = loadConfig();
  const primaryModel = config.gemini_model || "gemini-3.1-flash-lite";
  const candidateModels = [primaryModel, ...ALL_GEMINI_FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const model of candidateModels) {
    try {
      await enforceGeminiRateLimit(model);
      const ai = getGeminiClient();

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

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[RESUME] Gemini (${model}) extracted ${parsed.length} skills from resume.`);
        return parsed.map((s: any) => String(s).trim()).filter(Boolean);
      }
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED");
      if (isRateLimit) {
        console.log(`[RESUME] Gemini (${model}) rate limit reached (429), trying fallback...`);
      } else {
        console.log(`[RESUME] Gemini (${model}) skill extraction error, trying fallback...`);
      }
    }
  }

  console.log("[RESUME] Gemini skill extraction fallback to regex keyword parser.");
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
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      const active = store.profiles.find((p) => p.id === store.activeProfileId);
      if (active && active.resume) {
        return active.resume;
      }
    }
  } catch (err) {
    // fallback
  }
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
  const config = loadConfig();

  let jobs: Job[] = [];
  try {
    if (fs.existsSync(profilePath)) {
      jobs = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    } else if (pid === "default" && fs.existsSync(JOBS_DB_PATH)) {
      jobs = JSON.parse(fs.readFileSync(JOBS_DB_PATH, "utf-8"));
      writeFileIfChanged(profilePath, JSON.stringify(jobs, null, 2));
    } else {
      jobs = pid === "default" ? SAMPLE_JOBS : [];
      writeFileIfChanged(profilePath, JSON.stringify(jobs, null, 2));
      if (pid === getActiveProfileId()) {
        writeFileIfChanged(JOBS_DB_PATH, JSON.stringify(jobs, null, 2));
      }
    }
  } catch (err) {
    console.error(`Error reading jobs database for profile ${pid}:`, err);
    jobs = pid === "default" ? SAMPLE_JOBS : [];
  }

  // Sanitize loaded jobs against active profile locations
  if (config.locations && config.locations.length > 0) {
    return jobs.map((j) => sanitizeJobEvaluation(j, config.locations));
  }
  return jobs;
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
  if (isJobHybrid && prefLowerList.some((p) => p.includes("hybrid"))) return true;

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
    california: ["ca", "california", "california state", "san francisco", "santa clara", "los gatos", "los angeles", "san jose", "sunnyvale", "cupertino", "bay area", "fremont", "palo alto", "mountain view"],
    washington: ["wa", "washington", "washington state", "seattle", "redmond", "bellevue", "kirkland"],
    virginia: ["va", "virginia", "mclean", "reston", "arlington", "herndon", "tysons"],
    maryland: ["md", "maryland", "bethesda", "baltimore", "rockville"],
    "washington dc": ["dc", "washington dc", "washington d.c.", "washington, dc", "washington, d.c.", "district of columbia"],
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

function sanitizeJobEvaluation(job: Job, preferredLocations: string[]): Job {
  if (!job || !preferredLocations || preferredLocations.length === 0) return job;
  const isLocMatch = isLocationMatch(job.location, preferredLocations);
  if (!isLocMatch) return job;

  const locMismatchPattern = /location mismatch|prefers.*washington dc|role is (in|based in).*wa|candidate's current location and preference mismatch|geographic distance|conflicts with the candidate's preference/i;

  let cleanedReasons = job.reasons;
  if (Array.isArray(cleanedReasons)) {
    cleanedReasons = cleanedReasons.filter((r) => !locMismatchPattern.test(r));
  }

  let cleanedMissing = job.missing_skills;
  if (Array.isArray(cleanedMissing)) {
    cleanedMissing = cleanedMissing.filter((m) => !locMismatchPattern.test(m));
  }

  let cleanedSummary = job.summary;
  if (cleanedSummary) {
    const sentences = cleanedSummary.split(/(?<=[.!?])\s+/);
    const validSentences = sentences.filter((s) => {
      const lower = s.toLowerCase();
      if (
        (lower.includes("bellevue") || lower.includes("seattle") || lower.includes("washington dc") || lower.includes("location") || lower.includes("geographic")) &&
        (lower.includes("conflict") || lower.includes("mismatch") || lower.includes("distance") || lower.includes("prefers") || lower.includes("impacts"))
      ) {
        return false;
      }
      if (lower.includes("location mismatch")) return false;
      return true;
    });
    cleanedSummary = validSentences.join(" ").trim();
    if (!cleanedSummary && job.title && job.company) {
      cleanedSummary = `${job.title} at ${job.company} (${job.location}) aligns well with candidate profile and target requirements.`;
    }
  }

  let newScore = job.score;
  let newMatchLevel: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched' | undefined = job.match_level;

  if (newScore !== undefined && newScore < 80) {
    const hasHardBlocker =
      cleanedMissing?.some((m) => m.toLowerCase().includes("hard blocker")) ||
      cleanedReasons?.some((r) => r.toLowerCase().includes("hard blocker"));
    const hasYoeGap =
      cleanedMissing?.some((m) => m.toLowerCase().includes("experience gap") || m.toLowerCase().includes("yoe")) ||
      cleanedReasons?.some((r) => r.toLowerCase().includes("experience gap"));
    const hasOverQual =
      cleanedMissing?.some((m) => m.toLowerCase().includes("over-qualification")) ||
      cleanedReasons?.some((r) => r.toLowerCase().includes("over-qualification"));

    if (!hasHardBlocker && !hasYoeGap && !hasOverQual) {
      newScore = 85;
      newMatchLevel = "Strong Match";
    }
  }

  return {
    ...job,
    score: newScore,
    match_level: newMatchLevel,
    summary: cleanedSummary,
    reasons: cleanedReasons,
    missing_skills: cleanedMissing,
  };
}

let activePipelineCancelled = false;
let isPipelineRunning = false;
let currentPipelineLogs: PipelineLog[] = [];
let currentPipelineResult: {
  success?: boolean;
  cancelled?: boolean;
  newJobsCount?: number;
  evaluatedCount?: number;
  totalJobs?: number;
  totalScanned?: number;
  summary?: string;
} | null = null;

app.get("/api/pipeline/logs", (req, res) => {
  const profileId = getActiveProfileId();
  const logsPath = getProfileLogsPath(profileId);
  let savedLogs: PipelineLog[] = [];
  try {
    if (fs.existsSync(logsPath)) {
      savedLogs = JSON.parse(fs.readFileSync(logsPath, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading saved pipeline logs:", err);
  }

  const activeLogs = isPipelineRunning || currentPipelineLogs.length > 0 ? currentPipelineLogs : savedLogs;

  res.json({
    isRunning: isPipelineRunning,
    logs: activeLogs,
    result: currentPipelineResult,
  });
});

app.delete("/api/pipeline/logs", (req, res) => {
  const profileId = getActiveProfileId();
  const logsPath = getProfileLogsPath(profileId);
  currentPipelineLogs = [];
  currentPipelineResult = null;
  try {
    if (fs.existsSync(logsPath)) {
      fs.writeFileSync(logsPath, JSON.stringify([], null, 2), "utf-8");
    }
  } catch (e) {
    // ignore
  }
  res.json({ success: true, message: "Pipeline logs cleared." });
});

interface LocationGeoInfo {
  geoId?: string;
  locationStr: string;
}

const KNOWN_GEO_LOCATIONS: Record<string, LocationGeoInfo> = {
  // Washington State (GeoID: 103977389)
  "washington": { geoId: "103977389", locationStr: "Washington, United States" },
  "washington state": { geoId: "103977389", locationStr: "Washington, United States" },
  "wa": { geoId: "103977389", locationStr: "Washington, United States" },
  "washington, us": { geoId: "103977389", locationStr: "Washington, United States" },
  "washington, usa": { geoId: "103977389", locationStr: "Washington, United States" },
  "washington, united states": { geoId: "103977389", locationStr: "Washington, United States" },

  // Washington DC (GeoID: 90000097)
  "washington dc": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "washington d.c.": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "washington, dc": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "washington, d.c.": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "dc": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "district of columbia": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },

  // California
  "california": { geoId: "102095887", locationStr: "California, United States" },
  "ca": { geoId: "102095887", locationStr: "California, United States" },

  // New York State
  "new york": { geoId: "105080838", locationStr: "New York, United States" },
  "ny": { geoId: "105080838", locationStr: "New York, United States" },

  // Texas
  "texas": { geoId: "102748797", locationStr: "Texas, United States" },
  "tx": { geoId: "102748797", locationStr: "Texas, United States" },

  // Seattle
  "seattle": { geoId: "104116203", locationStr: "Seattle, Washington, United States" },
  "seattle, wa": { geoId: "104116203", locationStr: "Seattle, Washington, United States" },

  // Remote & Nationwide
  "remote": { geoId: "103644278", locationStr: "United States" },
  "work from home": { geoId: "103644278", locationStr: "United States" },
  "telecommute": { geoId: "103644278", locationStr: "United States" },

  // United States
  "united states": { geoId: "103644278", locationStr: "United States" },
  "usa": { geoId: "103644278", locationStr: "United States" },
  "us": { geoId: "103644278", locationStr: "United States" },
};

function getLinkedInLocationParams(locName: string): string {
  if (!locName || !locName.trim()) return "";
  const normalized = locName.trim().toLowerCase();

  // If search target is explicitly Remote / Work From Home, pass LinkedIn's Remote filter f_WT=2
  if (normalized === "remote" || normalized === "work from home" || normalized === "telecommute") {
    return `&location=${encodeURIComponent("United States")}&geoId=103644278&f_WT=2`;
  }

  const known = KNOWN_GEO_LOCATIONS[normalized];
  if (known) {
    let params = `&location=${encodeURIComponent(known.locationStr)}`;
    if (known.geoId) {
      params += `&geoId=${known.geoId}`;
    }
    return params;
  }

  // Fallback for Washington state check
  if (normalized.includes("washington") && !normalized.includes("dc") && !normalized.includes("district")) {
    return `&location=${encodeURIComponent("Washington, United States")}&geoId=103977389`;
  }

  return `&location=${encodeURIComponent(locName.trim())}`;
}

async function fetchLiveLinkedInJobs(
  companies: { name: string }[],
  roles: string[],
  preferredLocations: string[],
  timeFilter: string,
  minSalary?: number,
  isCancelled?: () => boolean,
  addLog?: (stage: "SCANNER" | "CONFIG" | "RESUME" | "NORMALIZER" | "GEMINI_AI" | "REPORT" | "SUCCESS" | "ERROR", message: string, details?: string) => void
): Promise<{ jobs: Omit<Job, 'id'>[]; totalScanned: number }> {
  const tprMap: Record<string, string> = { past_24h: "r86400", past_week: "r604800", past_month: "r2592000" };
  const tpr = tprMap[timeFilter] || (typeof timeFilter === "string" && timeFilter.startsWith("r") ? timeFilter : "r86400");

  const results: Omit<Job, 'id'>[] = [];
  let totalScanned = 0;
  const targetCompanies = companies.map((c) => c.name.trim()).filter(Boolean);
  const targetRoleList = roles.length > 0 ? roles : ["Software Engineer"];

  // Filter out non-geographic Hybrid modalities (only Hybrid is ignored as an area search parameter; Remote is searched directly)
  const isIgnoredLocation = (loc: string) => {
    const l = loc.trim().toLowerCase();
    return l === "hybrid" || l === "remote/hybrid" || l === "remote / hybrid" || l === "hybrid remote";
  };
  const targetLocations = preferredLocations.filter((loc) => !isIgnoredLocation(loc));
  const locationLoop = targetLocations.length > 0 ? targetLocations : [""];

  // Salary level filter for LinkedIn search URL (f_SB2)
  // f_SB2 values: 1=$40k+, 2=$60k+, 3=$80k+, 4=$100k+, 5=$120k+, 6=$140k+, 7=$160k+, 8=$180k+, 9=$200k+
  const sb2Level = minSalary && minSalary >= 40000
    ? Math.min(9, Math.max(1, Math.floor((minSalary - 40000) / 20000) + 1))
    : null;
  const sb2Param = sb2Level ? `&f_SB2=${sb2Level}` : "";

  // If specific target companies are provided, query each company; otherwise search open role across target locations
  const companyLoop = targetCompanies.length > 0 ? targetCompanies : [""];

  if (addLog) {
    const salaryDesc = sb2Level ? ` [Min Salary Filter: $${minSalary?.toLocaleString()}+ (f_SB2=${sb2Level})]` : "";
    const ignoredLocs = preferredLocations.filter((loc) => isIgnoredLocation(loc));
    const ignoredDesc = ignoredLocs.length > 0 ? ` (Ignoring Work Modalities for area search: [${ignoredLocs.join(", ")}])` : "";
    addLog(
      "SCANNER",
      `Starting job search across ${locationLoop.length} location(s): [${locationLoop.join(", ")}]${ignoredDesc} for ${companyLoop.length > 1 ? `${companyLoop.length} target companies` : targetCompanies.length === 1 ? `company "${targetCompanies[0]}"` : "Open Web Search mode"} across role(s): [${targetRoleList.join(", ")}]${salaryDesc}.`
    );
  }

  for (const companyName of companyLoop) {
    if (isCancelled && isCancelled()) break;
    for (const locName of locationLoop) {
      if (isCancelled && isCancelled()) break;
      for (const role of targetRoleList) {
        if (isCancelled && isCancelled()) break;

        const labelParts = [];
        if (companyName) labelParts.push(companyName);
        labelParts.push(role);
        if (locName) labelParts.push(locName);
        const taskLabel = labelParts.join(" • ");

        // Paginate through search results pages (start=0, start=25, start=50...)
        for (let startPage = 0; startPage <= 975; startPage += 25) {
          if (isCancelled && isCancelled()) break;
          try {
            const query = companyName
              ? encodeURIComponent(`"${companyName}" ${role}`)
              : encodeURIComponent(role);
            const locParam = getLinkedInLocationParams(locName);
            const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}${locParam}&f_TPR=${tpr}${sb2Param}&start=${startPage}`;
            const webSearchUrl = `https://www.linkedin.com/jobs/search?keywords=${query}${locParam}&f_TPR=${tpr}${sb2Param}&start=${startPage}`;

            // Inter-page pacing delay (3000ms / 3s) to ensure clean 200 responses from LinkedIn
            if (startPage > 0 || totalScanned > 0) {
              await new Promise((r) => setTimeout(r, 3000));
            }

            const res = await fetchLinkedInWithRetry(url, taskLabel, startPage, addLog);

            if (!res.ok) {
              if (addLog) {
                addLog(
                  "SCANNER",
                  `LinkedIn returned status ${res.status} (${res.statusText}) for "${taskLabel}" at page start=${startPage}. Moving to next search target...`,
                  `LinkedIn Endpoint: ${url}\nWeb Search URL: ${webSearchUrl}`
                );
              }
              break;
            }

            const html = await res.text();
            const cardMatches = [...html.matchAll(/<li[\s\S]*?<\/li>/g)];
            if (cardMatches.length === 0) {
              if (addLog && startPage > 0) {
                addLog("SCANNER", `No additional job cards found for "${taskLabel}" at page start=${startPage}. Completed search pagination.`);
              }
              break;
            }

            const urnRegex = /data-entity-urn="urn:li:jobPosting:(\d+)"/;
            const titleRegex = /base-search-card__title">[\s\S]*?([^\s<][^<]*)/;
            const companyRegex = /base-search-card__subtitle">([\s\S]*?)<\/h4>/;
            const locationRegex = /job-search-card__location">[\s\S]*?([^\s<][^<]*)/;
            const timeRegex = /datetime="([^"]+)"/;

            if (addLog) {
              const cardLinks: string[] = [];
              for (const cm of cardMatches) {
                const uM = cm[0].match(urnRegex);
                const tM = cm[0].match(titleRegex);
                const cM = cm[0].match(companyRegex);
                if (uM && tM) {
                  const jId = uM[1];
                  const jTitle = tM[1].trim();
                  const jComp = cM ? cM[1].replace(/<[^>]*>/g, "").trim() : (companyName || "Company");
                  cardLinks.push(`• ${jTitle} (${jComp}): https://www.linkedin.com/jobs/view/${jId}/`);
                }
              }
              const logDetails = [
                `LinkedIn Web Search Page: ${webSearchUrl}`,
                `LinkedIn API Endpoint: ${url}`,
                cardLinks.length > 0
                  ? `\nDiscovered ${cardLinks.length} raw job postings on this page:\n${cardLinks.slice(0, 10).join("\n")}${cardLinks.length > 10 ? `\n...and ${cardLinks.length - 10} more` : ""}`
                  : ""
              ].filter(Boolean).join("\n");

              addLog("SCANNER", `Scanned search page (start=${startPage}) for "${taskLabel}"... Found ${cardMatches.length} raw listings.`, logDetails);
            }

            const validCards: Array<{
              jobId: string;
              jobTitle: string;
              rawComp: string;
              jobLoc: string;
              postedTime: string;
              viewUrl: string;
            }> = [];

            for (const match of cardMatches) {
              const cardHtml = match[0];
              const urnM = cardHtml.match(urnRegex);
              const titleM = cardHtml.match(titleRegex);
              const compM = cardHtml.match(companyRegex);
              const locM = cardHtml.match(locationRegex);
              const timeM = cardHtml.match(timeRegex);

              if (urnM && titleM) {
                totalScanned++;
                const jobId = urnM[1];
                const jobTitle = titleM[1].trim();
                const rawComp = compM ? compM[1].replace(/<[^>]*>/g, "").trim() : companyName;
                const jobLoc = locM ? locM[1].trim() : "United States";
                const postedTime = timeM ? timeM[1] : "Recently";
                const viewUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;

                // STRICT TARGET COMPANY FILTER:
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
                    continue;
                  }
                }

                // Avoid duplicate job URLs
                if (!results.some(r => r.url === viewUrl) && !validCards.some(c => c.viewUrl === viewUrl)) {
                  validCards.push({ jobId, jobTitle, rawComp, jobLoc, postedTime, viewUrl });
                }
              }
            }

            // Fetch full job descriptions with inter-card pacing delay to avoid LinkedIn 429s
            const fetchedCardsData: Array<{
              card: typeof validCards[0];
              fullDescription: string;
              rawHtml: string;
            }> = [];

            for (let cardIdx = 0; cardIdx < validCards.length; cardIdx++) {
              const card = validCards[cardIdx];
              if (isCancelled && isCancelled()) break;
              if (addLog) {
                addLog("SCANNER", `Fetching details (${cardIdx + 1}/${validCards.length}): "${card.jobTitle}" @ ${card.rawComp}...`);
              }
              let fullDescription = "";
              let rawHtml = "";
              try {
                await new Promise((r) => setTimeout(r, 300));
                const jobPageRes = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.jobId}`, {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9"
                  }
                });
                if (jobPageRes.ok) {
                  rawHtml = await jobPageRes.text();
                  const descMatch = rawHtml.match(/<div[^>]+class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
                    || rawHtml.match(/<div[^>]+id="job-details"[^>]*>([\s\S]*?)<\/div>/i)
                    || rawHtml.match(/<section[^>]+class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
                  if (descMatch) {
                    fullDescription = descMatch[1]
                      .replace(/<br\s*\/?>/gi, "\n")
                      .replace(/<li[^>]*>/gi, "\n• ")
                      .replace(/<[^>]+>/g, "")
                      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                      .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                      .replace(/\n{3,}/g, "\n\n")
                      .trim();
                  }
                }
              } catch (fetchErr) {
                console.error(`[JD FETCH] Exception fetching job description for ${card.jobId}:`, fetchErr);
              }

              fetchedCardsData.push({ card, fullDescription, rawHtml });
            }

            // Extract salaries in one batch Gemini request (if AI is needed)
            if (fetchedCardsData.length > 0) {
              const salaryInputs = fetchedCardsData.map((fd) => ({
                description: fd.rawHtml || fd.fullDescription,
                title: fd.card.jobTitle,
                company: fd.card.rawComp,
              }));

              const batchSalaries = await batchDetermineJobSalaries(salaryInputs);

              for (let i = 0; i < fetchedCardsData.length; i++) {
                const { card, fullDescription } = fetchedCardsData[i];
                const foundSalary = batchSalaries[i] || "$Not found";

                results.push({
                  company: card.rawComp,
                  title: card.jobTitle,
                  location: card.jobLoc,
                  url: card.viewUrl,
                  description: fullDescription || `${card.rawComp} is hiring for a ${card.jobTitle} role in ${card.jobLoc}. Direct posting listed on LinkedIn with job ID ${card.jobId}. Key requirements include software engineering, system architecture, and modern application development.`,
                  posted_time: card.postedTime,
                  employment_type: "Full-time",
                  department: "Engineering",
                  salary: foundSalary,
                  provider: "LinkedIn",
                  first_seen: new Date().toISOString(),
                  status: "new"
                });
              }
            }
          } catch (err) {
            console.error(`Error fetching live LinkedIn jobs for ${taskLabel} page ${startPage}:`, err);
            break;
          }
        }
      }
    }
  }

  return { jobs: results, totalScanned };
}

function extractYoeBounds(text: string): { minYoe: number; maxYoe?: number } {
  if (!text) return { minYoe: 0 };

  // 1. Range patterns: e.g. "2-4 years", "2 to 4 years", "1 - 3 years", "3-5 years of experience"
  const rangePatterns = [
    /(\d+)\s*(?:-|–|—|\bto\b)\s*(\d+)\s*years?\s*(?:of\s*)?(?:professional\s+|relevant\s+|related\s+|work\s+|industry\s+)?experience/i,
    /(?:between\s+)?(\d+)\s*(?:and|to)\s*(\d+)\s*years?\s*(?:of\s+)?experience/i,
    /(\d+)\s*(?:-|–|—|\bto\b)\s*(\d+)\s*yrs/i,
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (match) {
      const minVal = parseInt(match[1], 10);
      const maxVal = parseInt(match[2], 10);
      if (!isNaN(minVal) && !isNaN(maxVal) && maxVal >= minVal && maxVal <= 40) {
        return { minYoe: minVal, maxYoe: maxVal };
      }
    }
  }

  // 2. Minimum YOE patterns: "5+ years", "minimum 5 years", "at least 5 years"
  const minPatterns = [
    /(\d+)\+?\s*(?:to\s*\d+)?\s*years?\s*(?:of\s*)?(?:professional\s+|relevant\s+|related\s+|work\s+|industry\s+)?experience/i,
    /minimum\s+(?:of\s+)?(\d+)\s*(?:\+)?\s*years?/i,
    /at\s+least\s+(\d+)\s*(?:\+)?\s*years?/i,
    /(\d+)\s*(?:\+)?\s*years?\s+(?:of\s+)?(?:professional|work|industry|relevant)/i,
    /(\d+)\+\s*yrs/i,
  ];

  for (const pattern of minPatterns) {
    const match = text.match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val <= 40) return { minYoe: val };
    }
  }

  return { minYoe: 0 };
}

function extractRequiredYoe(text: string): number {
  return extractYoeBounds(text).minYoe;
}

function extractMaxSalaryNumber(salaryStr: string): number {
  if (!salaryStr || salaryStr === "$Not found" || salaryStr.toLowerCase().includes("not found")) return 0;
  const cleaned = salaryStr.replace(/,/g, "");
  const matches = cleaned.match(/\$?(\d+(?:\.\d+)?)\s*(k|m)?/gi);
  if (!matches) return 0;
  let maxVal = 0;
  for (const m of matches) {
    const isK = /k/i.test(m);
    const isM = /m/i.test(m);
    const num = parseFloat(m.replace(/[\$kKmM]/g, ""));
    if (!isNaN(num)) {
      let val = num;
      if (isK) val = num * 1000;
      else if (isM) val = num * 1000000;
      else if (val < 1000 && !salaryStr.toLowerCase().includes("hr") && !salaryStr.toLowerCase().includes("hour")) {
        val = val * 1000;
      }
      if (val > maxVal) maxVal = val;
    }
  }
  return maxVal;
}

function formatSingleAmount(token: string, isHourly: boolean = false): string {
  if (!token) return "";
  const cleaned = token
    .replace(/[\$€£,]/g, "")
    .replace(/\s*(USD|EUR|GBP|\/yr|\/year|\/hr|\/hour|per\s+year|per\s+hour|annual|annually|hourly)\s*$/i, "")
    .trim();

  // Check if token ends with K / k / M / m
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*k$/i);
  if (kMatch) {
    const num = Math.round(parseFloat(kMatch[1]) * 1000);
    return `$${num.toLocaleString("en-US")}`;
  }

  const mMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*m$/i);
  if (mMatch) {
    const num = Math.round(parseFloat(mMatch[1]) * 1000000);
    return `$${num.toLocaleString("en-US")}`;
  }

  const numVal = parseFloat(cleaned);
  if (isNaN(numVal)) return token.trim();

  if (isHourly) {
    return `$${numVal % 1 === 0 ? numVal : numVal.toFixed(2)}`;
  }

  if (numVal >= 30 && numVal < 1000 && Number.isInteger(numVal) && !cleaned.includes(".")) {
    const num = numVal * 1000;
    return `$${num.toLocaleString("en-US")}`;
  }

  if (numVal >= 1000) {
    const num = Math.round(numVal);
    return `$${num.toLocaleString("en-US")}`;
  }

  return `$${Math.round(numVal)}`;
}

/**
 * Normalise a raw salary string to a consistent "$X - $Y" format.
 * - Converts abbreviated "175K - 280K" or "$175k-$280k" to "$175,000 - $280,000"
 * - Returns "$Not found" if no salary was disclosed
 */
function normalizeSalary(raw: string): string {
  if (!raw || !raw.trim()) return "$Not found";
  let s = raw.trim();

  if (s.toLowerCase().includes("not found")) {
    return "$Not found";
  }

  const isHourly = /\b(?:hr|hour|hourly|\/hr)\b/i.test(s);
  s = s.replace(/\s*(USD|EUR|GBP)\s*$/i, "").replace(/[.,;]+$/, "").trim();

  const parts = s.split(/\s*(?:[-–—]|\bto\b)\s*/i);

  let result = "";
  if (parts.length === 2) {
    const lowFormatted = formatSingleAmount(parts[0], isHourly);
    const highFormatted = formatSingleAmount(parts[1], isHourly);

    if (lowFormatted && highFormatted) {
      result = `${lowFormatted} - ${highFormatted}`;
    }
  } else if (parts.length === 1) {
    const single = formatSingleAmount(parts[0], isHourly);
    if (single) result = single;
  }

  if (!result) return "$Not found";

  if (isHourly && !result.toLowerCase().includes("hr") && !result.toLowerCase().includes("hour")) {
    result += " / hr";
  }

  return result;
}

function extractSalaryWithRegex(textOrHtml: string): string {
  if (!textOrHtml || !textOrHtml.trim()) return "$Not found";

  const text = textOrHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();

  // 1. Full Range Match (e.g. "$170K/yr - $250K/yr", "$170,000/yr - $250,000/yr", "$170k - $250k", "$80/hr - $120/hr")
  const rangeMatch = text.match(/(?:[\$€£]|USD\s*[\$€£]?)\s*(\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr|\/hour)*)\s*(?:[-–—]|\bto\b)\s*([\$€£]?\s*\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr|\/hour)*)/i);
  if (rangeMatch) {
    const raw = `${rangeMatch[1]} - ${rangeMatch[2]}`;
    const norm = normalizeSalary(raw);
    if (norm && norm !== "$Not found") return norm;
  }

  // 2. Contextual Salary Match (e.g. "Salary: $170K/yr - $250K/yr")
  const contextMatch = text.match(/(?:salary|compensation|pay|rate|base)\s*(?:range|scale|is)?[^<]{0,100}?([\$€£]\s*\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr)*\s*(?:[-–—]|\bto\b)\s*[\$€£]?\s*\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr)*)/i);
  if (contextMatch && contextMatch[1]) {
    const norm = normalizeSalary(contextMatch[1]);
    if (norm && norm !== "$Not found") return norm;
  }

  // 3. Single Match fallback (only when no range is present)
  const singleMatch = text.match(/([\$€£]\s*\d[\d,.]*\s*[kKmM]?)\s*(?:USD|EUR|GBP|\/yr|\/year|per\s+year|annual|annually)/i);
  if (singleMatch && singleMatch[1]) {
    const norm = normalizeSalary(singleMatch[1]);
    if (norm && norm !== "$Not found") return norm;
  }

  return "$Not found";
}

async function batchDetermineJobSalaries(
  jobsInput: Array<{ description: string; title?: string; company?: string }>
): Promise<string[]> {
  if (!jobsInput || jobsInput.length === 0) return [];

  const results: string[] = new Array(jobsInput.length).fill("$Not found");
  const indicesNeedingAI: number[] = [];

  // 1. Fast regex check for all jobs in batch
  for (let i = 0; i < jobsInput.length; i++) {
    const job = jobsInput[i];
    if (!job.description || !job.description.trim()) continue;

    const regexSalary = extractSalaryWithRegex(job.description);
    if (regexSalary && regexSalary !== "$Not found") {
      results[i] = regexSalary;
    } else if (/\d/.test(job.description)) {
      indicesNeedingAI.push(i);
    }
  }

  // 2. If no jobs need AI or no valid API key, return immediately
  if (indicesNeedingAI.length === 0 || !hasValidApiKey()) {
    return results;
  }

  // 3. Perform batch AI extraction in groups of 10 jobs per Gemini API request
  const BATCH_SIZE = 10;
  for (let b = 0; b < indicesNeedingAI.length; b += BATCH_SIZE) {
    const chunkIndices = indicesNeedingAI.slice(b, b + BATCH_SIZE);
    const chunkJobs = chunkIndices.map((idx) => jobsInput[idx]);

    const config = loadConfig();
    const primaryModel = config.gemini_model || "gemini-3.1-flash-lite";
    const candidateModels = [primaryModel, ...ALL_GEMINI_FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);

    const promptJobsText = chunkJobs
      .map((j, idx) => {
        const textSnippet = j.description
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 3000);
        return `[Job Index ${idx}]
Title: ${j.title || "Job Role"}
Company: ${j.company || "Company"}
Posting Content:
${textSnippet}`;
      })
      .join("\n\n---\n\n");

    const prompt = `You are an AI salary and compensation extraction engine for Job Radar AI.
Extract base salary ranges or pay rates explicitly mentioned in each of the ${chunkJobs.length} job postings below.

CRITICAL RULES:
1. Return ONLY a JSON array of objects, each containing "index" (number, 0 to ${chunkJobs.length - 1}) and "salary" (string).
2. Format extracted annual base salary ranges as "$X - $Y" (e.g., "$175,000 - $280,000").
3. Convert abbreviated ranges like "$175K - $280K", "$175k-$280k", "$175,000/yr" to full dollar figures "$175,000 - $280,000".
4. If hourly pay rate (e.g. "$80 - $120/hr"), return "$80 - $120 / hr".
5. DO NOT MAKE UP OR GUESS A SALARY RANGE. If no salary, compensation range, or pay rate is explicitly disclosed in the text for a job, return "Not found".

Job Postings:
${promptJobsText}`;

    let chunkExtracted = false;
    for (const model of candidateModels) {
      if (chunkExtracted) break;
      try {
        await enforceGeminiRateLimit(model);
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  salary: { type: Type.STRING },
                },
                required: ["index", "salary"],
              },
            },
          },
        });

        const raw = response.text || "";
        const parsed: Array<{ index: number; salary: string }> = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item.index === "number" && item.index >= 0 && item.index < chunkIndices.length) {
              const realIndex = chunkIndices[item.index];
              const norm = normalizeSalary(item.salary || "");
              if (norm && norm !== "$Not found") {
                results[realIndex] = norm;
              }
            }
          }
          chunkExtracted = true;
        }
      } catch (err: any) {
        console.warn(`[SALARY BATCH AI] Gemini (${model}) batch salary extraction failed:`, err?.message || err);
      }
    }
  }

  return results;
}

async function extractSalaryWithAI(
  jobDescriptionHtmlOrText: string,
  jobTitle?: string,
  company?: string
): Promise<string | null> {
  const res = await batchDetermineJobSalaries([{ description: jobDescriptionHtmlOrText, title: jobTitle, company }]);
  return res[0] && res[0] !== "$Not found" ? res[0] : null;
}

async function determineJobSalary(
  descriptionOrHtml: string,
  title?: string,
  company?: string
): Promise<string> {
  if (!descriptionOrHtml || !descriptionOrHtml.trim()) return "$Not found";
  const res = await batchDetermineJobSalaries([{ description: descriptionOrHtml, title, company }]);
  return res[0] || "$Not found";
}

function detectHardBlockerViolation(job: Job, hardBlockersText?: string): { isBlocked: boolean; reason: string } {
  if (!hardBlockersText || !hardBlockersText.trim()) {
    return { isBlocked: false, reason: "" };
  }

  const rawJobText = `${job.title} ${job.company} ${job.description || ''} ${job.department || ''}`.toLowerCase();
  // Normalize job text: strip periods in "u.s." / "u.s" so "u.s. citizens" becomes "us citizens", "u.s. government" -> "us government"
  const normJobText = rawJobText.replace(/u\.s\./g, "us").replace(/u\.s/g, "us");

  const lines = hardBlockersText
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

  for (const line of lines) {
    const rawLine = line.toLowerCase();
    const normLine = rawLine.replace(/u\.s\./g, "us").replace(/u\.s/g, "us");

    // 1. Citizenship & Security Clearance Blocker Check
    if (
      normLine.includes("citizen") ||
      normLine.includes("citizenship") ||
      normLine.includes("clearance") ||
      normLine.includes("security clearance") ||
      normLine.includes("government contract") ||
      normLine.includes("us citizen")
    ) {
      const isCitizenshipRequirement =
        rawJobText.includes("u.s. citizen") ||
        rawJobText.includes("u.s. citizens") ||
        normJobText.includes("us citizen") ||
        normJobText.includes("us citizens") ||
        normJobText.includes("citizenship") ||
        normJobText.includes("security clearance") ||
        normJobText.includes("secret clearance") ||
        normJobText.includes("top secret") ||
        normJobText.includes("ts/sci") ||
        normJobText.includes("government clearance") ||
        normJobText.includes("government contract") ||
        normJobText.includes("security requirements") ||
        normJobText.includes("limited to us") ||
        normJobText.includes("limited to u.s") ||
        normJobText.includes("must be a us") ||
        normJobText.includes("must be a u.s") ||
        normJobText.includes("active clearance") ||
        normJobText.includes("obtain and maintain") ||
        normJobText.includes("eligibility to obtain");

      if (isCitizenshipRequirement) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Role requires U.S. Citizenship or Security Clearance ("${line}")`
        };
      }
    }

    // 2. Data Engineering / Data Architect / Test Engineering Blocker Check
    if (
      normLine.includes("data engineer") ||
      normLine.includes("data engineering") ||
      normLine.includes("data architect") ||
      normLine.includes("test engineer") ||
      normLine.includes("qa engineer")
    ) {
      if (
        normJobText.includes("data engineer") ||
        normJobText.includes("data engineering") ||
        normJobText.includes("data architect") ||
        normJobText.includes("test engineer") ||
        normJobText.includes("qa engineer") ||
        normJobText.includes("software engineer in test") ||
        normJobText.includes("sdet")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Restricted specialized role ("${line}")`
        };
      }
    }

    // 3. Pure Frontend Blocker Check
    if (
      normLine.includes("pure frontend") ||
      normLine.includes("frontend only") ||
      normLine.includes("frontend role") ||
      normLine.includes("front end")
    ) {
      const titleLower = job.title.toLowerCase();
      if (
        titleLower.includes("frontend") ||
        titleLower.includes("front end") ||
        titleLower.includes("front-end") ||
        normJobText.includes("pure frontend")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Pure Frontend role ("${line}")`
        };
      }
    }

    // 4. On-site 5 days Check
    if (
      normLine.includes("on-site") ||
      normLine.includes("onsite") ||
      normLine.includes("in-office") ||
      normLine.includes("5 days")
    ) {
      if (
        normJobText.includes("5 days in office") ||
        normJobText.includes("5 days on-site") ||
        normJobText.includes("100% on-site") ||
        normJobText.includes("onsite 5 days")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: 5-Day On-site requirement ("${line}")`
        };
      }
    }

    // 5. Contractor / 1099 Check
    if (
      normLine.includes("contractor") ||
      normLine.includes("1099") ||
      normLine.includes("contract role") ||
      normLine.includes("temp")
    ) {
      if (
        normJobText.includes("contractor") ||
        normJobText.includes("1099") ||
        normJobText.includes("contract role") ||
        normJobText.includes("w2 contract") ||
        normJobText.includes("contract position") ||
        normJobText.includes("contract-to-hire") ||
        normJobText.includes("contract to hire") ||
        normJobText.includes("temp position") ||
        normJobText.includes("temporary position")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Contractor or 1099 role ("${line}")`
        };
      }
    }

    // 6. Recruiting Agency / Staffing Firm Check (only company direct hire)
    if (
      normLine.includes("recruiter") ||
      normLine.includes("recruiting") ||
      normLine.includes("staffing") ||
      normLine.includes("agency") ||
      normLine.includes("direct hire")
    ) {
      if (
        normJobText.includes("staffing agency") ||
        normJobText.includes("recruiting agency") ||
        normJobText.includes("recruitment agency") ||
        normJobText.includes("placement agency") ||
        normJobText.includes("employment agency") ||
        normJobText.includes("talent agency") ||
        normJobText.includes("on behalf of our client") ||
        normJobText.includes("posting for our client") ||
        normJobText.includes("our client is hiring") ||
        normJobText.includes("client company")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Recruiting or staffing agency post (only company direct hire allowed) ("${line}")`
        };
      }
    }

    // 7. Generic phrase fallback match
    const cleanKeyword = normLine
      .replace(/i (don't|do not) (want|like) (any|a|to be)?/gi, "")
      .replace(/requires?|requires? a|requires? us|avoid|no|without|never/gi, "")
      .trim();

    if (cleanKeyword.length >= 4 && normJobText.includes(cleanKeyword)) {
      return {
        isBlocked: true,
        reason: `Hard Blocker Triggered: Role matches criteria ("${line}")`
      };
    }
  }

  return { isBlocked: false, reason: "" };
}

function generateHeuristicEvaluation(job: Job, resume: ResumeData, config?: AppConfig) {
  const text = `${job.title} ${job.company} ${job.description || ''} ${job.department || ''}`.toLowerCase();

  // Use the parsed skills from the resume (already driven by config.skills in parseResumeDetails).
  const resumeSkills = resume.parsedSkills?.length
    ? resume.parsedSkills
    : (config?.skills ?? ["TypeScript", "React", "Node.js", "Python", "REST API", "GraphQL"]);

  const matchedSkills = resumeSkills.filter((s) => text.includes(s.toLowerCase()));

  // Skills the JOB requires that the candidate does NOT have.
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

  // Check YOE alignment (Minimum requirement & Upper Bound Ceiling)
  let yoePenalty = 0;
  let yoeNote = "";
  const candidateYoe = resume.experienceYears || 0;
  const yoeBounds = extractYoeBounds(`${job.title} ${job.description || ''}`);
  let isUnderYoe = false;
  let isExceedingMaxYoe = false;

  if (candidateYoe > 0 && yoeBounds.minYoe > 0 && candidateYoe < yoeBounds.minYoe) {
    isUnderYoe = true;
    const gap = yoeBounds.minYoe - candidateYoe;
    if (gap >= 5) {
      yoePenalty = 45;
      yoeNote = `Experience Gap (Weak Match): Candidate (~${candidateYoe} yrs) is significantly below required ${yoeBounds.minYoe}+ yrs criteria`;
    } else {
      yoePenalty = 25;
      yoeNote = `Experience Gap (Weak Match): Candidate (~${candidateYoe} yrs) is below required ${yoeBounds.minYoe}+ yrs criteria`;
    }
  } else if (candidateYoe > 0 && yoeBounds.maxYoe !== undefined && candidateYoe > yoeBounds.maxYoe) {
    isExceedingMaxYoe = true;
    yoePenalty = 25;
    yoeNote = `Over-Qualified for YOE Ceiling (Weak Match): Candidate (~${candidateYoe} yrs) exceeds role's maximum experience range (${yoeBounds.minYoe}-${yoeBounds.maxYoe} yrs)`;
  }

  // Check Salary Alignment against target minimum salary
  let salaryPenalty = 0;
  let salaryNote = "";
  let isBelowTargetSalary = false;
  const targetMinSalary = config?.min_salary || 0;
  if (targetMinSalary > 0 && job.salary && job.salary !== "$Not found") {
    const maxDisclosed = extractMaxSalaryNumber(job.salary);
    if (maxDisclosed > 0 && maxDisclosed < targetMinSalary) {
      isBelowTargetSalary = true;
      salaryPenalty = 25;
      salaryNote = `Below Target Salary (Weak Match): Disclosed salary max ($${maxDisclosed.toLocaleString()}) is below target minimum ($${targetMinSalary.toLocaleString()})`;
    }
  }

  // Check Over-Qualification — penalize when candidate has ~3+ YoE but role is targeted at New Grad / Intern / Early Career
  let overQualPenalty = 0;
  let overQualNote = "";
  const titleAndDescLower = `${job.title} ${job.description || ''}`.toLowerCase();
  const isEntryLevelRole =
    /\b(?:new grad|new graduate|early career|intern|internship|junior|university graduate|entry level|0-1 years|0-2 years)\b/i.test(titleAndDescLower) ||
    /\b(associate software engineer|associate engineer)\b/i.test(job.title);

  if (candidateYoe >= 3 && isEntryLevelRole) {
    overQualPenalty = 45;
    overQualNote = `Over-Qualification: Candidate has ~${candidateYoe} years experience, but position is targeted at New Graduates / Early Career / Entry-Level applicants`;
  }

  // Check Hard Blockers (if configured)
  const hardBlockerCheck = detectHardBlockerViolation(job, config?.hard_blockers);
  let hardBlockerPenalty = 0;
  let hardBlockerNote = "";
  if (hardBlockerCheck.isBlocked) {
    hardBlockerPenalty = 75;
    hardBlockerNote = hardBlockerCheck.reason;
  }

  let hash = 0;
  for (let i = 0; i < job.title.length; i++) {
    hash = (hash << 5) - hash + job.title.charCodeAt(i);
    hash |= 0;
  }
  const variance = (Math.abs(hash) % 11) - 5;
  let scoreCap = (candidateYoe >= 3 && isEntryLevelRole) ? 55 : 96;
  if (isUnderYoe || isExceedingMaxYoe || isBelowTargetSalary) scoreCap = Math.min(scoreCap, 55);
  if (hardBlockerPenalty > 0) scoreCap = Math.min(scoreCap, 25);

  const finalScore = Math.min(scoreCap, Math.max(10, baseScore + variance - locationPenalty - yoePenalty - salaryPenalty - overQualPenalty - hardBlockerPenalty));

  let matchLevel: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched' = 'Good Match';
  if (hardBlockerPenalty > 0) {
    matchLevel = 'Unmatched';
  } else if (isUnderYoe || isExceedingMaxYoe || isBelowTargetSalary) {
    matchLevel = finalScore < 30 ? 'Unmatched' : 'Weak Match';
  } else if (finalScore >= 80) matchLevel = 'Strong Match';
  else if (finalScore >= 70) matchLevel = 'Good Match';
  else if (finalScore >= 40) matchLevel = 'Weak Match';
  else matchLevel = 'Unmatched';

  const reasons = [
    `Role title and seniority (${job.title}) align with candidate engineering background.`,
    `Matched core skills: ${matchedSkills.length > 0 ? matchedSkills.join(", ") : "TypeScript, React, Node.js"}.`
  ];

  if (hardBlockerNote) {
    reasons.unshift(hardBlockerNote);
  }
  if (locationNote) {
    reasons.push(locationNote);
  }
  if (yoeNote) {
    reasons.push(yoeNote);
  }
  if (overQualNote) {
    reasons.push(overQualNote);
  }

  const missingList = [...missingSkills];
  if (hardBlockerNote) {
    missingList.unshift(hardBlockerNote);
  }
  if (locationNote) {
    missingList.unshift(`Location: ${job.location}`);
  }
  if (yoeNote) {
    missingList.unshift(yoeNote);
  }
  if (overQualNote) {
    missingList.unshift(overQualNote);
  }

  const noteSuffix = [hardBlockerNote ? '[Hard Blocker Triggered]' : '', locationNote ? '[Location penalty]' : '', yoeNote ? '[YOE penalty]' : '', overQualNote ? '[Over-qualified]' : ''].filter(Boolean).join(' ');
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

  const sanitizedJobs = config.locations && config.locations.length > 0
    ? jobs.map((j) => sanitizeJobEvaluation(j, config.locations))
    : jobs;

  const evaluatedJobs = sanitizedJobs.filter((j) => j.status === "evaluated" || j.score !== undefined);
  const strongMatches = evaluatedJobs.filter((j) => (j.score || 0) >= 80);
  const goodMatches = evaluatedJobs.filter((j) => (j.score || 0) >= 60 && (j.score || 0) < 80);
  const weakMatches = evaluatedJobs.filter((j) => (j.score || 0) < 60);

  const timestamp = new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "medium" });

  let md = `# 🎯 Job Radar AI - Pipeline Evaluation Report\n\n`;
  md += `**Generated:** ${timestamp}\n`;
  md += `**Minimum Score Target:** \`${minThreshold}%\`\n\n`;
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

      sectionMd += `### ${idx + 1}. ${job.title} @ **${job.company}**\n`;
      sectionMd += `- **Match Score:** \`${score}/100\` (${job.match_level})\n`;
      sectionMd += `- **Location:** ${job.location}\n`;
      sectionMd += `- **Disclosed Salary:** ${job.salary || '$Not found'}\n`;
      sectionMd += `- **Posted:** ${job.posted_time} | **ATS Provider:** ${job.provider}\n`;
      sectionMd += `- **Listing Link:** [🔗 View Job Posting](${job.url})\n\n`;

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
  const { name, config: newConfig, resumeContent, parsedSkills } = req.body;

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
  if (Array.isArray(parsedSkills)) {
    existing.resume.parsedSkills = parsedSkills;
  }
  existing.updatedAt = new Date().toISOString();

  store.profiles[index] = existing;
  saveProfilesData(store);

  // If this is the active profile, sync to files
  if (id === store.activeProfileId) {
    if (newConfig) saveConfig(newConfig);
    if (resumeContent !== undefined) await saveResume(resumeContent);
    if (Array.isArray(parsedSkills)) {
      const reStore = loadProfilesData();
      const activeP = reStore.profiles.find((p) => p.id === id);
      if (activeP) {
        activeP.resume.parsedSkills = parsedSkills;
        saveProfilesData(reStore);
      }
    }
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
  const sanitizedJobs = loadJobsDB();
  saveJobsDB(sanitizedJobs);
  generateMarkdownReport(sanitizedJobs);
  res.json({ success: true, config, jobs: sanitizedJobs });
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

        const pdfModel = loadConfig().gemini_model || "gemini-3.1-flash-lite";
        await enforceGeminiRateLimit(pdfModel);
        const response = await ai.models.generateContent({
          model: pdfModel,
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

app.post("/api/jobs/delete-below-threshold", (req, res) => {
  try {
    const configObj = loadConfig();
    const threshold = typeof req.body?.threshold === "number" ? req.body.threshold : (configObj.minimum_score || 65);
    let jobs = loadJobsDB();
    const totalBefore = jobs.length;
    jobs = jobs.filter((j) => j.score === undefined || (j.score || 0) >= threshold);
    const deletedCount = totalBefore - jobs.length;
    saveJobsDB(jobs);
    generateMarkdownReport(jobs);
    res.json({ success: true, deletedCount, remainingCount: jobs.length, threshold, jobs });
  } catch (err: any) {
    console.error("Error deleting jobs below threshold:", err);
    res.status(500).json({ error: err.message || "Failed to delete jobs below threshold" });
  }
});

// Helper for unified Gemini evaluation across single-job evaluate, batch evaluate, and pipeline scans
async function batchEvaluateJobsWithGemini(
  jobsList: Job[],
  resumeContent: string,
  configObj: AppConfig
): Promise<Array<{
  jobId: string;
  evaluation: {
    score: number;
    match_level: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched';
    summary: string;
    reasons: string[];
    missing_skills: string[];
    recommended_actions: string[];
    model_used: string;
  };
}>> {
  if (!jobsList || jobsList.length === 0) return [];

  // 1. Ensure all jobs have salary checked/extracted via batch salary extraction
  const jobsNeedingSalary = jobsList.filter(
    (j) => !j.salary || j.salary === "$Not found" || j.salary.includes("USD")
  );
  if (jobsNeedingSalary.length > 0) {
    const freshSalaries = await batchDetermineJobSalaries(
      jobsNeedingSalary.map((j) => ({
        description: j.description,
        title: j.title,
        company: j.company,
      }))
    );
    for (let i = 0; i < jobsNeedingSalary.length; i++) {
      if (freshSalaries[i] && freshSalaries[i] !== "$Not found") {
        jobsNeedingSalary[i].salary = freshSalaries[i];
      }
    }
  }

  // 2. If no valid API key, use ATS Heuristic Engine for all jobs in batch
  if (!hasValidApiKey()) {
    const resumeParsed = parseResumeDetails(resumeContent, configObj.skills);
    return jobsList.map((job) => {
      const heur = generateHeuristicEvaluation(job, resumeParsed, configObj);
      return { jobId: job.id, evaluation: { ...heur, model_used: "ATS Heuristic Engine" } };
    });
  }

  // 3. Process jobs in batches of up to 5 jobs per Gemini API request
  const BATCH_SIZE = 5;
  const results: Array<{ jobId: string; evaluation: any }> = [];
  const primaryModel = configObj.gemini_model || "gemini-3.1-flash-lite";
  const candidateModels = [primaryModel, ...ALL_GEMINI_FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);

  for (let i = 0; i < jobsList.length; i += BATCH_SIZE) {
    const chunk = jobsList.slice(i, i + BATCH_SIZE);

    const chunkPrompt = `You are the AI Matcher engine in Job Radar AI. Evaluate the following ${chunk.length} job posting(s) against the candidate's resume and return structured match evaluations for EACH job.

=== CANDIDATE RESUME ===
${resumeContent}

=== TARGET SALARY ===
${configObj.min_salary || 200000} ${configObj.salary_currency || 'USD'} (Includes postings where disclosed salary range reaches or exceeds target)

=== PREFERRED LOCATIONS (Candidate accepts roles in ANY of these independent regions) ===
${configObj.locations && configObj.locations.length > 0 ? configObj.locations.map((loc, idx) => `  ${idx + 1}. "${loc}"`).join("\n") : "  - Any location"}

=== HARD BLOCKERS / CRITERIA TO AVOID ===
${configObj.hard_blockers && configObj.hard_blockers.trim() ? configObj.hard_blockers.trim() : "None specified."}

=== JOB POSTINGS TO EVALUATE (${chunk.length} total) ===
${chunk.map((job, idx) => `
[JOB POSTING #${idx + 1} — ID: ${job.id}]
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary Disclosed: ${job.salary || "Not disclosed"}
Description:
${job.description.slice(0, 4000)}
`).join("\n---\n")}

EVALUATION & SCORING RULES:
0. CRITICAL HARD BLOCKERS CHECK — evaluate this FIRST for each job:
   - Carefully review the candidate's specified HARD BLOCKERS / CRITERIA TO AVOID above.
   - If the job title, requirements, citizenship/clearance demands, responsibilities, or work arrangement match ANY of the candidate's specified hard blockers:
     * THIS IS A DEALBREAKER HARD BLOCKER VIOLATION.
     * You MUST cap the final score at a maximum of 25 (range 0 - 25) and set match_level to 'Unmatched'.
     * In summary, reasons, and missing_skills, explicitly highlight the triggered hard blocker.

1. CRITICAL YEARS OF EXPERIENCE (YoE) COMPARISON RULE:
   - Compute candidate's total professional work experience in years from resume timeline.
   - Extract required experience range/minimum from the job posting (e.g. "5+ years", "2-4 years").
   - MANDATORY YOE RULE: IF candidate YOE is below the job's minimum requirement OR if the job description caps YOE (e.g. "2-4 years") and candidate YOE exceeds the upper bound (e.g. candidate has 5 years experience for a 2-4 year role), YOU MUST CLASSIFY THE MATCH LEVEL AS 'Weak Match' (OR 'Unmatched' IF GAP IS 8+ YEARS) AND CAP THE SCORE AT A MAXIMUM OF 55 (range 10-55).

1.b. CRITICAL OVER-QUALIFICATION RULE:
   - If candidate has ~3+ YoE and role is entry-level/new grad/intern, cap score at max 55 (Weak Match/Unmatched).

2. SALARY & LOCATION ALIGNMENT:
   - MANDATORY SALARY TARGET RULE: If the job posting discloses a salary range where the maximum bound is below the candidate's target minimum salary (e.g. disclosed max is $150K but candidate's target minimum is $200K+), YOU MUST CLASSIFY THE MATCH LEVEL AS 'Weak Match' AND CAP THE SCORE AT A MAXIMUM OF 55.
   - "Seattle, WA" or "WA" is a PERFECT LOCATION MATCH for "Washington".
   - ONLY deduct points for location if the job location matches NONE of the candidate's preferred locations.

3. TECHNICAL & SKILLS ALIGNMENT:
   - Analyze overlap in core technologies and domain expertise.

Return a JSON array of objects, with one entry for each of the ${chunk.length} jobs evaluated. Ensure each object contains the exact "jobId" provided in the prompt.`;

    let chunkSuccess = false;
    for (const selectedModel of candidateModels) {
      if (chunkSuccess) break;
      try {
        await enforceGeminiRateLimit(selectedModel);
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: chunkPrompt,
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  jobId: { type: Type.STRING, description: "Matching job ID from prompt" },
                  score: { type: Type.INTEGER, description: "Match score 0 to 100" },
                  match_level: { type: Type.STRING, description: "Strong Match | Good Match | Weak Match | Unmatched" },
                  summary: { type: Type.STRING, description: "2-3 sentence executive match summary" },
                  reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
                  missing_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommended_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["jobId", "score", "match_level", "summary", "reasons", "missing_skills", "recommended_actions"],
              },
            },
          },
        });

        const rawText = response.text || "[]";
        const parsedArray: any[] = JSON.parse(rawText);

        if (Array.isArray(parsedArray) && parsedArray.length > 0) {
          for (let cIdx = 0; cIdx < chunk.length; cIdx++) {
            const job = chunk[cIdx];
            const evalObj = parsedArray.find((p) => p.jobId === job.id) || parsedArray[cIdx] || {};

            // Hard Blocker post-processing guardrail
            const hbCheck = detectHardBlockerViolation(job, configObj.hard_blockers);
            if (hbCheck.isBlocked) {
              evalObj.score = Math.min(evalObj.score || 15, 15);
              evalObj.match_level = 'Unmatched';
              if (!Array.isArray(evalObj.reasons)) evalObj.reasons = [];
              if (!evalObj.reasons.some((r: string) => r.includes("Hard Blocker"))) {
                evalObj.reasons.unshift(hbCheck.reason);
              }
              if (!Array.isArray(evalObj.missing_skills)) evalObj.missing_skills = [];
              if (!evalObj.missing_skills.some((m: string) => m.includes("Hard Blocker"))) {
                evalObj.missing_skills.unshift(hbCheck.reason);
              }
              if (!evalObj.summary || !evalObj.summary.includes("Hard Blocker")) {
                evalObj.summary = `${hbCheck.reason}. ${evalObj.summary || ''}`;
              }
            }

            // YOE & Salary post-processing guardrails
            const parsedRes = parseResumeDetails(resumeContent, configObj.skills);
            const candidateYoe = parsedRes.experienceYears || 0;
            const yoeBounds = extractYoeBounds(`${job.title} ${job.description || ''}`);

            if (!hbCheck.isBlocked) {
              if (candidateYoe > 0 && yoeBounds.minYoe > 0 && candidateYoe < yoeBounds.minYoe) {
                evalObj.score = Math.min(evalObj.score || 50, 55);
                evalObj.match_level = 'Weak Match';
                if (!Array.isArray(evalObj.reasons)) evalObj.reasons = [];
                const yoeMsg = `Experience Gap: Candidate YOE (~${candidateYoe} yrs) is below job requirement (${yoeBounds.minYoe}+ yrs) -> Weak Match`;
                if (!evalObj.reasons.some((r: string) => r.toLowerCase().includes("experience gap") || r.toLowerCase().includes("yoe"))) {
                  evalObj.reasons.unshift(yoeMsg);
                }
              } else if (candidateYoe > 0 && yoeBounds.maxYoe !== undefined && candidateYoe > yoeBounds.maxYoe) {
                evalObj.score = Math.min(evalObj.score || 50, 55);
                evalObj.match_level = 'Weak Match';
                if (!Array.isArray(evalObj.reasons)) evalObj.reasons = [];
                const yoeMsg = `Over-Qualified YOE Ceiling: Candidate YOE (~${candidateYoe} yrs) exceeds role's maximum experience range (${yoeBounds.minYoe}-${yoeBounds.maxYoe} yrs) -> Weak Match`;
                if (!evalObj.reasons.some((r: string) => r.toLowerCase().includes("yoe ceiling") || r.toLowerCase().includes("over-qualified"))) {
                  evalObj.reasons.unshift(yoeMsg);
                }
              }

              // Salary target guardrail
              const targetMinSal = configObj.min_salary || 0;
              if (targetMinSal > 0 && job.salary && job.salary !== "$Not found") {
                const maxDisclosed = extractMaxSalaryNumber(job.salary);
                if (maxDisclosed > 0 && maxDisclosed < targetMinSal) {
                  evalObj.score = Math.min(evalObj.score || 50, 55);
                  evalObj.match_level = 'Weak Match';
                  if (!Array.isArray(evalObj.reasons)) evalObj.reasons = [];
                  const salMsg = `Below Target Salary: Disclosed max salary ($${maxDisclosed.toLocaleString()}) is below minimum target ($${targetMinSal.toLocaleString()}) -> Weak Match`;
                  if (!evalObj.reasons.some((r: string) => r.toLowerCase().includes("below target salary"))) {
                    evalObj.reasons.unshift(salMsg);
                  }
                }
              }
            }

            // Apply location & data sanitization
            const sanitized = sanitizeJobEvaluation(
              { ...job, ...evalObj },
              configObj.locations
            );

            results.push({
              jobId: job.id,
              evaluation: {
                score: sanitized.score || 0,
                match_level: sanitized.match_level || 'Good Match',
                summary: sanitized.summary || '',
                reasons: sanitized.reasons || [],
                missing_skills: sanitized.missing_skills || [],
                recommended_actions: sanitized.recommended_actions || evalObj.recommended_actions || [],
                model_used: selectedModel,
              },
            });
          }
          chunkSuccess = true;
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
          isApiKeyKnownInvalid = true;
          console.log("Notice: Gemini API key invalid. Falling back to ATS Heuristic Engine.");
          break;
        } else if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
          console.log(`Notice: Gemini (${selectedModel}) rate limit (429) reached in batch eval. Pausing 2.5s before fallback model...`);
          await new Promise((r) => setTimeout(r, 2500));
        } else {
          console.log(`Notice: Gemini (${selectedModel}) batch evaluation error:`, errMsg);
        }
      }
    }

    // Fallback if AI call failed for this chunk
    if (!chunkSuccess) {
      const resumeParsed = parseResumeDetails(resumeContent, configObj.skills);
      for (const job of chunk) {
        if (!results.some((r) => r.jobId === job.id)) {
          const heur = generateHeuristicEvaluation(job, resumeParsed, configObj);
          results.push({ jobId: job.id, evaluation: { ...heur, model_used: "ATS Heuristic Fallback" } });
        }
      }
    }
  }

  return results;
}

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
  const batchRes = await batchEvaluateJobsWithGemini([job], resumeContent, configObj);
  if (batchRes && batchRes.length > 0) {
    return batchRes[0].evaluation;
  }
  const resumeParsed = parseResumeDetails(resumeContent, configObj.skills);
  const heur = generateHeuristicEvaluation(job, resumeParsed, configObj);
  return { ...heur, model_used: "ATS Heuristic Engine" };
}

// 4. Gemini Matcher AI Endpoint (Single job evaluation)
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

// 4b. Gemini Matcher Batch Endpoint
app.post("/api/jobs/evaluate-batch", async (req, res) => {
  try {
    const { jobIds } = req.body;
    const allJobs = loadJobsDB();
    const activeProfileData = loadProfilesData().profiles.find(p => p.id === getActiveProfileId());
    const resumeObj = activeProfileData?.resume ?? loadResume();
    const configObj = loadConfig();

    let jobsToEval: Job[] = [];
    if (Array.isArray(jobIds) && jobIds.length > 0) {
      jobsToEval = allJobs.filter((j) => jobIds.includes(j.id));
    } else {
      jobsToEval = allJobs.filter((j) => j.score === undefined);
    }

    if (jobsToEval.length === 0) {
      return res.json({ success: true, evaluatedCount: 0, jobs: allJobs });
    }

    const evalResults = await batchEvaluateJobsWithGemini(jobsToEval, resumeObj.content, configObj);
    const updatedMap = new Map<string, Job>();

    for (const item of evalResults) {
      const orig = jobsToEval.find((j) => j.id === item.jobId);
      if (orig) {
        updatedMap.set(item.jobId, {
          ...orig,
          score: item.evaluation.score,
          match_level: item.evaluation.match_level,
          summary: item.evaluation.summary,
          reasons: item.evaluation.reasons,
          missing_skills: item.evaluation.missing_skills,
          recommended_actions: item.evaluation.recommended_actions,
          model_used: item.evaluation.model_used,
          processed_at: new Date().toISOString(),
          status: "evaluated",
        });
      }
    }

    const updatedJobsList = allJobs.map((j) => updatedMap.get(j.id) || j);
    saveJobsDB(updatedJobsList);
    generateMarkdownReport(updatedJobsList);

    return res.json({ success: true, evaluatedCount: updatedMap.size, jobs: updatedJobsList });
  } catch (error: any) {
    console.error("Batch evaluation error:", error);
    return res.status(500).json({ error: error.message || "Failed to batch evaluate jobs" });
  }
});

// 5. Full Pipeline Runner Endpoints (`python run.py` simulation & execution)
app.get("/api/pipeline/logs", (req, res) => {
  try {
    const logsPath = getProfileLogsPath();
    let logs: PipelineLog[] = currentPipelineLogs;
    if (fs.existsSync(logsPath)) {
      logs = JSON.parse(fs.readFileSync(logsPath, "utf-8"));
    }
    res.json({
      logs,
      isRunning: isPipelineRunning,
      result: currentPipelineResult,
    });
  } catch (err: any) {
    res.json({ logs: currentPipelineLogs, isRunning: isPipelineRunning, result: currentPipelineResult });
  }
});

app.delete("/api/pipeline/logs", (req, res) => {
  try {
    currentPipelineLogs = [];
    currentPipelineResult = null;
    const logsPath = getProfileLogsPath();
    if (fs.existsSync(logsPath)) {
      fs.writeFileSync(logsPath, JSON.stringify([], null, 2), "utf-8");
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/cancel", (req, res) => {
  activePipelineCancelled = true;
  res.json({ success: true, message: "Pipeline cancellation requested." });
});

app.post("/api/pipeline/run", async (req, res) => {
  activePipelineCancelled = false;
  isPipelineRunning = true;
  currentPipelineLogs = [];
  currentPipelineResult = null;
  try {
    const logsPath = getProfileLogsPath();
    fs.writeFileSync(logsPath, JSON.stringify([], null, 2), "utf-8");
  } catch (e) {
    // ignore
  }

  const isCancelled = () => req.destroyed || activePipelineCancelled;

  const logs: PipelineLog[] = [];
  const addLog = (stage: PipelineLog["stage"], message: string, details?: string) => {
    const entry: PipelineLog = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      stage,
      message,
      details,
    };
    logs.push(entry);
    currentPipelineLogs.push(entry);

    try {
      const logsPath = getProfileLogsPath();
      fs.writeFileSync(logsPath, JSON.stringify(currentPipelineLogs, null, 2), "utf-8");
    } catch (e) {
      // ignore
    }
  };

  try {
    const pipelineStartTime = Date.now();
    addLog("CONFIG", "Loading runtime configuration from config/config.yaml...");
    const config = loadConfig();
    const isCompanyFilteringEnabled = config.target_companies_enabled !== false;
    const allCompanies = config.companies || [];
    const activeCompanies = isCompanyFilteringEnabled ? allCompanies.filter((c) => c.enabled) : [];
    const disabledCompanies = isCompanyFilteringEnabled ? allCompanies.filter((c) => !c.enabled) : allCompanies;
    const targetRoles = config.target_roles && config.target_roles.length > 0
      ? config.target_roles
      : ["Software Engineer", "Full Stack AI Engineer"];

    const preferredLocs = config.locations || [];
    const configSummary = isCompanyFilteringEnabled && activeCompanies.length > 0
      ? `${activeCompanies.length} enabled company target provider(s) out of ${allCompanies.length} configured company entry/entries across ${targetRoles.length} search role queries`
      : `Open Web Search Mode (${isCompanyFilteringEnabled ? "0 enabled target companies" : "Target company filtering disabled"} - searching all jobs in area for specified roles) across ${targetRoles.length} search role queries`;

    addLog(
      "CONFIG",
      `Loaded configuration: ${configSummary}`,
      `Target Company Filtering: ${isCompanyFilteringEnabled ? "Enabled" : "Disabled (Open Web Search Mode)"}` +
      `\nActive Enabled Companies (${activeCompanies.length}): ${activeCompanies.length > 0 ? activeCompanies.map((c) => `${c.name} (${c.provider})`).join(", ") : "None (Open Web Search Mode - searching all target jobs in area)"}` +
      (disabledCompanies.length > 0 ? `\nDisabled/Bypassed Companies (${disabledCompanies.length}): ${disabledCompanies.map((c) => `${c.name} (${c.provider})`).join(", ")} (${isCompanyFilteringEnabled ? "Disabled in list" : "Bypassed because section is disabled"})` : "") +
      `\nTarget Search Roles (${targetRoles.length}): ${targetRoles.join(", ")}` +
      `\nTarget Locations: ${preferredLocs.length > 0 ? preferredLocs.join(", ") : "Any"}`
    );

    if (isCancelled()) {
      isPipelineRunning = false;
      currentPipelineResult = { cancelled: true, summary: "Scan cancelled by user." };
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

    addLog("SCANNER", `Launching Live Job Scanner [Filter: ${tfLabel}] for roles [${targetRoles.join(", ")}] across ${activeCompanies.length} target companies (Locations: ${preferredLocs.length > 0 ? preferredLocs.join(", ") : "Any"})...`);
    const previousJobsDB = loadJobsDB();

    if (isCancelled()) {
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user.", logs });
    }

    // Measure Stage 1: Job Scanning
    const scanStartTime = Date.now();
    const scanData = await fetchLiveLinkedInJobs(activeCompanies, targetRoles, preferredLocs, tfParam, config.min_salary, isCancelled, addLog);
    const liveCandidates = scanData.jobs;
    const totalScannedCount = scanData.totalScanned;
    const scanDurationSec = ((Date.now() - scanStartTime) / 1000).toFixed(1);

    if (isCancelled()) {
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user.", logs });
    }

    addLog("SCANNER", `[STAGE COMPLETE] Job Scanning Stage completed in ${scanDurationSec}s. Scanned ${totalScannedCount} raw postings; ${liveCandidates.length} matched criteria.`);

    const ts = Date.now().toString().slice(-5);
    // Map latest scan candidates, preserving scores/evaluations if job was previously evaluated
    const latestScanJobs: Job[] = liveCandidates.map((c, idx) => {
      const jobIdM = c.url.match(/\/view\/(\d+)\//);
      const jobId = jobIdM ? jobIdM[1] : `${ts}-${idx}`;
      const id = `li-${jobId}`;

      const prev = previousJobsDB.find((j) => j.id === id || j.url === c.url);

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
    let evalDurationSec = "0.0";

    if (config.auto_evaluate && jobsNeedingEval.length > 0) {
      const evalStartTime = Date.now();
      const selectedModel = config.gemini_model || "gemini-3.1-flash-lite";
      const totalToEval = jobsNeedingEval.length;
      addLog("GEMINI_AI", `Starting batch AI evaluation for ${totalToEval} job(s) in groups of 5 (Model: ${selectedModel})...`);

      const BATCH_SIZE = 5;
      for (let i = 0; i < jobsNeedingEval.length; i += BATCH_SIZE) {
        if (isCancelled()) break;
        const chunk = jobsNeedingEval.slice(i, i + BATCH_SIZE);
        const chunkTitles = chunk.map((j) => `"${j.title}" @ ${j.company}`).join(", ");

        addLog("GEMINI_AI", `Evaluating batch (${i + 1}-${Math.min(i + chunk.length, totalToEval)}/${totalToEval}): ${chunkTitles}...`);

        const evalResults = await batchEvaluateJobsWithGemini(chunk, resume.content, config);

        for (const resItem of evalResults) {
          const job = chunk.find((j) => j.id === resItem.jobId);
          if (job) {
            job.score = resItem.evaluation.score;
            job.match_level = resItem.evaluation.match_level;
            job.summary = resItem.evaluation.summary;
            job.reasons = resItem.evaluation.reasons;
            job.missing_skills = resItem.evaluation.missing_skills;
            job.recommended_actions = resItem.evaluation.recommended_actions;
            job.model_used = resItem.evaluation.model_used;
            job.processed_at = new Date().toISOString();
            job.status = "evaluated";
            evaluatedJobsCount++;

            addLog("GEMINI_AI", `[EVAL DONE] "${job.title}" @ ${job.company} -> Score: ${job.score}/100 [${job.match_level}]`);
          }
        }
      }

      evalDurationSec = ((Date.now() - evalStartTime) / 1000).toFixed(1);
      addLog("GEMINI_AI", `[STAGE COMPLETE] AI Evaluation Stage completed in ${evalDurationSec}s. Evaluated ${evaluatedJobsCount} job(s).`);
    } else if (jobsNeedingEval.length > 0) {
      if (!config.auto_evaluate) {
        addLog("GEMINI_AI", "Automatic evaluation is disabled in Pipeline Settings. New jobs saved as 'Un-evaluated'.");
      }
    } else {
      addLog("GEMINI_AI", "All tracked postings up to date. Skipping evaluation.");
    }

    if (isCancelled()) {
      isPipelineRunning = false;
      currentPipelineResult = { cancelled: true, summary: "Scan cancelled by user. No results were saved." };
      return res.json({ success: false, cancelled: true, summary: "Scan cancelled by user. No results were saved.", logs });
    }

    // Save to database only on successful full completion
    saveJobsDB(existingJobs);

    addLog("REPORT", "Generating Markdown report output/report.md...");
    const reportMd = generateMarkdownReport(existingJobs);

    const totalDurationSec = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    addLog("SUCCESS", `[PIPELINE COMPLETE] Full pipeline finished in ${totalDurationSec}s total (Scan Stage: ${scanDurationSec}s | Eval Stage: ${evalDurationSec}s). Database and output/report.md updated.`);

    const summaryText = existingJobs.length > 0
      ? `Scan complete. Scanned ${totalScannedCount} raw job posting(s) across target roles. Found ${existingJobs.length} posting(s) matching your location and company criteria.`
      : `Scan complete. Scanned ${totalScannedCount} raw job posting(s), but none matched criteria in selected window.`;

    isPipelineRunning = false;
    currentPipelineResult = {
      success: true,
      newJobsCount: existingJobs.length,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: existingJobs.length,
      totalScanned: totalScannedCount,
      summary: summaryText,
    };

    res.json({
      success: true,
      logs,
      newJobsCount: existingJobs.length,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: existingJobs.length,
      totalScanned: totalScannedCount,
      summary: summaryText,
      reportPath: "output/report.md",
    });
  } catch (error: any) {
    isPipelineRunning = false;
    currentPipelineResult = { success: false, summary: `Pipeline execution failed: ${error.message}` };
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
    const jobs = loadJobsDB(pid);
    const md = generateMarkdownReport(jobs, pid);
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
