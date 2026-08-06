import { Type } from "@google/genai";
import { AppConfig, Job, ResumeData } from "../src/types.js";
import {
  extractMaxSalaryNumber,
  extractYoeBounds,
  extractSalaryWithRegex,
  isLocationMatch,
} from "./utils.js";
import { loadConfig, loadResume, loadProfilesData, getActiveProfileId } from "./storage.js";
import { parseResumeDetails } from "./resumeParser.js";
import {
  hasValidApiKey,
  getGeminiClient,
  enforceGeminiRateLimit,
  ALL_GEMINI_FALLBACK_MODELS,
} from "./gemini.js";

export function sanitizeJobEvaluation(job: Job, preferredLocations: string[], configObj?: AppConfig): Job {
  if (!job) return job;
  const config = configObj || loadConfig();
  const prefLocs = preferredLocations || config.locations || [];

  let cleanedReasons = job.reasons || [];
  let cleanedMissing = job.missing_skills || [];
  let cleanedSummary = job.summary || "";

  if (prefLocs.length > 0 && isLocationMatch(job.location, prefLocs)) {
    const locMismatchPattern = /location mismatch|prefers.*washington dc|role is (in|based in).*wa|candidate's current location and preference mismatch|geographic distance|conflicts with the candidate's preference/i;

    if (Array.isArray(cleanedReasons)) {
      cleanedReasons = cleanedReasons.filter((r) => !locMismatchPattern.test(r));
    }
    if (Array.isArray(cleanedMissing)) {
      cleanedMissing = cleanedMissing.filter((m) => !locMismatchPattern.test(m));
    }
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
  }

  let newScore = job.score;
  let newMatchLevel: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched' | undefined = job.match_level;

  const hasHardBlocker =
    cleanedMissing.some((m) => m.toLowerCase().includes("hard blocker")) ||
    cleanedReasons.some((r) => r.toLowerCase().includes("hard blocker"));

  const hasYoeGap =
    cleanedMissing.some((m) => m.toLowerCase().includes("experience gap") || m.toLowerCase().includes("yoe")) ||
    cleanedReasons.some((r) => r.toLowerCase().includes("experience gap"));

  const hasOverQual =
    cleanedMissing.some((m) => m.toLowerCase().includes("over-qualification")) ||
    cleanedReasons.some((r) => r.toLowerCase().includes("over-qualification"));

  const targetMinSalary = config.min_salary || 0;
  let isSalaryBelow = false;
  let salaryBelowNote = "";

  const salaryTextOnly = (job.salary && job.salary !== "$Not found")
    ? job.salary
    : (extractSalaryWithRegex(job.description || "") || "");

  const isHourlySalary =
    /\b(?:hr|hour|hourly|\/hr)\b/i.test(salaryTextOnly) ||
    /\/\s*hr\b/i.test(salaryTextOnly) ||
    /\bper hour\b/i.test(salaryTextOnly) ||
    /\b(?:hr|hour|hourly|\/hr)\b/i.test(job.salary || "") ||
    /\/\s*hr\b/i.test(job.salary || "");

  const isUndisclosedSalary =
    !salaryTextOnly ||
    salaryTextOnly === "$Not found" ||
    salaryTextOnly.toLowerCase().includes("not found") ||
    salaryTextOnly.toLowerCase().includes("not disclosed");

  let maxDisclosed = 0;
  if (!isHourlySalary && !isUndisclosedSalary) {
    maxDisclosed = extractMaxSalaryNumber(salaryTextOnly);
  }

  if (!isHourlySalary && !isUndisclosedSalary && targetMinSalary > 0 && maxDisclosed > 0) {
    if (maxDisclosed < targetMinSalary) {
      isSalaryBelow = true;
      salaryBelowNote = `Below Target Salary (Weak Match): Disclosed annual high range ($${maxDisclosed.toLocaleString()}) is below minimum target ($${targetMinSalary.toLocaleString()})`;
    }
  }

  if (!isSalaryBelow) {
    const invalidSalaryPattern = /below.*target|target.*minimum|salary.*below|compensation.*below|falls below|\/hr.*target|rate.*below|compensation range.*below|lower end|lower-end|lower bound/i;

    if (Array.isArray(cleanedReasons)) {
      cleanedReasons = cleanedReasons.filter((r) => {
        const lower = r.toLowerCase();
        if (invalidSalaryPattern.test(r)) return false;
        if ((lower.includes("salary") || lower.includes("compensation") || lower.includes("rate") || lower.includes("pay")) &&
            (lower.includes("below") || lower.includes("under") || lower.includes("lower") || lower.includes("mismatch"))) {
          return false;
        }
        return true;
      });
    }

    if (Array.isArray(cleanedMissing)) {
      cleanedMissing = cleanedMissing.filter((m) => {
        const lower = m.toLowerCase();
        if (invalidSalaryPattern.test(m)) return false;
        if ((lower.includes("salary") || lower.includes("compensation") || lower.includes("rate") || lower.includes("pay")) &&
            (lower.includes("below") || lower.includes("under") || lower.includes("lower") || lower.includes("mismatch"))) {
          return false;
        }
        return true;
      });
    }

    if (cleanedSummary) {
      const sentences = cleanedSummary.split(/(?<=[.!?])\s+/);
      const validSentences = sentences.filter((s) => {
        const lower = s.toLowerCase();
        if (
          (lower.includes("compensation") || lower.includes("salary") || lower.includes("hourly") || lower.includes("/hr") || lower.includes("rate") || lower.includes("lower end") || lower.includes("pay")) &&
          (lower.includes("below") || lower.includes("under") || lower.includes("mismatch") || lower.includes("not ideal") || lower.includes("target"))
        ) {
          return false;
        }
        return true;
      });
      cleanedSummary = validSentences.join(" ").trim();
      if (!cleanedSummary && job.title && job.company) {
        cleanedSummary = `${job.title} at ${job.company} (${job.location}) aligns well with candidate profile and technical requirements.`;
      }
    }
  }

  let hasSalaryTextFlag = false;
  if (!isHourlySalary && !isUndisclosedSalary && maxDisclosed === 0) {
    const evalTextLower = [
      ...(Array.isArray(cleanedReasons) ? cleanedReasons : []),
      ...(Array.isArray(cleanedMissing) ? cleanedMissing : []),
      cleanedSummary,
    ].filter(Boolean).join(" ").toLowerCase();

    hasSalaryTextFlag =
      evalTextLower.includes("below target salary") ||
      evalTextLower.includes("below target minimum") ||
      evalTextLower.includes("below minimum target") ||
      evalTextLower.includes("below candidate's target") ||
      evalTextLower.includes("below the candidate's target") ||
      evalTextLower.includes("below the candidate's minimum requirement") ||
      evalTextLower.includes("compensation mismatch") ||
      (evalTextLower.includes("salary") && (evalTextLower.includes("below") || evalTextLower.includes("under"))) ||
      (evalTextLower.includes("compensation") && (evalTextLower.includes("below") || evalTextLower.includes("under")));
  }

  const cleanDesc = (job.description || "").trim();
  const isShortDesc = cleanDesc.length < 250 || (cleanDesc.includes("is hiring for a") && cleanDesc.includes("Direct posting listed on") && cleanDesc.length < 380);
  const hasQualifications = /qualification|requirement|responsibility|prerequisite|what you'll bring|what we're looking for|must have|skills|experience/i.test(cleanDesc);
  const isLackingDetails = isShortDesc || (!hasQualifications && cleanDesc.length < 450);

  const isClosedText =
    /no longer accepting applications/i.test(cleanDesc) ||
    /no longer taking applications/i.test(cleanDesc) ||
    /position is closed/i.test(cleanDesc) ||
    /position closed/i.test(cleanDesc) ||
    /job is closed/i.test(cleanDesc) ||
    /job is no longer available/i.test(cleanDesc) ||
    /this job has expired/i.test(cleanDesc) ||
    /posting expired/i.test(cleanDesc) ||
    /application closed/i.test(cleanDesc) ||
    /no longer active/i.test(cleanDesc);

  if (isClosedText || hasHardBlocker) {
    newScore = Math.min(newScore !== undefined ? newScore : 15, 15);
    newMatchLevel = "Unmatched";
    if (isClosedText) {
      const closedNote = "Job is no longer accepting applications (Position Closed/Expired).";
      if (!cleanedMissing.some((m) => m.toLowerCase().includes("no longer accepting"))) {
        cleanedMissing = [closedNote, ...cleanedMissing];
      }
    }
  } else if (isLackingDetails) {
    newScore = Math.min(newScore !== undefined ? newScore : 45, 45);
    newMatchLevel = "Weak Match";
    const shortDescNote = "Job description is too brief and lacks minimum qualifications or required role details.";
    if (!cleanedMissing.some((m) => m.toLowerCase().includes("too brief") || m.toLowerCase().includes("lacks minimum qualifications"))) {
      cleanedMissing = [shortDescNote, ...cleanedMissing];
    }
    if (!cleanedReasons.some((r) => r.toLowerCase().includes("brief description"))) {
      cleanedReasons = [shortDescNote, ...cleanedReasons];
    }
  } else if (isSalaryBelow || hasSalaryTextFlag) {
    newScore = 45;
    newMatchLevel = "Weak Match";
    if (salaryBelowNote && !cleanedReasons.some((r) => r.toLowerCase().includes("below target salary"))) {
      cleanedReasons = [salaryBelowNote, ...cleanedReasons];
    }
    if (!cleanedMissing.some((m) => m.toLowerCase().includes("salary"))) {
      if (salaryBelowNote) {
        cleanedMissing = [salaryBelowNote, ...cleanedMissing];
      } else if (targetMinSalary > 0) {
        cleanedMissing = [`Disclosed annual salary is below target minimum ($${targetMinSalary.toLocaleString()})`, ...cleanedMissing];
      }
    }
  } else if (hasYoeGap || hasOverQual) {
    newScore = 45;
    newMatchLevel = "Weak Match";
  } else {
    if (newScore === undefined || newScore < 80) {
      newScore = 85;
      newMatchLevel = "Strong Match";
    }
  }

  // Company size filter evaluation
  if (config.company_size_filter && config.company_size_filter !== 'any') {
    const sizePref = config.company_size_filter;
    const empMatch = cleanDesc.match(/\b(\d{1,3}(?:,\d{3})+|\d+)\+?\s*employees?\b/i) || cleanDesc.match(/company size:?\s*(\d+)/i);
    if (empMatch) {
      const count = parseInt(empMatch[1].replace(/,/g, ''), 10);
      if (sizePref === 'startup' && count > 300) {
        if (!cleanedMissing.some((m) => m.includes("Company size"))) {
          cleanedMissing.push(`Company size (${count.toLocaleString()} employees) exceeds candidate's startup preference (<200)`);
        }
      } else if (sizePref === 'enterprise' && count < 500) {
        if (!cleanedMissing.some((m) => m.includes("Company size"))) {
          cleanedMissing.push(`Company size (${count.toLocaleString()} employees) is below candidate's enterprise preference (1,000+)`);
        }
      }
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

export function detectHardBlockerViolation(job: Job, hardBlockersText?: string): { isBlocked: boolean; reason: string } {
  const rawJobText = `${job.title} ${job.company} ${job.description || ''} ${job.department || ''}`.toLowerCase();
  const normJobText = rawJobText.replace(/u\.s\./g, "us").replace(/u\.s/g, "us");

  const isClosedJob =
    /no longer accepting applications/i.test(normJobText) ||
    /no longer taking applications/i.test(normJobText) ||
    /position is closed/i.test(normJobText) ||
    /position closed/i.test(normJobText) ||
    /job is closed/i.test(normJobText) ||
    /job is no longer available/i.test(normJobText) ||
    /this job has expired/i.test(normJobText) ||
    /posting expired/i.test(normJobText) ||
    /application closed/i.test(normJobText) ||
    /no longer active/i.test(normJobText) ||
    /this listing is closed/i.test(normJobText) ||
    /this position is no longer accepting applications/i.test(normJobText);

  if (isClosedJob) {
    return { isBlocked: true, reason: "Hard Blocker: Job is no longer accepting applications (Position Closed)" };
  }

  if (!hardBlockersText || !hardBlockersText.trim()) {
    return { isBlocked: false, reason: "" };
  }

  // Remove standard EEO and background check boilerplate sentences that cause false positives
  const textWithoutEEO = normJobText
    .replace(/equal opportunity employer[\s\S]*?(?=\n\n|\.|$)/gi, "")
    .replace(/without regard to race[\s\S]*?(?=\n\n|\.|$)/gi, "")
    .replace(/affirmative action employer[\s\S]*?(?=\n\n|\.|$)/gi, "")
    .replace(/regardless of race, color[\s\S]*?(?=\n\n|\.|$)/gi, "")
    .replace(/eeo policy[\s\S]*?(?=\n\n|\.|$)/gi, "");

  const titleLower = (job.title || "").toLowerCase();

  const lines = hardBlockersText
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

  for (const line of lines) {
    const rawLine = line.toLowerCase();
    const normLine = rawLine.replace(/u\.s\./g, "us").replace(/u\.s/g, "us");

    // Rule 1: U.S. Citizenship / Security Clearance
    if (
      normLine.includes("citizen") ||
      normLine.includes("citizenship") ||
      normLine.includes("clearance") ||
      normLine.includes("security clearance") ||
      normLine.includes("ts/sci") ||
      normLine.includes("polygraph")
    ) {
      const isExplicitCitizenshipOrClearance =
        textWithoutEEO.includes("must be a u.s. citizen") ||
        textWithoutEEO.includes("must be a us citizen") ||
        textWithoutEEO.includes("u.s. citizenship required") ||
        textWithoutEEO.includes("us citizenship required") ||
        textWithoutEEO.includes("u.s. citizens only") ||
        textWithoutEEO.includes("us citizens only") ||
        textWithoutEEO.includes("restricted to u.s. citizens") ||
        textWithoutEEO.includes("restricted to us citizens") ||
        textWithoutEEO.includes("active security clearance") ||
        textWithoutEEO.includes("active secret clearance") ||
        textWithoutEEO.includes("active top secret") ||
        textWithoutEEO.includes("active ts/sci") ||
        textWithoutEEO.includes("ts/sci with polygraph") ||
        textWithoutEEO.includes("top secret/sci") ||
        textWithoutEEO.includes("polygraph required") ||
        textWithoutEEO.includes("security clearance is required") ||
        textWithoutEEO.includes("must possess an active security clearance") ||
        textWithoutEEO.includes("must hold an active security clearance") ||
        textWithoutEEO.includes("ability to obtain and maintain a security clearance");

      if (isExplicitCitizenshipOrClearance) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Role requires U.S. Citizenship or Security Clearance ("${line}")`
        };
      }
    }

    // Rule 2: Data Engineer / Data Architect roles
    if (
      normLine.includes("data engineer") ||
      normLine.includes("data architect")
    ) {
      if (
        titleLower.includes("data engineer") ||
        titleLower.includes("data architect") ||
        titleLower.includes("data engineering")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Restricted Data Engineer / Data Architect role ("${line}")`
        };
      }
    }

    // Rule 3: Test Engineer / QA / SDET roles
    if (
      normLine.includes("test engineer") ||
      normLine.includes("qa engineer") ||
      normLine.includes("qa") ||
      normLine.includes("sdet")
    ) {
      if (
        titleLower.includes("test engineer") ||
        titleLower.includes("qa engineer") ||
        titleLower.includes("quality assurance") ||
        titleLower.includes("sdet") ||
        titleLower.includes("software engineer in test") ||
        titleLower.includes("system test") ||
        titleLower.includes("validation engineer")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Restricted Test Engineer / QA role ("${line}")`
        };
      }
    }

    // Rule 4: iOS / Android / Mobile Development roles
    if (
      normLine.includes("ios") ||
      normLine.includes("android") ||
      normLine.includes("mobile")
    ) {
      if (
        titleLower.includes("ios") ||
        titleLower.includes("android") ||
        titleLower.includes("mobile engineer") ||
        titleLower.includes("mobile developer") ||
        titleLower.includes("mobile app")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: iOS / Android Development role ("${line}")`
        };
      }
    }

    // Rule 5: People Manager roles
    if (
      normLine.includes("people manager") ||
      normLine.includes("engineering manager") ||
      normLine.includes("manager roles")
    ) {
      if (
        titleLower.includes("engineering manager") ||
        titleLower.includes("software engineering manager") ||
        titleLower.includes("dev manager") ||
        titleLower.includes("tech lead manager") ||
        titleLower.includes("people manager") ||
        titleLower.includes("director of engineering") ||
        titleLower.includes("vp of engineering")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: People Manager role ("${line}")`
        };
      }
    }

    // Rule 6: Pure Frontend roles
    if (
      normLine.includes("pure frontend") ||
      normLine.includes("frontend only") ||
      normLine.includes("frontend without backend") ||
      normLine.includes("front end")
    ) {
      if (
        (titleLower.includes("frontend") || titleLower.includes("front end") || titleLower.includes("front-end")) &&
        !titleLower.includes("fullstack") &&
        !titleLower.includes("full stack") &&
        !titleLower.includes("backend") &&
        !titleLower.includes("full-stack")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Pure Frontend role ("${line}")`
        };
      }
    }

    // Rule 7: 5 Days On-Site requirement
    if (
      normLine.includes("on-site") ||
      normLine.includes("onsite") ||
      normLine.includes("in-office") ||
      normLine.includes("5 days")
    ) {
      if (
        textWithoutEEO.includes("5 days in office") ||
        textWithoutEEO.includes("5 days on-site") ||
        textWithoutEEO.includes("100% on-site") ||
        textWithoutEEO.includes("onsite 5 days") ||
        textWithoutEEO.includes("5 days a week on-site")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: 5-Day On-site requirement ("${line}")`
        };
      }
    }

    // Rule 8: Contractor or 1099 roles
    if (
      normLine.includes("contractor") ||
      normLine.includes("1099") ||
      normLine.includes("contract role") ||
      normLine.includes("temp")
    ) {
      if (
        textWithoutEEO.includes("contractor") ||
        textWithoutEEO.includes("1099") ||
        textWithoutEEO.includes("contract role") ||
        textWithoutEEO.includes("w2 contract") ||
        textWithoutEEO.includes("contract position") ||
        textWithoutEEO.includes("contract-to-hire") ||
        textWithoutEEO.includes("temp position") ||
        textWithoutEEO.includes("temporary position")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Contractor or 1099 role ("${line}")`
        };
      }
    }

    // Rule 9: Recruiting / Staffing Agency
    if (
      normLine.includes("recruiter") ||
      normLine.includes("recruiting") ||
      normLine.includes("staffing") ||
      normLine.includes("agency") ||
      normLine.includes("direct hire")
    ) {
      if (
        textWithoutEEO.includes("staffing agency") ||
        textWithoutEEO.includes("recruiting agency") ||
        textWithoutEEO.includes("recruitment agency") ||
        textWithoutEEO.includes("placement agency") ||
        textWithoutEEO.includes("employment agency") ||
        textWithoutEEO.includes("talent agency") ||
        textWithoutEEO.includes("on behalf of our client") ||
        textWithoutEEO.includes("posting for our client") ||
        textWithoutEEO.includes("our client is hiring")
      ) {
        return {
          isBlocked: true,
          reason: `Hard Blocker Triggered: Recruiting or staffing agency post (only company direct hire allowed) ("${line}")`
        };
      }
    }
  }

  return { isBlocked: false, reason: "" };
}

