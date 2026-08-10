import fs from "fs";
import { Job } from "../src/types.js";
import { PipelineLog } from "./types.js";
import {
  loadConfig,
  loadResume,
  loadJobsDB,
  saveJobsDB,
  loadProfilesData,
  getProfileLogsPath,
  getActiveProfileId,
} from "./storage.js";
import { fetchLiveLinkedInJobs } from "./scrapers.js";
import { batchEvaluateJobsWithGemini } from "./evaluator.js";
import { generateMarkdownReport } from "./reporter.js";

export let isPipelineRunning = false;
export let activePipelineCancelled = false;
export let stopFetchingRequested = false;
export let currentPipelineLogs: PipelineLog[] = [];
export let currentPipelineResult: any = null;

export function setPipelineCancelled(cancelled: boolean): void {
  activePipelineCancelled = cancelled;
}

export function setStopFetchingRequested(stop: boolean): void {
  stopFetchingRequested = stop;
}

export function isStopFetchingRequested(): boolean {
  return stopFetchingRequested;
}

export function setIsPipelineRunning(running: boolean): void {
  isPipelineRunning = running;
  if (running) {
    activePipelineCancelled = false;
    stopFetchingRequested = false;
  }
}

export function appendPipelineLog(stage: PipelineLog["stage"], message: string, details?: string): void {
  const entry: PipelineLog = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toLocaleTimeString(),
    stage,
    message,
    details,
  };
  currentPipelineLogs.push(entry);
  try {
    const logsPath = getProfileLogsPath();
    fs.writeFileSync(logsPath, JSON.stringify(currentPipelineLogs, null, 2), "utf-8");
  } catch (e) {
    // ignore
  }
}

export function clearPipelineLogs(): void {
  currentPipelineLogs = [];
  currentPipelineResult = null;
  try {
    const logsPath = getProfileLogsPath();
    if (fs.existsSync(logsPath)) {
      fs.writeFileSync(logsPath, JSON.stringify([], null, 2), "utf-8");
    }
  } catch (err) {
    console.error("Error clearing pipeline logs file:", err);
  }
}

export function getPipelineLogsData(): {
  logs: PipelineLog[];
  isRunning: boolean;
  result: any;
} {
  try {
    const logsPath = getProfileLogsPath();
    let logs: PipelineLog[] = currentPipelineLogs;
    if (fs.existsSync(logsPath)) {
      logs = JSON.parse(fs.readFileSync(logsPath, "utf-8"));
    }
    return {
      logs,
      isRunning: isPipelineRunning,
      result: currentPipelineResult,
    };
  } catch (err) {
    return {
      logs: currentPipelineLogs,
      isRunning: isPipelineRunning,
      result: currentPipelineResult,
    };
  }
}

