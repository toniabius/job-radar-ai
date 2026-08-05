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

export function sanitizeJobEvaluation(job: Job, preferredLocations: string[]): Job {
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

export function detectHardBlockerViolation(job: Job, hardBlockersText?: string): { isBlocked: boolean; reason: string } {
  if (!hardBlockersText || !hardBlockersText.trim()) {
    return { isBlocked: false, reason: "" };
  }

  const rawJobText = `${job.title} ${job.company} ${job.description || ''} ${job.department || ''}`.toLowerCase();
  const normJobText = rawJobText.replace(/u\.s\./g, "us").replace(/u\.s/g, "us");

  const lines = hardBlockersText
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

  for (const line of lines) {
    const rawLine = line.toLowerCase();
    const normLine = rawLine.replace(/u\.s\./g, "us").replace(/u\.s/g, "us");

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
      yoePenalty = 25;
      yoeNote = `Experience Gap (Weak Match): Candidate (~${candidateYoe} yrs) is below required ${yoeBounds.minYoe}+ yrs criteria`;
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
  if (targetMinSalary > 0 && job.salary && job.salary !== "$Not found") {
    const maxDisclosed = extractMaxSalaryNumber(job.salary);
    if (maxDisclosed > 0 && maxDisclosed < targetMinSalary) {
      isBelowTargetSalary = true;
      salaryPenalty = 25;
      salaryNote = `Below Target Salary (Weak Match): Disclosed salary max ($${maxDisclosed.toLocaleString()}) is below target minimum ($${targetMinSalary.toLocaleString()})`;
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
