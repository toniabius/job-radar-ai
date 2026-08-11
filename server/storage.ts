import path from "path";
import fs from "fs";
import { AppConfig, Job, ResumeData, CandidateProfile } from "../src/types.js";

export const CANDIDATE_PROFILE_JSON_PATH = path.join(process.cwd(), "config", "candidate_profile.json");

export function getDefaultCandidateProfile(): CandidateProfile {
  try {
    if (fs.existsSync(CANDIDATE_PROFILE_JSON_PATH)) {
      const data = JSON.parse(fs.readFileSync(CANDIDATE_PROFILE_JSON_PATH, "utf-8"));
      if (data && typeof data === "object") {
        return data as CandidateProfile;
      }
    }
  } catch (err) {
    console.error("Error reading candidate_profile.json:", err);
  }
  const fallback: CandidateProfile = {
    firstName: "Alex",
    lastName: "Morgan",
    fullName: "Alex Morgan",
    preferredName: "Alex",
    email: "alex.morgan@example.com",
    phone: "+1 (555) 234-5678",
    phoneDeviceType: "Mobile",
    howDidYouHear: "LinkedIn",
    city: "San Francisco",
    state: "CA",
    zipCode: "94105",
    country: "United States",
    linkedInUrl: "https://linkedin.com/in/alexmorgan-dev",
    githubUrl: "https://github.com/alexmorgan-dev",
    portfolioUrl: "https://alexmorgan.dev",
    workAuthorization: "US Citizen",
    sponsorshipRequired: "No",
    legallyAuthorized: "Yes",
    yearsExperience: 6,
    desiredSalary: "$165,000",
    noticePeriod: "2 weeks",
    relocation: "Hybrid / Flexible",
    gender: "Decline to Self-Identify",
    veteranStatus: "I am not a protected veteran",
    ethnicity: "Decline to Self-Identify",
    disabilityStatus: "No, I do not have a disability",
    knowledgeBase: [],
    customFields: [],
    workExperience: [
      {
        id: "exp-1",
        title: "Senior Software Engineer",
        company: "Capital One",
        location: "McLean VA",
        currentlyWorkHere: true,
        startMonth: "4",
        startYear: "2024",
        endMonth: "",
        endYear: "",
        description: "● MigrationAccelerator: Architected and delivered a self-service legacy dataset migration tool that cut dataset migration time by 70%, reduced support tickets by 50%, and generated $30M in operational savings; further built a CLI-based agent using Claude to automate bulk migration end-to-end, and to detect and remediate dataset validation and registration errors automatically.\n● Real-Time CDC Kinesis Processor: Designed and led development of a CDC pipeline framework template application using AWS Kinesis and event-driven architecture, enabling near real-time data synchronization and replacing a batch ETL system with hours of delay."
      }
    ]
  };
  writeFileIfChanged(CANDIDATE_PROFILE_JSON_PATH, JSON.stringify(fallback, null, 2));
  return fallback;
}
import { DEFAULT_CONFIG, SAMPLE_JOBS } from "../src/data/defaultData.js";
import { UserProfileData, ProfilesStore } from "./types.js";
import { writeFileIfChanged, dumpYaml } from "./utils.js";
import { parseResumeDetails, parseResumeDetailsEnriched } from "./resumeParser.js";
import { sanitizeJobEvaluation } from "./evaluator.js";

export const DATA_DIR = path.join(process.cwd(), "database");
export const CONFIG_JSON_PATH = path.join(process.cwd(), "config", "config.json");
export const CONFIG_YAML_PATH = path.join(process.cwd(), "config", "config.yaml");
export const PROFILES_JSON_PATH = path.join(process.cwd(), "config", "profiles.json");
export const RESUME_PATH = path.join(process.cwd(), "resume", "resume.md");
export const JOBS_DB_PATH = path.join(DATA_DIR, "jobs.db.json");
export const REPORT_PATH = path.join(process.cwd(), "output", "report.md");
export const REPORTS_DIR = path.join(process.cwd(), "output", "reports");

