import path from "path";
import fs from "fs";
import { Job } from "../src/types.js";
import {
  REPORT_PATH,
  loadConfig,
  getProfileReportPath,
  getProfileReportsDir,
  loadProfilesData,
  getActiveProfileId,
} from "./storage.js";
import { sanitizeJobEvaluation } from "./evaluator.js";

export function generateMarkdownReport(jobs: Job[], profileId?: string, saveHistory: boolean = false): string {
  const pid = profileId || getActiveProfileId();
  const config = loadConfig();
  const minThreshold = config.minimum_score || 65;

  const sanitizedJobs = jobs.map((j) => sanitizeJobEvaluation(j, config.locations || [], config));

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

  const profileReportPath = getProfileReportPath(pid);
  fs.writeFileSync(profileReportPath, md, "utf-8");

  if (pid === getActiveProfileId()) {
    fs.writeFileSync(REPORT_PATH, md, "utf-8");
  }

  if (saveHistory && evaluatedJobs.length > 0) {
    try {
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
    } catch (err) {
      console.error("Error saving historical report file:", err);
    }
  }

  return md;
}
