import { Job } from "../src/types.js";
import { getLinkedInLocationParams, isLocationMatch } from "./utils.js";
import { batchDetermineJobSalaries } from "./evaluator.js";

let lastLinkedInReqTime = 0;

export async function fetchLinkedInWithRetry(
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

    if (attempt < maxRetries) {
      const baseDelay = Math.pow(2, attempt) * 2500;
      const jitter = Math.floor(Math.random() * 1500);
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
      return res;
    }
  }

  return await fetch(url, { headers });
}

export async function fetchLiveLinkedInJobs(
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

  const isIgnoredLocation = (loc: string) => {
    const l = loc.trim().toLowerCase();
    return l === "hybrid" || l === "remote/hybrid" || l === "remote / hybrid" || l === "hybrid remote";
  };
  const targetLocations = preferredLocations.filter((loc) => !isIgnoredLocation(loc));
  const locationLoop = targetLocations.length > 0 ? targetLocations : [""];

  const sb2Level = minSalary && minSalary >= 40000
    ? Math.min(9, Math.max(1, Math.floor((minSalary - 40000) / 20000) + 1))
    : null;
  const sb2Param = sb2Level ? `&f_SB2=${sb2Level}` : "";

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

        for (let startPage = 0; startPage <= 975; startPage += 25) {
          if (isCancelled && isCancelled()) break;
          try {
            const query = companyName
              ? encodeURIComponent(`"${companyName}" ${role}`)
              : encodeURIComponent(role);
            const locParam = getLinkedInLocationParams(locName);
            const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}${locParam}&f_TPR=${tpr}${sb2Param}&start=${startPage}`;
            const webSearchUrl = `https://www.linkedin.com/jobs/search?keywords=${query}${locParam}&f_TPR=${tpr}${sb2Param}&start=${startPage}`;

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

                if (preferredLocations && preferredLocations.length > 0) {
                  if (!isLocationMatch(jobLoc, preferredLocations)) {
                    continue;
                  }
                }

                if (!results.some(r => r.url === viewUrl) && !validCards.some(c => c.viewUrl === viewUrl)) {
                  validCards.push({ jobId, jobTitle, rawComp, jobLoc, postedTime, viewUrl });
                }
              }
            }

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