// Ensure base directories exist
[DATA_DIR, path.join(process.cwd(), "config"), path.join(process.cwd(), "resume"), path.join(process.cwd(), "output"), REPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export function loadProfilesData(): ProfilesStore {
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

export function saveProfilesData(store: ProfilesStore): void {
  writeFileIfChanged(PROFILES_JSON_PATH, JSON.stringify(store, null, 2));
}

export function loadCandidateProfile(profileId?: string): CandidateProfile {
  try {
    const store = loadProfilesData();
    const pid = profileId || store.activeProfileId;
    const active = store.profiles.find((p) => p.id === pid);

    if (active && active.candidateProfile) {
      return active.candidateProfile;
    }

    if (fs.existsSync(CANDIDATE_PROFILE_JSON_PATH)) {
      const candData: CandidateProfile = JSON.parse(fs.readFileSync(CANDIDATE_PROFILE_JSON_PATH, "utf-8"));
      if (active) {
        active.candidateProfile = candData;
        saveProfilesData(store);
      }
      return candData;
    }

    if (active) {
      const def = getDefaultCandidateProfile();
      active.candidateProfile = def;
      saveProfilesData(store);
      return def;
    }
  } catch (err) {
    console.error("Error loading candidate profile:", err);
  }
  return getDefaultCandidateProfile();
}

export function saveCandidateProfile(candProfile: CandidateProfile, profileId?: string): CandidateProfile {
  try {
    const store = loadProfilesData();
    const pid = profileId || store.activeProfileId;
    const active = store.profiles.find((p) => p.id === pid);
    if (active) {
      active.candidateProfile = candProfile;
      active.updatedAt = new Date().toISOString();
      saveProfilesData(store);
    }
    if (!profileId || profileId === store.activeProfileId) {
      writeFileIfChanged(CANDIDATE_PROFILE_JSON_PATH, JSON.stringify(candProfile, null, 2));
    }
  } catch (err) {
    console.error("Error saving candidate profile:", err);
  }
  return candProfile;
}

export function getActiveProfileId(): string {
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

export function getProfileJobsPath(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "database", "profiles", pid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "jobs.db.json");
}

export function getProfileReportPath(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "output", "profiles", pid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "report.md");
}

export function getProfileReportsDir(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "output", "profiles", pid, "reports");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getProfileLogsPath(profileId?: string): string {
  const pid = profileId || getActiveProfileId();
  const dir = path.join(process.cwd(), "output", "profiles", pid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "pipeline_logs.json");
}

export function loadConfigRaw(): AppConfig {
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

export function loadResumeRaw(configSkills?: string[]): ResumeData {
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

export function loadConfig(): AppConfig {
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

export function saveConfig(config: AppConfig): void {
  const jsonContent = JSON.stringify(config, null, 2);
  writeFileIfChanged(CONFIG_JSON_PATH, jsonContent);

  const yamlContent = "# Job Radar AI Pipeline Search & Evaluation Configuration\n" + dumpYaml(config);
  writeFileIfChanged(CONFIG_YAML_PATH, yamlContent);

  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      const active = store.profiles.find((p) => p.id === store.activeProfileId);
      if (active) {
        active.config = config;
        const currentSkills = active.resume?.parsedSkills || [];
        const newParsed = parseResumeDetails(active.resume.content, config.skills);
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

export function loadResume(): ResumeData {
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

export async function saveResume(content: string, enrichSkillsWithAi: boolean = false): Promise<ResumeData> {
  writeFileIfChanged(RESUME_PATH, content);
  const config = loadConfig();

  let existingSkills: string[] | undefined;
  try {
    if (fs.existsSync(PROFILES_JSON_PATH)) {
      const store: ProfilesStore = JSON.parse(fs.readFileSync(PROFILES_JSON_PATH, "utf-8"));
      const active = store.profiles.find((p) => p.id === store.activeProfileId);
      if (active?.resume?.parsedSkills?.length) {
        existingSkills = active.resume.parsedSkills;
      }
    }
  } catch (err) {
    // fallback
  }

  const resume = enrichSkillsWithAi
    ? await parseResumeDetailsEnriched(content, config.skills)
    : parseResumeDetails(content, config.skills);

  if (!enrichSkillsWithAi && existingSkills && existingSkills.length > 0) {
    resume.parsedSkills = existingSkills;
  }

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

export function loadJobsDB(profileId?: string): Job[] {
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

  return jobs.map((j) => sanitizeJobEvaluation(j, config.locations || [], config));
}

export function saveJobsDB(jobs: Job[], profileId?: string): void {
  const pid = profileId || getActiveProfileId();
  const config = loadConfig();
  const sanitizedJobs = jobs.map((j) => sanitizeJobEvaluation(j, config.locations || [], config));
  const profilePath = getProfileJobsPath(pid);
  const content = JSON.stringify(sanitizedJobs, null, 2);

  writeFileIfChanged(profilePath, content);

  if (pid === getActiveProfileId()) {
    writeFileIfChanged(JOBS_DB_PATH, content);
  }
}
