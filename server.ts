import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { AppConfig, Job, ResumeData } from "./src/types.js";
import { UserProfileData, ProfilesStore } from "./server/types.js";
import { extractTextFromPdf } from "./server/pdf.js";
import {
  writeFileIfChanged,
  extractExperienceInfo,
} from "./server/utils.js";
import {
  RESUME_PATH,
  PROFILES_JSON_PATH,
  REPORTS_DIR,
  REPORT_PATH,
  loadProfilesData,
  saveProfilesData,
  getActiveProfileId,
  loadConfig,
  saveConfig,
  loadResume,
  saveResume,
  loadJobsDB,
  saveJobsDB,
  getProfileReportPath,
  getProfileReportsDir,
  loadCandidateProfile,
  saveCandidateProfile,
  CANDIDATE_PROFILE_JSON_PATH,
  getDefaultCandidateProfile,
} from "./server/storage.js";
import { generateApplicationAnswer, parseCandidateProfileWithAI } from "./server/gemini.js";
import {
  extractSkillsRegex,
  extractSkillsWithGemini,
  parseResumeDetails,
} from "./server/resumeParser.js";
import {
  evaluateJobWithGemini,
  batchEvaluateJobsWithGemini,
  sanitizeJobEvaluation,
} from "./server/evaluator.js";
import { generateMarkdownReport } from "./server/reporter.js";
import {
  runPipeline,
  getPipelineLogsData,
  clearPipelineLogs,
  setPipelineCancelled,
  setStopFetchingRequested,
  appendPipelineLog,
  setIsPipelineRunning,
  activePipelineCancelled,
} from "./server/pipeline.js";
import {
  hasValidApiKey,
  getGeminiClient,
  enforceGeminiRateLimit,
} from "./server/gemini.js";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve output files statically
app.use("/output", express.static(path.join(process.cwd(), "output")));
app.use("/extension", express.static(path.join(process.cwd(), "public/extension")));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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

  saveConfig(target.config);
  writeFileIfChanged(RESUME_PATH, target.resume.content);

  const candProfile = loadCandidateProfile(profileId);
  writeFileIfChanged(CANDIDATE_PROFILE_JSON_PATH, JSON.stringify(candProfile, null, 2));

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
    candidateProfile: candProfile,
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
  let baseCandProfile = loadCandidateProfile();
  let baseJobs: Job[] = [];

  if (copyFromProfileId) {
    const source = store.profiles.find((p) => p.id === copyFromProfileId);
    if (source) {
      baseConfig = JSON.parse(JSON.stringify(source.config));
      baseResumeContent = source.resume.content;
      baseCandProfile = JSON.parse(JSON.stringify(loadCandidateProfile(copyFromProfileId)));
      baseJobs = JSON.parse(JSON.stringify(loadJobsDB(copyFromProfileId)));
    }
  } else {
    baseCandProfile = getDefaultCandidateProfile();
  }

  const newId = `profile-${Date.now()}`;
  const parsedResume = parseResumeDetails(baseResumeContent, baseConfig.skills);
  const newProfile: UserProfileData = {
    id: newId,
    name: name.trim(),
    config: baseConfig,
    resume: parsedResume,
    candidateProfile: baseCandProfile,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.profiles.push(newProfile);
  store.activeProfileId = newId;
  saveProfilesData(store);

  saveConfig(baseConfig);
  writeFileIfChanged(RESUME_PATH, baseResumeContent);
  saveCandidateProfile(baseCandProfile, newId);
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
    candidateProfile: baseCandProfile,
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
    const expInfo = extractExperienceInfo(resumeContent);
    const skillsToUse = Array.isArray(parsedSkills) && parsedSkills.length > 0
      ? parsedSkills
      : (existing.resume?.parsedSkills?.length
        ? existing.resume.parsedSkills
        : extractSkillsRegex(resumeContent, existing.config?.skills));

    existing.resume = {
      title: "Resume",
      lastUpdated: new Date().toISOString().split("T")[0],
      content: resumeContent,
      parsedSkills: skillsToUse,
      experienceYears: expInfo.experienceYears,
    };
  } else if (Array.isArray(parsedSkills) && existing.resume) {
    existing.resume.parsedSkills = parsedSkills;
  }

  existing.updatedAt = new Date().toISOString();
  store.profiles[index] = existing;
  saveProfilesData(store);

  if (id === store.activeProfileId) {
    if (newConfig) saveConfig(newConfig);
    if (resumeContent !== undefined) {
      writeFileIfChanged(RESUME_PATH, resumeContent);
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
    const cand = loadCandidateProfile(newActive.id);
    writeFileIfChanged(CANDIDATE_PROFILE_JSON_PATH, JSON.stringify(cand, null, 2));
  }

  saveProfilesData(store);

  const activePid = store.activeProfileId;
  const activeJobs = loadJobsDB(activePid);
  saveJobsDB(activeJobs, activePid);
  const reportMd = generateMarkdownReport(activeJobs, activePid);

  const updatedStore = loadProfilesData();
  const activeCand = loadCandidateProfile(activePid);
  res.json({
    success: true,
    activeProfileId: updatedStore.activeProfileId,
    profiles: updatedStore.profiles,
    config: loadConfig(),
    resume: loadResume(),
    candidateProfile: activeCand,
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

    let extractedPdfText = "";
    try {
      extractedPdfText = await extractTextFromPdf(pdfBuffer);
    } catch (pdfErr: any) {
      console.warn("pdf-parse extraction warning:", pdfErr.message);
    }

    let extractedMarkdown = "";

    if (hasValidApiKey()) {
      try {
        const ai = getGeminiClient();
        const userPrompt = `You are a world-class ATS (Applicant Tracking System) resume parser with expert knowledge of tech industry career progression. Convert the PDF resume document (${filename || 'resume.pdf'}) into clean, complete, and beautifully structured Markdown.

EXPERIENCE COMPUTATION (CRITICAL):
1. Calculate total years of professional work experience by summing all employment periods, excluding education and internships unless they are the candidate's only experience.
2. For overlapping roles (e.g. consulting while employed full-time), do not double-count time.
3. Count contract, freelance, and consulting engagements as valid professional experience.
4. Place this line near the top, under the candidate's contact info:
   **Total Professional Experience:** ~X Years (YYYY–Present)

FORMATTING INSTRUCTIONS:
- Preserve all facts, technologies, dates, metrics, and bullet points verbatim — do not rephrase, summarize, or omit anything.
- Use clear Markdown headers: # Name, ## Summary, ## Experience, ## Education, ## Skills, ## Projects (if present).
- Under each role, format as: **Company** | **Title** | Dates | Location (if available), followed by bullet points.
- Group skills by category if the resume does so (e.g. Languages, Frameworks, Cloud, Tools).
- If the resume is in a language other than English, translate section headers to English but preserve the content as-is.
- Return ONLY raw Markdown — no code block backticks, no preamble, no meta-commentary.`;

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
        console.log("Notice: PDF formatting fallback to direct text extraction.");
      }
    }

    if (!extractedMarkdown && extractedPdfText) {
      extractedMarkdown = `# ${filename ? filename.replace(/\.pdf$/i, "") : "Uploaded Resume"}\n\n` +
        `*Parsed directly from PDF text layer (${new Date().toISOString().split("T")[0]})*\n\n---\n\n` +
        extractedPdfText;
    } else if (!extractedMarkdown) {
      extractedMarkdown = `# Uploaded Resume (${filename || "resume.pdf"})\n\nUnable to extract text layer from PDF file.`;
    }

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

    const resume = await saveResume(extractedMarkdown, true);
    res.json({ success: true, resume, extractedMarkdown, rawTextLength: extractedPdfText.length });
  } catch (err: any) {
    console.error("PDF Resume parse error:", err);
    res.status(500).json({ error: "Failed to parse PDF resume: " + err.message });
  }
});

