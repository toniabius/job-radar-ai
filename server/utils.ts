import fs from "fs";
import { LocationGeoInfo } from "./types.js";

export function writeFileIfChanged(filePath: string, content: string): void {
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

export function dumpYaml(obj: any, indent = 0): string {
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

export function extractExperienceInfo(text: string): { yearsStr: string; experienceYears: number } {
  if (!text) return { yearsStr: "~5+ Years", experienceYears: 5 };

  const currentYear = new Date().getFullYear();

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

  const expMatch = text.match(/Total Professional Experience:\s*~?(\d{1,2})\+?\s*Years/i) ||
                   text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:professional\s+|work\s+)?(?:experience|industry\s+experience)/i);
  if (expMatch && parseInt(expMatch[1], 10) > 0 && parseInt(expMatch[1], 10) <= 45) {
    const yrs = parseInt(expMatch[1], 10);
    return { yearsStr: `~${yrs}+ Years`, experienceYears: yrs };
  }

  return { yearsStr: "~5+ Years", experienceYears: 5 };
}

export function formatSingleAmount(token: string, isHourly: boolean = false): string {
  if (!token) return "";
  const cleaned = token
    .replace(/[\$€£,]/g, "")
    .replace(/\s*(USD|EUR|GBP|\/yr|\/year|\/hr|\/hour|per\s+year|per\s+hour|annual|annually|hourly)\s*$/i, "")
    .trim();

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

export function normalizeSalary(raw: string): string {
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

export function extractSalaryWithRegex(textOrHtml: string): string {
  if (!textOrHtml || !textOrHtml.trim()) return "$Not found";

  const text = textOrHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();

  const rangeMatch = text.match(/(?:[\$€£]|USD\s*[\$€£]?)\s*(\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr|\/hour)*)\s*(?:[-–—]|\bto\b)\s*([\$€£]?\s*\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr|\/hour)*)/i);
  if (rangeMatch) {
    const raw = `${rangeMatch[1]} - ${rangeMatch[2]}`;
    const norm = normalizeSalary(raw);
    if (norm && norm !== "$Not found") return norm;
  }

  const contextMatch = text.match(/(?:salary|compensation|pay|rate|base)\s*(?:range|scale|is)?[^<]{0,100}?([\$€£]\s*\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr)*\s*(?:[-–—]|\bto\b)\s*[\$€£]?\s*\d[\d,.]*\s*(?:[kKmM]|\/yr|\/year|\/hr)*)/i);
  if (contextMatch && contextMatch[1]) {
    const norm = normalizeSalary(contextMatch[1]);
    if (norm && norm !== "$Not found") return norm;
  }

  const singleMatch = text.match(/([\$€£]\s*\d[\d,.]*\s*[kKmM]?)\s*(?:USD|EUR|GBP|\/yr|\/year|per\s+year|annual|annually)/i);
  if (singleMatch && singleMatch[1]) {
    const norm = normalizeSalary(singleMatch[1]);
    if (norm && norm !== "$Not found") return norm;
  }

  return "$Not found";
}

export function extractMaxSalaryNumber(salaryStr: string): number {
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

export function extractYoeBounds(text: string): { minYoe: number; maxYoe?: number } {
  if (!text) return { minYoe: 0 };

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

export function extractRequiredYoe(text: string): number {
  return extractYoeBounds(text).minYoe;
}

export const KNOWN_GEO_LOCATIONS: Record<string, LocationGeoInfo> = {
  washington: { geoId: "103977389", locationStr: "Washington, United States" },
  "washington state": { geoId: "103977389", locationStr: "Washington, United States" },
  wa: { geoId: "103977389", locationStr: "Washington, United States" },
  "washington, us": { geoId: "103977389", locationStr: "Washington, United States" },
  "washington, usa": { geoId: "103977389", locationStr: "Washington, United States" },
  "washington, united states": { geoId: "103977389", locationStr: "Washington, United States" },

  "washington dc": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "washington d.c.": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "washington, dc": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "washington, d.c.": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  dc: { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },
  "district of columbia": { geoId: "90000097", locationStr: "Washington, District of Columbia, United States" },

  california: { geoId: "102095887", locationStr: "California, United States" },
  ca: { geoId: "102095887", locationStr: "California, United States" },

  virginia: { geoId: "102230683", locationStr: "Virginia, United States" },
  va: { geoId: "102230683", locationStr: "Virginia, United States" },

  maryland: { geoId: "101282230", locationStr: "Maryland, United States" },
  md: { geoId: "101282230", locationStr: "Maryland, United States" },

  "new york": { geoId: "105080838", locationStr: "New York, United States" },
  ny: { geoId: "105080838", locationStr: "New York, United States" },

  texas: { geoId: "102748797", locationStr: "Texas, United States" },
  tx: { geoId: "102748797", locationStr: "Texas, United States" },

  seattle: { geoId: "104116203", locationStr: "Seattle, Washington, United States" },
  "seattle, wa": { geoId: "104116203", locationStr: "Seattle, Washington, United States" },

  remote: { geoId: "103644278", locationStr: "United States" },
  "work from home": { geoId: "103644278", locationStr: "United States" },
  telecommute: { geoId: "103644278", locationStr: "United States" },

  "united states": { geoId: "103644278", locationStr: "United States" },
  usa: { geoId: "103644278", locationStr: "United States" },
  us: { geoId: "103644278", locationStr: "United States" },
};

export function getLinkedInLocationParams(locName: string): string {
  if (!locName || !locName.trim()) return "";
  const normalized = locName.trim().toLowerCase();

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

  if (normalized.includes("washington") && !normalized.includes("dc") && !normalized.includes("district")) {
    return `&location=${encodeURIComponent("Washington, United States")}&geoId=103977389`;
  }

  return `&location=${encodeURIComponent(locName.trim())}`;
}

export function isLocationMatch(jobLoc: string, preferredLocations: string[]): boolean {
  if (!preferredLocations || preferredLocations.length === 0) return true;
  const prefLowerList = preferredLocations.map((l) => l.toLowerCase().trim()).filter(Boolean);
  if (prefLowerList.includes("all") || prefLowerList.includes("any") || prefLowerList.includes("anywhere")) return true;

  const prefersRemote = prefLowerList.some((p) => p.includes("remote") || p.includes("anywhere") || p.includes("work from home") || p.includes("telecommute"));
  if (prefersRemote) return true;

  const locLower = jobLoc.toLowerCase().trim();

  const isJobRemote = locLower.includes("remote") || locLower.includes("work from home") || locLower.includes("anywhere");
  const isJobHybrid = locLower.includes("hybrid");
  if (isJobRemote && prefersRemote) return true;
  if (isJobHybrid && prefLowerList.some((p) => p.includes("hybrid"))) return true;

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
        if (detectedJobState && detectedJobState !== key) continue;

        if (locLower.includes(key) || aliases.some((a) => locTokens.includes(a) || locLower.includes(a))) {
          return true;
        }
      }
    }
  }

  return false;
}