export async function runPipeline(
  isCancelledCallback?: () => boolean
): Promise<{
  success: boolean;
  cancelled?: boolean;
  summary: string;
  logs: PipelineLog[];
  newJobsCount?: number;
  evaluatedCount?: number;
  totalJobs?: number;
  totalScanned?: number;
  reportPath?: string;
}> {
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

  const isCancelled = () => Boolean((isCancelledCallback && isCancelledCallback()) || activePipelineCancelled);

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
    const isCompanyFilteringEnabled = config.target_companies_enabled !== false && String(config.target_companies_enabled).toLowerCase() !== "false";
    const allCompanies = config.companies || [];
    const isCompanyEnabled = (c: any) => c && (c.enabled === true || String(c.enabled).toLowerCase() === "true");
    const activeCompanies = isCompanyFilteringEnabled ? allCompanies.filter(isCompanyEnabled) : [];
    const disabledCompanies = isCompanyFilteringEnabled ? allCompanies.filter((c) => !isCompanyEnabled(c)) : allCompanies;
    const targetRoles = config.target_roles && config.target_roles.length > 0
      ? config.target_roles
      : ["Software Engineer", "Full Stack AI Engineer"];

    const isIgnoredCompaniesEnabled = config.ignored_companies_enabled !== false;
    let ignoredCompanies: string[] = [];
    if (isIgnoredCompaniesEnabled) {
      const flatList = (config.ignored_companies || []).map((c) => c.trim()).filter(Boolean);
      const groupLists = (config.ignored_company_groups || [])
        .filter((g) => g.enabled !== false)
        .flatMap((g) => (g.companies || []).map((c) => c.trim()))
        .filter(Boolean);
      ignoredCompanies = Array.from(new Set([...flatList, ...groupLists]));
    }

    const preferredLocs = config.locations || [];
    const configSummary = isCompanyFilteringEnabled && activeCompanies.length > 0
      ? `${activeCompanies.length} enabled target company/companies out of ${allCompanies.length} configured company entry/entries across ${targetRoles.length} search role queries`
      : `Open Web Search Mode (${isCompanyFilteringEnabled ? "0 enabled target companies" : "Target company filtering disabled"} - searching all jobs in area for specified roles) across ${targetRoles.length} search role queries`;

    addLog(
      "CONFIG",
      `Loaded configuration: ${configSummary}`,
      `Target Company Filtering: ${isCompanyFilteringEnabled ? "Enabled" : "Disabled (Open Web Search Mode)"}` +
      `\nActive Enabled Companies (${activeCompanies.length}): ${activeCompanies.length > 0 ? activeCompanies.map((c) => c.name).join(", ") : "None (Open Web Search Mode - searching all target jobs in area)"}` +
      (disabledCompanies.length > 0 ? `\nDisabled/Bypassed Companies (${disabledCompanies.length}): ${disabledCompanies.map((c) => c.name).join(", ")} (${isCompanyFilteringEnabled ? "Disabled in list" : "Bypassed because section is disabled"})` : "") +
      `\nIgnored Companies Filter: ${isIgnoredCompaniesEnabled ? "Enabled" : "Disabled"} (${ignoredCompanies.length} company/companies ignored${ignoredCompanies.length > 0 ? `: [${ignoredCompanies.join(", ")}]` : ""})` +
      `\nTarget Search Roles (${targetRoles.length}): ${targetRoles.join(", ")}` +
      `\nTarget Locations: ${preferredLocs.length > 0 ? preferredLocs.join(", ") : "Any"}`
    );

    if (isCancelled()) {
      isPipelineRunning = false;
      currentPipelineResult = { cancelled: true, summary: "Scan cancelled by user." };
      return { success: false, cancelled: true, summary: "Scan cancelled by user.", logs };
    }

    addLog("RESUME", "Loading candidate resume...");
    const activeProfileData = loadProfilesData().profiles.find((p) => p.id === getActiveProfileId());
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
      isPipelineRunning = false;
      currentPipelineResult = { cancelled: true, summary: "Scan cancelled by user." };
      return { success: false, cancelled: true, summary: "Scan cancelled by user.", logs };
    }

    const scanStartTime = Date.now();
    const scanData = await fetchLiveLinkedInJobs(
      activeCompanies,
      targetRoles,
      preferredLocs,
      tfParam,
      config.min_salary,
      ignoredCompanies,
      isCancelled,
      isStopFetchingRequested,
      addLog
    );
    const liveCandidates = scanData.jobs;
    const totalScannedCount = scanData.totalScanned;
    const scanDurationSec = ((Date.now() - scanStartTime) / 1000).toFixed(1);

    if (isCancelled()) {
      isPipelineRunning = false;
      currentPipelineResult = { cancelled: true, summary: "Scan cancelled by user." };
      return { success: false, cancelled: true, summary: "Scan cancelled by user.", logs };
    }

    if (stopFetchingRequested) {
      addLog("SCANNER", `Fetching stopped early by user request. Proceeding directly to evaluation with ${liveCandidates.length} retrieved posting(s)...`);
      stopFetchingRequested = false;
    }

    addLog("SCANNER", `[STAGE COMPLETE] Job Scanning Stage completed in ${scanDurationSec}s. Scanned ${totalScannedCount} raw postings; ${liveCandidates.length} matched criteria.`);

    const ts = Date.now().toString().slice(-5);
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

    // Merge latest scan jobs with previously stored jobs that were not returned in the current scan
    const latestScanIds = new Set(latestScanJobs.map((j) => j.id));
    const latestScanUrls = new Set(latestScanJobs.map((j) => j.url));

    const preservedPreviousJobs = previousJobsDB.filter(
      (j) => !latestScanIds.has(j.id) && !latestScanUrls.has(j.url)
    );

    const fullJobInventory = [...latestScanJobs, ...preservedPreviousJobs];

    const jobsNeedingEval = latestScanJobs.filter((j) => j.status === "new" || j.score === undefined);
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

            addLog("GEMINI_AI", `[EVAL DONE] (${evaluatedJobsCount}/${totalToEval}) "${job.title}" @ ${job.company} -> Score: ${job.score}/100 [${job.match_level}]`);
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
      return { success: false, cancelled: true, summary: "Scan cancelled by user. No results were saved.", logs };
    }

    saveJobsDB(fullJobInventory);

    addLog("REPORT", "Generating Markdown report output/report.md...");
    const reportMd = generateMarkdownReport(fullJobInventory, undefined, true);

    const totalDurationSec = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    addLog("SUCCESS", `[PIPELINE COMPLETE] Full pipeline finished in ${totalDurationSec}s total (Scan Stage: ${scanDurationSec}s | Eval Stage: ${evalDurationSec}s). Database updated with ${fullJobInventory.length} total job(s).`);

    const summaryText = latestScanJobs.length > 0
      ? `Scan complete. Found ${latestScanJobs.length} posting(s) in this scan. Total job inventory updated to ${fullJobInventory.length} posting(s).`
      : `Scan complete. Scanned ${totalScannedCount} raw job posting(s), but no new ones matched criteria. Total job inventory is ${fullJobInventory.length}.`;

    isPipelineRunning = false;
    currentPipelineResult = {
      success: true,
      newJobsCount: latestScanJobs.length,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: fullJobInventory.length,
      totalScanned: totalScannedCount,
      summary: summaryText,
    };

    return {
      success: true,
      logs,
      newJobsCount: latestScanJobs.length,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: fullJobInventory.length,
      totalScanned: totalScannedCount,
      summary: summaryText,
      reportPath: "output/report.md",
    };
  } catch (error: any) {
    isPipelineRunning = false;
    currentPipelineResult = { success: false, summary: `Pipeline execution failed: ${error.message}` };
    addLog("ERROR", `Pipeline execution failed: ${error.message}`);
    return { success: false, logs, summary: `Pipeline execution failed: ${error.message}` };
  }
}