// 2b. Candidate Auto-Fill Profile & Knowledge Base Endpoints
app.get("/api/candidate-profile", (req, res) => {
  const profileId = req.query.profileId as string | undefined;
  const profile = loadCandidateProfile(profileId);
  res.json(profile);
});

app.post("/api/candidate-profile", (req, res) => {
  const { candidateProfile, profileId } = req.body;
  if (!candidateProfile) {
    return res.status(400).json({ error: "Candidate profile object is required" });
  }
  const saved = saveCandidateProfile(candidateProfile, profileId);
  const store = loadProfilesData();
  res.json({ success: true, candidateProfile: saved, profiles: store.profiles });
});

app.post("/api/candidate-profile/generate-answer", async (req, res) => {
  try {
    const { question, jobId, jobContext, jobUrl, wordLimit } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Application question is required" });
    }

    const candidateProfile = loadCandidateProfile();
    const resumeData = loadResume();

    let contextToUse = jobContext || "";
    if (jobUrl && jobUrl.trim()) {
      try {
        const urlRes = await fetch(jobUrl.trim(), {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (urlRes.ok) {
          const html = await urlRes.text();
          const cleanText = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          contextToUse += `\n\n=== Job Description from ${jobUrl.trim()} ===\n${cleanText.slice(0, 3500)}`;
        } else {
          contextToUse += `\nTarget Job Listing URL: ${jobUrl.trim()}`;
        }
      } catch (fetchErr: any) {
        console.warn("[JD FETCH] Failed to fetch job URL:", fetchErr.message);
        contextToUse += `\nTarget Job Listing URL: ${jobUrl.trim()}`;
      }
    } else if (!contextToUse && jobId) {
      const jobs = loadJobsDB();
      const matchedJob = jobs.find((j) => j.id === jobId);
      if (matchedJob) {
        contextToUse = `Company: ${matchedJob.company}\nTitle: ${matchedJob.title}\nDescription: ${matchedJob.description}`;
      }
    }

    const generatedAnswer = await generateApplicationAnswer(
      question.trim(),
      contextToUse,
      candidateProfile,
      resumeData.content,
      wordLimit,
      jobUrl
    );

    res.json({ success: true, answer: generatedAnswer });
  } catch (err: any) {
    console.error("Generate answer error:", err);
    res.status(500).json({ error: err.message || "Failed to generate answer" });
  }
});

app.post("/api/candidate-profile/ai-parse", async (req, res) => {
  try {
    const { text } = req.body || {};
    let textToParse = text || "";

    if (!textToParse || !textToParse.trim()) {
      const resume = loadResume();
      textToParse = resume.content || "";
    }

    if (!textToParse || !textToParse.trim()) {
      return res.status(400).json({
        error: "No text or resume content found to parse. Please upload or paste resume text."
      });
    }

    const parsedData = await parseCandidateProfileWithAI(textToParse);

    // Merge with current profile to avoid wiping fields if empty
    const currentProfile = loadCandidateProfile();
    const updatedProfile = {
      ...currentProfile,
      ...parsedData,
      knowledgeBase: [
        ...(currentProfile.knowledgeBase || []),
        ...(parsedData.knowledgeBase || []).filter(
          (newKb: any) =>
            !(currentProfile.knowledgeBase || []).some(
              (oldKb: any) =>
                oldKb.questionPattern.toLowerCase() === newKb.questionPattern.toLowerCase()
            )
        )
      ]
    };

    const saved = saveCandidateProfile(updatedProfile);
    res.json({ success: true, candidateProfile: saved });
  } catch (err: any) {
    console.error("AI Candidate Profile parse error:", err);
    res.status(500).json({ error: err.message || "Failed to parse candidate profile" });
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

// 4. Evaluation Endpoints
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

    let updatedJob: Job = {
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

    updatedJob = sanitizeJobEvaluation(updatedJob, configObj.locations || [], configObj);

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

    clearPipelineLogs();
    setIsPipelineRunning(true);

    const totalToEval = jobsToEval.length;
    appendPipelineLog("GEMINI_AI", `Starting AI Re-Evaluation for ${totalToEval} job(s)...`);

    const BATCH_SIZE = 5;
    const updatedMap = new Map<string, Job>();
    let evaluatedCount = 0;

    for (let i = 0; i < jobsToEval.length; i += BATCH_SIZE) {
      if (activePipelineCancelled) {
        appendPipelineLog("GEMINI_AI", "Re-evaluation cancelled by user.");
        break;
      }
      const chunk = jobsToEval.slice(i, i + BATCH_SIZE);
      const chunkTitles = chunk.map((j) => `"${j.title}" @ ${j.company}`).join(", ");
      appendPipelineLog(
        "GEMINI_AI",
        `Evaluating batch (${i + 1}-${Math.min(i + chunk.length, totalToEval)}/${totalToEval}): ${chunkTitles}...`
      );

      const evalResults = await batchEvaluateJobsWithGemini(chunk, resumeObj.content, configObj);

      for (const item of evalResults) {
        const orig = chunk.find((j) => j.id === item.jobId);
        if (orig) {
          let updatedJob: Job = {
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
          };
          updatedJob = sanitizeJobEvaluation(updatedJob, configObj.locations || [], configObj);
          updatedMap.set(item.jobId, updatedJob);
          evaluatedCount++;

          appendPipelineLog(
            "GEMINI_AI",
            `[EVAL DONE] (${evaluatedCount}/${totalToEval}) "${updatedJob.title}" @ ${updatedJob.company} -> Score: ${updatedJob.score}/100 [${updatedJob.match_level}]`
          );
        }
      }
    }

    const updatedJobsList = allJobs.map((j) => updatedMap.get(j.id) || j);
    saveJobsDB(updatedJobsList);
    generateMarkdownReport(updatedJobsList);

    appendPipelineLog("GEMINI_AI", `[STAGE COMPLETE] AI Re-Evaluation completed for ${evaluatedCount}/${totalToEval} job(s).`);
    setIsPipelineRunning(false);

    return res.json({ success: true, evaluatedCount: updatedMap.size, jobs: updatedJobsList });
  } catch (error: any) {
    console.error("Batch evaluation error:", error);
    appendPipelineLog("GEMINI_AI", `[ERROR] Batch evaluation error: ${error.message}`);
    setIsPipelineRunning(false);
    return res.status(500).json({ error: error.message || "Failed to batch evaluate jobs" });
  }
});

// 5. Full Pipeline Runner Endpoints
app.get("/api/pipeline/logs", (req, res) => {
  res.json(getPipelineLogsData());
});

app.delete("/api/pipeline/logs", (req, res) => {
  clearPipelineLogs();
  res.json({ success: true });
});

app.post("/api/pipeline/cancel", (req, res) => {
  setPipelineCancelled(true);
  res.json({ success: true, message: "Pipeline cancellation requested." });
});

app.post("/api/pipeline/stop-fetching", (req, res) => {
  setStopFetchingRequested(true);
  appendPipelineLog("SCANNER", "User requested to stop fetching and begin evaluation.");
  res.json({ success: true, message: "Stop fetching requested." });
});

app.post("/api/pipeline/run", async (req, res) => {
  const isCancelled = () => req.destroyed;
  const result = await runPipeline(isCancelled);
  if (result.cancelled) {
    return res.json(result);
  }
  if (!result.success) {
    return res.status(500).json(result);
  }
  return res.json(result);
});

// 6. Report Endpoints
app.delete("/api/reports", (req, res) => {
  try {
    const pid = getActiveProfileId();
    const profileReportsDir = getProfileReportsDir(pid);
    const profileReportPath = getProfileReportPath(pid);

    if (fs.existsSync(profileReportsDir)) {
      const files = fs.readdirSync(profileReportsDir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          fs.unlinkSync(path.join(profileReportsDir, file));
        }
      }
    }

    if (fs.existsSync(profileReportPath)) {
      fs.unlinkSync(profileReportPath);
    }

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