export function generateHeuristicEvaluation(job: Job, resume: ResumeData, config?: AppConfig) {
  const text = `${job.title} ${job.company} ${job.description || ''} ${job.department || ''}`.toLowerCase();

  const resumeSkills = resume.parsedSkills?.length
    ? resume.parsedSkills
    : (config?.skills ?? ["TypeScript", "React", "Node.js", "Python", "REST API", "GraphQL"]);

  const matchedSkills = resumeSkills.filter((s) => text.includes(s.toLowerCase()));

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

  let locationPenalty = 0;
  let locationNote = "";
  if (config && config.locations && config.locations.length > 0) {
    if (!isLocationMatch(job.location, config.locations)) {
      locationPenalty = 25;
      locationNote = `Location mismatch: ${job.location} is not in preferred locations (${config.locations.join(", ")})`;
    }
  }

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
      yoePenalty = 35;
      yoeNote = `Experience Gap (Weak Match): Candidate (~${candidateYoe} yrs) is below required ${yoeBounds.minYoe}+ yrs criteria (deficit of ${gap} year(s))`;
    }
  } else if (candidateYoe > 0 && yoeBounds.maxYoe !== undefined && candidateYoe > yoeBounds.maxYoe) {
    isExceedingMaxYoe = true;
    yoePenalty = 25;
    yoeNote = `Over-Qualified for YOE Ceiling (Weak Match): Candidate (~${candidateYoe} yrs) exceeds role's maximum experience range (${yoeBounds.minYoe}-${yoeBounds.maxYoe} yrs)`;
  }

  let salaryPenalty = 0;
  let salaryNote = "";
  let isBelowTargetSalary = false;
  const targetMinSalary = config?.min_salary || 0;
  const salaryTextOnly = (job.salary && job.salary !== "$Not found")
    ? job.salary
    : (extractSalaryWithRegex(job.description || "") || "");

  if (targetMinSalary > 0 && salaryTextOnly && salaryTextOnly !== "$Not found") {
    const isHourly = /\b(?:hr|hour|hourly|\/hr)\b/i.test(salaryTextOnly);
    if (!isHourly) {
      const maxDisclosed = extractMaxSalaryNumber(salaryTextOnly);
      if (maxDisclosed >= 1000 && maxDisclosed < targetMinSalary) {
        isBelowTargetSalary = true;
        salaryPenalty = 35;
        salaryNote = `Below Target Salary (Weak Match): Disclosed annual high range ($${maxDisclosed.toLocaleString()}) is below minimum target ($${targetMinSalary.toLocaleString()})`;
      }
    }
  }

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
  if (isUnderYoe || isExceedingMaxYoe || isBelowTargetSalary) scoreCap = Math.min(scoreCap, 45);
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
    matchedSkills.length > 0
      ? `Matched core skills: ${matchedSkills.join(", ")}.`
      : `General software engineering principles align with role requirements.`
  ];

  if (hardBlockerNote) {
    reasons.unshift(hardBlockerNote);
  }
  if (salaryNote) {
    reasons.push(salaryNote);
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
  if (salaryNote) {
    missingList.unshift(salaryNote);
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

export async function batchDetermineJobSalaries(
  jobsInput: Array<{ description: string; title?: string; company?: string }>
): Promise<string[]> {
  if (!jobsInput || jobsInput.length === 0) return [];

  const results: string[] = new Array(jobsInput.length).fill("$Not found");
  const indicesNeedingAI: number[] = [];

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

  if (indicesNeedingAI.length === 0 || !hasValidApiKey()) {
    return results;
  }

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

    const prompt = `You are a compensation analyst specializing in tech industry job postings. Extract only explicitly stated base salary or pay rate information from each job posting below.

CRITICAL RULES:
1. Return ONLY a JSON array of objects, each containing "index" (number, 0 to ${chunkJobs.length - 1}) and "salary" (string).
2. Extract BASE SALARY ONLY. Ignore equity (RSUs, stock options), signing bonuses, OTE, or total compensation figures unless they are the only compensation figure provided.
3. Format annual base salary ranges as "$X - $Y" (e.g., "$175,000 - $280,000").
4. Convert abbreviated ranges: "$175K - $280K", "$175k-$280k", "$175,000/yr" → "$175,000 - $280,000".
5. For hourly pay rates (e.g. "$80 - $120/hr"), return "$80 - $120 / hr".
6. For single-value salaries (e.g. "up to $200,000"), return "$0 - $200,000".
7. If the posting only mentions OTE or total comp with no explicit base breakdown, return "Not found".
8. DO NOT INFER, ESTIMATE, OR GUESS any salary. Only extract figures explicitly stated in the text.
9. If no salary or pay rate is disclosed for a job, return "Not found".

Postings:
${promptJobsText}`;

    for (const model of candidateModels) {
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

        const rawText = response.text || "[]";
        const parsed: Array<{ index: number; salary: string }> = JSON.parse(rawText);

        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            if (typeof item.index === "number" && item.index >= 0 && item.index < chunkIndices.length) {
              const origIdx = chunkIndices[item.index];
              const salVal = (item.salary || "").trim();
              if (salVal && salVal !== "Not found" && salVal !== "$Not found") {
                results[origIdx] = salVal;
              }
            }
          }
          break;
        }
      } catch (err: any) {
        console.warn(`[SALARY BATCH AI] ${model} failed, trying fallback...`, err?.message);
      }
    }
  }

  return results;
}

