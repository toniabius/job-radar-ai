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

export function syncWorkingInventoryWithDisk(workingInventory: Job[]): Job[] {
  try {
    const activePid = getActiveProfileId();
    const diskJobs = loadJobsDB(activePid);
    const diskMap = new Map(diskJobs.map((j) => [j.id, j]));
    const diskUrls = new Set(diskJobs.map((j) => j.url));

    const synced: Job[] = [];
    for (const job of workingInventory) {
      if (job.id && diskMap.has(job.id)) {
        const diskJob = diskMap.get(job.id)!;
        synced.push({
          ...job,
          applied: diskJob.applied ?? job.applied,
          applied_date: diskJob.applied_date ?? job.applied_date,
          status: diskJob.status ?? job.status,
          score: diskJob.score ?? job.score,
          match_level: diskJob.match_level ?? job.match_level,
          summary: diskJob.summary ?? job.summary,
          reasons: diskJob.reasons ?? job.reasons,
          missing_skills: diskJob.missing_skills ?? job.missing_skills,
          company_size: diskJob.company_size ?? job.company_size,
        });
      } else if (!job.id && !diskUrls.has(job.url)) {
        synced.push(job);
      }
    }
    return synced;
  } catch (e) {
    return workingInventory;
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
      `\nMinimum Company Headcount Filter: ${config.enable_min_company_size && config.min_company_size && config.min_company_size > 0 ? `${config.min_company_size.toLocaleString()} employees required (strictly ignoring smaller companies via API lookup)` : "Disabled (No minimum size limit)"}` +
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
    const workingInventory: Job[] = [...previousJobsDB];
    let totalNewlyScannedJobs = 0;
    let evaluatedJobsCount = 0;

    if (isCancelled()) {
      isPipelineRunning = false;
      currentPipelineResult = { cancelled: true, summary: "Scan cancelled by user." };
      return { success: false, cancelled: true, summary: "Scan cancelled by user.", logs };
    }

    const scanStartTime = Date.now();
    const evalStartTime = Date.now();

    // Callback to process, evaluate with AI, and persist jobs IMMEDIATELY as each batch is scraped
    const onBatchFetched = async (rawBatch: Omit<Job, 'id'>[]) => {
      try {
        if (isCancelled()) return;
        if (!rawBatch || rawBatch.length === 0) return;

        const ts = Date.now().toString().slice(-5);
        const batchNormalizedJobs: Job[] = rawBatch.map((c, idx) => {
          const jobIdM = c.url.match(/\/view\/(\d+)\//);
          const jobId = jobIdM ? jobIdM[1] : `${ts}-${idx}`;
          const id = `li-${jobId}`;

          const prev = workingInventory.find((j) => j.id === id || j.url === c.url);

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

        totalNewlyScannedJobs += batchNormalizedJobs.length;

        // Filter jobs in this batch that need Gemini evaluation
        const batchNeedingEval = batchNormalizedJobs.filter(
          (j) => j.status === "new" || j.score === undefined
        );

        if (config.auto_evaluate && batchNeedingEval.length > 0 && !isCancelled()) {
          const selectedModel = config.gemini_model || "gemini-3.1-flash-lite";
          const totalToEval = batchNeedingEval.length;
          addLog("GEMINI_AI", `[PARALLEL EVAL] Evaluating batch of ${totalToEval} job(s) with Gemini AI (${selectedModel})...`);

          const BATCH_SIZE = 5;
          for (let i = 0; i < batchNeedingEval.length; i += BATCH_SIZE) {
            if (isCancelled()) break;
            const chunk = batchNeedingEval.slice(i, i + BATCH_SIZE);
            const chunkTitles = chunk.map((j) => `"${j.title}" @ ${j.company}`).join(", ");

            addLog("GEMINI_AI", `Evaluating: ${chunkTitles}...`);

            try {
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
            } catch (chunkErr: any) {
              addLog("ERROR", `Failed to evaluate chunk: ${chunkErr?.message || chunkErr}`);
            }
          }
        }

        // Merge evaluated batch into workingInventory
        for (const bJob of batchNormalizedJobs) {
          const existingIdx = workingInventory.findIndex((j) => j.id === bJob.id || j.url === bJob.url);
          if (existingIdx >= 0) {
            workingInventory[existingIdx] = bJob;
          } else {
            workingInventory.unshift(bJob);
          }
        }

        // Sync and record progress to disk immediately!
        const syncedBatch = syncWorkingInventoryWithDisk(workingInventory);
        workingInventory.length = 0;
        workingInventory.push(...syncedBatch);
        saveJobsDB(workingInventory);
        try {
          generateMarkdownReport(workingInventory, undefined, false);
        } catch (e) {
          // ignore
        }

        addLog("NORMALIZER", `[PROGRESS SAVED] Recorded ${batchNormalizedJobs.length} posting(s) to database (Total inventory: ${workingInventory.length}).`);
      } catch (err: any) {
        addLog("ERROR", `Error processing fetched batch: ${err?.message || err}`);
      }
    };

    const scanData = await fetchLiveLinkedInJobs(
      activeCompanies,
      targetRoles,
      preferredLocs,
      tfParam,
      config.min_salary,
      ignoredCompanies,
      isCancelled,
      isStopFetchingRequested,
      addLog,
      onBatchFetched,
      config.enable_min_company_size ? config.min_company_size : 0
    );
    const liveCandidates = scanData.jobs;
    const totalScannedCount = scanData.totalScanned;
    const scanDurationSec = ((Date.now() - scanStartTime) / 1000).toFixed(1);

    if (stopFetchingRequested) {
      addLog("SCANNER", `Fetching stopped early by user request. All ${workingInventory.length} job(s) fetched so far have been saved.`);
      stopFetchingRequested = false;
    }

    addLog("SCANNER", `[STAGE COMPLETE] Scanning & parallel evaluation completed in ${scanDurationSec}s. Scanned ${totalScannedCount} raw postings; ${workingInventory.length} total jobs now in database.`);

    // Pass for any remaining un-evaluated jobs in inventory (e.g. from prior un-evaluated imports)
    const remainingNeedingEval = workingInventory.filter((j) => j.status === "new" || j.score === undefined);
    if (config.auto_evaluate && remainingNeedingEval.length > 0 && !isCancelled()) {
      addLog("GEMINI_AI", `Evaluating remaining ${remainingNeedingEval.length} un-evaluated job(s)...`);
      const BATCH_SIZE = 5;
      for (let i = 0; i < remainingNeedingEval.length; i += BATCH_SIZE) {
        if (isCancelled()) break;
        const chunk = remainingNeedingEval.slice(i, i + BATCH_SIZE);
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
    }

    if (isCancelled()) {
      isPipelineRunning = false;
      const syncedFinal = syncWorkingInventoryWithDisk(workingInventory);
      workingInventory.length = 0;
      workingInventory.push(...syncedFinal);
      saveJobsDB(workingInventory);
      generateMarkdownReport(workingInventory, undefined, true);

      const cancelSummary = `Scan stopped by user. Current progress and report saved (${workingInventory.length} total jobs in inventory).`;
      currentPipelineResult = {
        success: true,
        cancelled: true,
        summary: cancelSummary,
        newJobsCount: totalNewlyScannedJobs,
        evaluatedCount: evaluatedJobsCount,
        totalJobs: workingInventory.length,
        totalScanned: totalScannedCount,
      };
      return {
        success: true,
        cancelled: true,
        summary: cancelSummary,
        logs,
        newJobsCount: totalNewlyScannedJobs,
        evaluatedCount: evaluatedJobsCount,
        totalJobs: workingInventory.length,
        totalScanned: totalScannedCount,
        reportPath: "output/report.md",
      };
    }

    const syncedFinal = syncWorkingInventoryWithDisk(workingInventory);
    workingInventory.length = 0;
    workingInventory.push(...syncedFinal);
    saveJobsDB(workingInventory);

    addLog("REPORT", "Generating Markdown report output/report.md...");
    const reportMd = generateMarkdownReport(workingInventory, undefined, true);

    const totalDurationSec = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    addLog("SUCCESS", `[PIPELINE COMPLETE] Full pipeline finished in ${totalDurationSec}s total. Database updated with ${workingInventory.length} total job(s).`);

    const summaryText = totalNewlyScannedJobs > 0
      ? `Scan complete. Found and evaluated ${totalNewlyScannedJobs} new posting(s) in this scan. Total job inventory is ${workingInventory.length}.`
      : `Scan complete. Scanned ${totalScannedCount} raw job posting(s). Total job inventory is ${workingInventory.length}.`;

    isPipelineRunning = false;
    currentPipelineResult = {
      success: true,
      newJobsCount: totalNewlyScannedJobs,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: workingInventory.length,
      totalScanned: totalScannedCount,
      summary: summaryText,
    };

    return {
      success: true,
      logs,
      newJobsCount: totalNewlyScannedJobs,
      evaluatedCount: evaluatedJobsCount,
      totalJobs: workingInventory.length,
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