export async function batchEvaluateJobsWithGemini(
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

  const results: Array<{
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
  }> = [];

  const unassignedJobs: Job[] = [];

  if (!hasValidApiKey()) {
    console.log("[GEMINI MATCHER] No valid API key, using ATS Heuristic engine fallback.");
    const parsedRes = parseResumeDetails(resumeContent, configObj.skills);
    for (const job of jobsList) {
      const heur = generateHeuristicEvaluation(job, parsedRes, configObj);
      results.push({
        jobId: job.id,
        evaluation: { ...heur, model_used: "ATS Heuristic Engine" },
      });
    }
    return results;
  }

  const primaryModel = configObj.gemini_model || "gemini-3.1-flash-lite";
  const candidateModels = [primaryModel, ...ALL_GEMINI_FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);

  const BATCH_SIZE = 5;
  for (let b = 0; b < jobsList.length; b += BATCH_SIZE) {
    const chunk = jobsList.slice(b, b + BATCH_SIZE);

    const promptJobsText = chunk
      .map((j) => {
        const textSnippet = (j.description || "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 3500);
        return `[Job ID: ${j.id}]
Title: ${j.title}
Company: ${j.company}
Location: ${j.location}
Department: ${j.department || "Engineering"}
Salary Disclosed: ${j.salary || "$Not found"}
Posting Description:
${textSnippet}`;
      })
      .join("\n\n---\n\n");

    const prompt = `You are a principal technical recruiter and software engineering bar raiser evaluating candidate resume fit for job postings.

CANDIDATE RESUME:
${resumeContent.slice(0, 12000)}

EVALUATION RULES & CRITERIA:
1. Target Roles: ${configObj.target_roles?.join(", ") || "Software Engineer"}
2. Hard Blockers to Flag / Penalize:
${configObj.hard_blockers || "U.S. Citizenship requirement, Security Clearance, Contractor / 1099, Pure Frontend"}
3. Target Minimum Salary: $${(configObj.min_salary || 0).toLocaleString()}
4. Preferred Locations: ${configObj.locations?.join(", ") || "Any"}

JOB POSTINGS TO EVALUATE:
${promptJobsText}

Instructions:
- Evaluate each job ID separately against the candidate resume.
- CRITICAL HARD BLOCKER RULE:
  - DO NOT flag standard EEO statement mentions of "citizenship" or standard background checks as requiring U.S. Citizenship or Security Clearance. ONLY flag if the job explicitly requires U.S. Citizenship or Security Clearance.
  - DO NOT flag software engineering or AI engineering roles as "Data Engineer" or "Test Engineer" unless the job title explicitly specifies Data Engineer, Test Engineer, or QA.
- STRICT CORE SKILL & PROGRAMMING LANGUAGE VERIFICATION RULE (MANDATORY):
  - Extract skills and programming languages explicitly listed in the candidate's resume text.
  - Verify every primary programming language or core technology required by the job (e.g., C++, Rust, Go, Java, Python, C#, Swift, etc.) against the candidate's resume.
  - NEVER hallucinate or assume candidate experience in a language or skill (such as C++) if it is NOT explicitly present in their resume text. DO NOT write reasons like "Meets core requirement for C++" or "C++ experience" unless C++ is explicitly listed in their resume.
  - MISSING CORE SKILL PENALTY: If a job mandates a primary programming language or core technology (e.g., C++ for a C++/systems engineering position) that is ABSENT from the candidate's resume:
    1. You MUST list the missing language/technology explicitly in missing_skills (e.g., "C++ (not found on candidate resume)").
    2. The match_level MUST NOT be "Strong Match" or "Good Match". It MUST be classified as "Weak Match" (or "Unmatched") with score <= 45/100.
    3. You MUST state the missing core skill gap clearly in the summary.
- STRICT YEARS OF EXPERIENCE (YOE) EVALUATION RULE (MANDATORY):
  - Extract the candidate's total Years of Experience (YOE) from their resume.
  - Extract the minimum required Years of Experience (YOE) from the job description (e.g., "5+ years", "6+ years", "8+ years", Senior/Staff requirements).
  - STRICT DEFICIT PENALTY: If the candidate's total YOE is less than the job description's required minimum YOE by EVEN ONE YEAR (for example, candidate has 5 YOE but the job requires 6+ YOE, or candidate has 4 YOE but job requires 5+ YOE):
    1. The match_level MUST be classified as "Weak Match" (or "Unmatched" if the YOE gap is 3+ years). It MUST NOT be classified as "Strong Match" or "Good Match".
    2. The match score MUST NOT exceed 45/100.
    3. You MUST explicitly state the YOE deficit in the summary (e.g. "Candidate has 5 YOE, which is below the required 6+ YOE for this role") and include it as the first item in missing_skills.
- STRICT SALARY EVALUATION RULE (MANDATORY):
  - Compare the job's disclosed ANNUAL salary range against the candidate's Target Minimum Salary ($${(configObj.min_salary || 0).toLocaleString()}).
  - DO NOT compare, flag, or penalize if the salary is HOURLY (e.g. "$75 - $85 / hr", "$60/hr", "hourly", "contract rate") or if salary is "$Not found" or not disclosed. Hourly rate positions and non-disclosed salaries MUST NEVER be treated as below target minimum salary or as a mismatch. DO NOT write in summary, reasons, or missing_skills that an hourly rate or undisclosed salary is below the target minimum or a mismatch.
  - ACCEPTABLE SALARY RANGE: If the MAXIMUM / UPPER END of the disclosed annual salary range (e.g. $235,375) reaches or exceeds the Target Minimum Salary ($${(configObj.min_salary || 0).toLocaleString()}), the salary MUST be treated as fully ACCEPTABLE and MUST NOT be penalized or listed as a gap or mismatch, even if the lower end of the range (e.g. $146,400) is below target minimum salary. DO NOT write in summary, reasons, or missing_skills that the salary lower end is below target minimum.
  - STRICT ANNUAL SALARY BELOW TARGET PENALTY: ONLY if a job discloses an ANNUAL salary range (e.g., $120,000 - $180,000/yr) and its maximum / upper end (annual high range) is BELOW the Target Minimum Salary (e.g. $180,000 < $200,000):
    1. The match_level MUST be classified as "Weak Match" (or "Unmatched"). It MUST NOT be classified as "Strong Match" or "Good Match".
    2. The match score MUST NOT exceed 45/100.
    3. You MUST state the annual salary deficit in the summary (e.g. "Disclosed annual high range ($180,000) is below minimum target ($200,000)") and include it in missing_skills.
- EXPIRED / CLOSED JOB RULE (MANDATORY):
  - If a job posting contains text indicating "no longer accepting applications", "no longer taking applications", "position is closed", "job is closed", "this job has expired", or "no longer active":
    1. You MUST classify the match_level as "Unmatched" with match score 10-25.
    2. You MUST state in summary and missing_skills: "Job is no longer accepting applications (position closed/expired)".
- BRIEF DESCRIPTION / MISSING QUALIFICATIONS RULE (MANDATORY):
  - If a job description is extremely short (e.g. fewer than 250 characters or just a default generic single sentence) or lacks minimum qualifications/requirements and basic details on what the role is about:
    1. You MUST classify the match_level as "Weak Match" with match score <= 45/100.
    2. You MUST state in missing_skills and summary: "Job description is too brief and lacks required qualifications or role details".
- Calculate a match score (0 to 100) and match level (Strong Match | Good Match | Weak Match | Unmatched).
- Provide 2-3 sentence executive summary, specific reasons, missing skills/gaps, and recommended actions.`;

    let chunkSuccess = false;

    for (const model of candidateModels) {
      try {
        await enforceGeminiRateLimit(model);
        const ai = getGeminiClient();

        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
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

              const targetMinSal = configObj.min_salary || 0;
              if (targetMinSal > 0) {
                const salStr = (job.salary && job.salary !== "$Not found")
                  ? job.salary
                  : (extractSalaryWithRegex(job.description || "") || "");
                if (salStr && salStr !== "$Not found") {
                  const isHourly = /\b(?:hr|hour|hourly|\/hr)\b/i.test(salStr);
                  if (!isHourly) {
                    const maxDisclosed = extractMaxSalaryNumber(salStr);
                    if (maxDisclosed >= 1000 && maxDisclosed < targetMinSal) {
                      evalObj.score = Math.min(evalObj.score || 45, 45);
                      evalObj.match_level = 'Weak Match';
                      if (!Array.isArray(evalObj.reasons)) evalObj.reasons = [];
                      const salMsg = `Below Target Salary (Weak Match): Disclosed annual high range ($${maxDisclosed.toLocaleString()}) is below minimum target ($${targetMinSal.toLocaleString()})`;
                      if (!evalObj.reasons.some((r: string) => r.toLowerCase().includes("below target salary") || r.toLowerCase().includes("salary"))) {
                        evalObj.reasons.unshift(salMsg);
                      }
                      if (!Array.isArray(evalObj.missing_skills)) evalObj.missing_skills = [];
                      if (!evalObj.missing_skills.some((m: string) => m.toLowerCase().includes("salary"))) {
                        evalObj.missing_skills.unshift(`Annual salary high range ($${maxDisclosed.toLocaleString()}) below target minimum ($${targetMinSal.toLocaleString()})`);
                      }
                    }
                  }
                }
              }
            }

            const sanitized = sanitizeJobEvaluation(
              { ...job, ...evalObj },
              configObj.locations,
              configObj
            );

            results.push({
              jobId: job.id,
              evaluation: {
                score: sanitized.score || 0,
                match_level: sanitized.match_level || 'Good Match',
                summary: sanitized.summary || '',
                reasons: sanitized.reasons || [],
                missing_skills: sanitized.missing_skills || [],
                recommended_actions: sanitized.recommended_actions || [],
                model_used: `Gemini AI (${model})`,
              },
            });
          }
          chunkSuccess = true;
          break;
        }
      } catch (err: any) {
        console.warn(`[GEMINI MATCHER BATCH] Model ${model} failed, trying fallback...`, err?.message);
      }
    }

    if (!chunkSuccess) {
      unassignedJobs.push(...chunk);
    }
  }

  if (unassignedJobs.length > 0) {
    const parsedRes = parseResumeDetails(resumeContent, configObj.skills);
    for (const job of unassignedJobs) {
      const heur = generateHeuristicEvaluation(job, parsedRes, configObj);
      results.push({
        jobId: job.id,
        evaluation: { ...heur, model_used: "ATS Heuristic Engine" },
      });
    }
  }

  return results;
}

export async function evaluateJobWithGemini(
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
