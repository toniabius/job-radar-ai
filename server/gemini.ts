import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { loadCandidateProfile } from "./storage.js";

// Resolve .env from the project root regardless of which directory the process was launched from
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const ALL_GEMINI_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview"
];

export const GEMINI_MODEL_DELAYS: Record<string, number> = {
  "gemini-3.1-flash-lite": 500,
  "gemini-3.5-flash-lite": 500,
  "gemini-3.5-flash": 1000,
  "gemini-3-flash-preview": 1000,
};

const lastGeminiCallTime: Record<string, number> = {};

export async function enforceGeminiRateLimit(modelName: string) {
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

export function getCleanApiKey(): string {
  const rawKey = process.env.GEMINI_API_KEY || "";
  return rawKey.trim().replace(/^["']|["']$/g, "").trim();
}

export function hasValidApiKey(): boolean {
  const key = getCleanApiKey();
  return Boolean(
    key &&
    key.length > 5 &&
    key !== "MY_GEMINI_API_KEY" &&
    key !== "YOUR_GEMINI_API_KEY"
  );
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getCleanApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set or empty in environment. Please configure your API key in Settings.");
  }
  return new GoogleGenAI({ apiKey });
}

export async function parseFormQuestionsWithAI(
  questions: Array<{ id: string | number; question: string; choices?: string[]; inputType?: string }>,
  candidateProfile?: any,
  jobContext?: string
): Promise<Array<{ id: string | number; answer: string; choiceToClick?: string }>> {
  if (!questions || questions.length === 0) return [];

  const apiKey = getCleanApiKey();
  if (!apiKey || !hasValidApiKey()) {
    console.warn("[AI FORM PARSER] Gemini API key not set, returning empty AI mappings");
    return [];
  }

  const ai = getGeminiClient();

  const profileSummary = {
    name: `${candidateProfile?.firstName || ''} ${candidateProfile?.lastName || ''}`.trim(),
    preferredName: candidateProfile?.preferredName || candidateProfile?.firstName || '',
    email: candidateProfile?.email || '',
    phone: candidateProfile?.phone || '',
    location: `${candidateProfile?.city || ''}, ${candidateProfile?.state || ''}, ${candidateProfile?.country || ''}`.replace(/^[\s,]+|[\s,]+$/g, ''),
    city: candidateProfile?.city || '',
    state: candidateProfile?.state || '',
    zipCode: candidateProfile?.zipCode || '',
    country: candidateProfile?.country || '',
    legallyAuthorizedToWorkInUS: candidateProfile?.legallyAuthorized || 'Yes',
    requiresVisaSponsorship: candidateProfile?.sponsorshipRequired || 'No',
    workAuthorizationStatus: candidateProfile?.workAuthorization || 'Authorized to work',
    noticePeriodOrStartDate: candidateProfile?.noticePeriod || '2 weeks',
    desiredSalary: candidateProfile?.desiredSalary || '',
    yearsExperience: candidateProfile?.yearsExperience || '',
    hybridOrInOfficeAvailability: 'Yes, willing to work in-office or hybrid as required',
    relocation: candidateProfile?.relocation || 'Yes',
    gender: candidateProfile?.gender || 'Decline to Self-Identify',
    ethnicity: candidateProfile?.ethnicity || 'Decline to Self-Identify',
    veteranStatus: candidateProfile?.veteranStatus || 'I am not a protected veteran',
    disabilityStatus: candidateProfile?.disabilityStatus || 'No, I do not have a disability',
    workExperience: (candidateProfile?.workExperience || []).map((w: any) => ({
      title: w.title,
      company: w.company,
      duration: `${w.startMonth || ''} ${w.startYear || ''} - ${w.currentlyWorkHere ? 'Present' : `${w.endMonth || ''} ${w.endYear || ''}`}`.trim()
    })),
    knowledgeBaseQA: (candidateProfile?.knowledgeBase || []).map((k: any) => ({
      question: k.questionPattern,
      answer: k.answer
    }))
  };

  const prompt = `You are a high-accuracy job application auto-fill assistant.
Given a list of application questions on a company's job application form and a candidate's background profile, map each question to the candidate's accurate response.

Candidate Background Context:
${JSON.stringify(profileSummary, null, 2)}
${jobContext ? `Job Listing Context:\n${jobContext.slice(0, 1500)}\n` : ''}

Questions to analyze:
${JSON.stringify(questions, null, 2)}

Requirements for each question:
1. If "choices" are provided in the question object, "choiceToClick" MUST strictly match one of the exact strings in the choices array!
2. If the question asks about location/city, use candidate's location (${profileSummary.location || profileSummary.city}).
3. If the question asks about start date or availability ("When can you start?", "Pick date"), provide a reasonable start date or notice period (e.g. "${profileSummary.noticePeriodOrStartDate}" or a date 2 weeks from today).
4. If the question asks about office/hybrid attendance ("Are you able to work from our US office..."), answer "Yes" or choose "Yes".
5. If the question asks about work authorization, sponsorship, EEO (gender, race, veteran, disability), pick the exact matching choice from the choices array.
6. Return a valid JSON array of objects with schema:
[
  {
    "id": "question id/index from input",
    "answer": "string answer for text input",
    "choiceToClick": "exact string from choices array if applicable, otherwise omit or null"
  }
]`;

  for (const model of ALL_GEMINI_FALLBACK_MODELS) {
    try {
      await enforceGeminiRateLimit(model);
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      const text = (res.text || "").trim();
      if (text) {
        const cleanJson = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`[AI FORM PARSER] Model ${model} failed, trying fallback...`, err);
    }
  }

  return [];
}

export async function generateApplicationAnswer(
  question: string,
  jobContext?: string,
  candidateProfile?: any,
  resumeContent?: string,
  wordLimit?: string | number,
  jobUrl?: string
): Promise<string> {
  const apiKey = getCleanApiKey();
  if (!apiKey || !hasValidApiKey()) {
    return `Based on my ${candidateProfile?.yearsExperience || 5}+ years of professional experience and background, I am well-positioned to excel in this role.`;
  }

  const ai = getGeminiClient();

  let extendedContext = jobContext || "";
  if (jobUrl && jobUrl.trim()) {
    extendedContext = `Job Listing URL: ${jobUrl.trim()}\n` + extendedContext;
  }

  const limitInstruction = wordLimit
    ? `Strict Length Limit: Keep the answer strictly under ${wordLimit}.`
    : 'Write a concise 1-3 paragraph response.';

  const prompt = `You are a professional career coach and job candidate application assistant.
The candidate is filling out a job application or answering an interview application question.

Candidate Profile:
- Name: ${candidateProfile?.firstName || ''} ${candidateProfile?.lastName || ''}
- Years Experience: ${candidateProfile?.yearsExperience || ''}
- Work Authorization: ${candidateProfile?.workAuthorization || ''}
- Desired Salary: ${candidateProfile?.desiredSalary || ''}
- Knowledge Base:
${(candidateProfile?.knowledgeBase || []).map((k: any) => `  * Q: ${k.questionPattern} -> A: ${k.answer}`).join('\n')}

Resume Highlights:
${(resumeContent || '').slice(0, 1500)}

${extendedContext ? `Target Job Context:\n${extendedContext.slice(0, 3000)}` : ''}

Application Question To Answer:
"${question}"

Instructions:
Write an authentic, compelling, professional response for the candidate to submit in their application.
Be direct, relevant to their actual background, and write in the first-person ("I"). Do not output placeholders, bullet headings, or generic meta commentary.
${limitInstruction}`;

  for (const model of ALL_GEMINI_FALLBACK_MODELS) {
    try {
      await enforceGeminiRateLimit(model);
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = (res.text || "").trim();
      if (text) {
        return text;
      }
    } catch (err) {
      console.warn(`[ANSWER GEN] Model ${model} failed, trying fallback...`, err);
    }
  }

  return `Based on my ${candidateProfile?.yearsExperience || 5}+ years of background and my profile, I am excited about this opportunity and fully qualified to excel in this position.`;
}

export async function parseCandidateProfileWithAI(rawText: string): Promise<any> {
  const apiKey = getCleanApiKey();
  if (!apiKey || !hasValidApiKey()) {
    return extractBasicCandidateProfileRegex(rawText);
  }

  const ai = getGeminiClient();
  const prompt = `You are an expert HR data parser. Analyze the candidate resume, bio, or profile text below and extract structured candidate profile auto-fill information in strict JSON format.

Resume/Bio Text:
"""
${rawText.slice(0, 10000)}
"""

Return ONLY a valid JSON object matching this schema without any outer markdown blocks:
{
  "firstName": "string",
  "lastName": "string",
  "fullName": "string",
  "preferredName": "string",
  "email": "string",
  "phone": "string",
  "phoneDeviceType": "Mobile | Home | Work",
  "howDidYouHear": "LinkedIn | Company Website | Employee Referral | Job Board",
  "city": "string",
  "state": "string",
  "zipCode": "string",
  "country": "string",
  "linkedInUrl": "string",
  "githubUrl": "string",
  "portfolioUrl": "string",
  "workAuthorization": "string (e.g. US Citizen, Green Card)",
  "sponsorshipRequired": "Yes" | "No",
  "legallyAuthorized": "Yes" | "No",
  "yearsExperience": number,
  "desiredSalary": "string (e.g. $165,000)",
  "noticePeriod": "string (e.g. 2 weeks)",
  "relocation": "Yes" | "No" | "Hybrid / Flexible",
  "gender": "string (e.g. Male, Female, Non-Binary, Decline to Self-Identify)",
  "veteranStatus": "string (e.g. I am not a protected veteran, Protected Veteran, Decline to Self-Identify)",
  "ethnicity": "string (e.g. Hispanic or Latino, White, Asian, Black or African American, Decline to Self-Identify)",
  "disabilityStatus": "string (e.g. No, I do not have a disability, Yes, I have a disability, Decline to Self-Identify)",
  "workExperience": [
    {
      "id": "exp-1",
      "title": "string (Job Title)",
      "company": "string (Company Name)",
      "location": "string (Location e.g. McLean VA)",
      "currentlyWorkHere": boolean,
      "startMonth": "string (e.g. 4)",
      "startYear": "string (e.g. 2024)",
      "endMonth": "string (e.g. MM or 1-12)",
      "endYear": "string (e.g. YYYY or 2026)",
      "description": "string (Role Description & accomplishments)"
    }
  ],
  "knowledgeBase": [
    {
      "id": "kb-1",
      "questionPattern": "string (e.g. How many years of Full Stack / React experience?)",
      "answer": "string (concise first-person answer)",
      "category": "Experience" | "Legal" | "Compensation" | "Personal" | "Custom"
    }
  ]
}

Instructions:
1. Extract as many actual fields as possible accurately from the text.
2. If location or contact details are missing, leave them as clean empty strings or sensible defaults.
3. Generate 3-6 useful QA Memory Bank entries (questionPattern and answer) based on their actual work history, tech stack, and experience.
4. Output strict JSON only.`;

  for (const model of ALL_GEMINI_FALLBACK_MODELS) {
    try {
      await enforceGeminiRateLimit(model);
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      const text = (res.text || "").trim();
      if (text) {
        const cleanJson = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`[CANDIDATE PARSE] Model ${model} failed, trying fallback...`, err);
    }
  }

  return extractBasicCandidateProfileRegex(rawText);
}

function extractBasicCandidateProfileRegex(rawText: string): any {
  const current = loadCandidateProfile();
  const emailMatch = rawText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = rawText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const linkedInMatch = rawText.match(/(https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/i);
  const githubMatch = rawText.match(/(https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+)/i);

  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const nameLine = lines[0] || "";
  const nameParts = nameLine.split(" ");
  const firstName = nameParts[0] || current.firstName;
  const lastName = nameParts.slice(1).join(" ") || current.lastName;

  return {
    ...current,
    firstName,
    lastName,
    email: emailMatch ? emailMatch[0] : current.email,
    phone: phoneMatch ? phoneMatch[0] : current.phone,
    linkedInUrl: linkedInMatch ? linkedInMatch[0] : current.linkedInUrl,
    githubUrl: githubMatch ? githubMatch[0] : current.githubUrl,
  };
}

export async function fetchCompanyHeadcountFromLinkedInEndpoint(companyName: string): Promise<{
  employeeCount: number | null;
  minCount?: number;
  maxCount?: number;
  sizeText: string;
} | null> {
  if (!companyName || !companyName.trim()) return null;

  const slug = companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return null;

  try {
    const url = `https://www.linkedin.com/company/${slug}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (res.ok) {
      const html = await res.text();
      const matches = html.match(/([0-9,]+-[0-9,]+|[0-9,]+\+?)\s+employees?/gi);
      if (matches && matches.length > 0) {
        const sizeText = matches[0];
        const rangeMatch = sizeText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*[-–—]\s*(\d{1,3}(?:,\d{3})*|\d+)/);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
          const max = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
          return { employeeCount: max, minCount: min, maxCount: max, sizeText };
        }
        const plusMatch = sizeText.match(/(\d{1,3}(?:,\d{3})*|\d+)\+/);
        if (plusMatch) {
          const min = parseInt(plusMatch[1].replace(/,/g, ""), 10);
          return { employeeCount: min, minCount: min, maxCount: Infinity, sizeText };
        }
        const exactMatch = sizeText.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
        if (exactMatch) {
          const val = parseInt(exactMatch[1].replace(/,/g, ""), 10);
          return { employeeCount: val, minCount: val, maxCount: val, sizeText };
        }
      }
    }
  } catch (e) {
    console.warn(`[COMPANY ENDPOINT] Direct endpoint fetch failed for ${companyName}:`, e);
  }

  return null;
}

export async function fetchCompanyHeadcountWithAI(
  companyName: string,
  jobDescription?: string
): Promise<{
  employeeCount: number | null;
  minCount?: number;
  maxCount?: number;
  sizeText: string;
  source: 'linkedin_endpoint' | 'job_description' | 'ai_api' | 'unknown';
}> {
  if (!companyName || !companyName.trim()) {
    return { employeeCount: null, sizeText: "Unknown Company", source: "unknown" };
  }

  // 1. Try direct HTTP lookup on LinkedIn company endpoint
  const directEndpointRes = await fetchCompanyHeadcountFromLinkedInEndpoint(companyName);
  if (directEndpointRes) {
    return {
      ...directEndpointRes,
      source: 'linkedin_endpoint',
    };
  }

  // 2. Try regex extraction if job description exists
  if (jobDescription) {
    const plusMatch = jobDescription.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*\+\s*employees?/i);
    if (plusMatch) {
      const minVal = parseInt(plusMatch[1].replace(/,/g, ""), 10);
      return { employeeCount: minVal, minCount: minVal, maxCount: Infinity, sizeText: plusMatch[0], source: 'job_description' };
    }
    const rangeMatch = jobDescription.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*[-–—]\s*(\d{1,3}(?:,\d{3})*|\d+)\s*employees?/i);
    if (rangeMatch) {
      const minVal = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
      const maxVal = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
      return { employeeCount: maxVal, minCount: minVal, maxCount: maxVal, sizeText: rangeMatch[0], source: 'job_description' };
    }
  }

  // 2. Query Gemini API for company size lookup
  if (hasValidApiKey()) {
    try {
      const ai = getGeminiClient();
      const prompt = `You are an enterprise company database and HR research assistant.
Task: Determine the global employee headcount / company size for "${companyName.trim()}".
${jobDescription ? `Job Posting Excerpt: "${jobDescription.slice(0, 1000)}"` : ''}

Return ONLY a valid JSON object matching this schema:
{
  "employeeCount": number (estimated numeric total headcount, e.g. 50, 250, 1000, 10000, 50000),
  "minCount": number (minimum headcount in range, e.g. 500),
  "maxCount": number (maximum headcount in range, e.g. 1000),
  "sizeText": "string (readable size e.g. '1,000-5,000 employees' or '10,000+ employees' or '50-200 employees')"
}`;

      for (const model of ALL_GEMINI_FALLBACK_MODELS) {
        try {
          await enforceGeminiRateLimit(model);
          const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
            }
          });
          const text = (res.text || "").trim();
          if (text) {
            const cleanJson = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
            const parsed = JSON.parse(cleanJson);
            if (parsed && typeof parsed === "object") {
              const empCount = typeof parsed.employeeCount === "number" ? parsed.employeeCount : (parsed.maxCount || parsed.minCount || null);
              const txt = parsed.sizeText || (empCount ? `${empCount.toLocaleString()} employees` : "Unknown");
              return {
                employeeCount: empCount,
                minCount: parsed.minCount || empCount,
                maxCount: parsed.maxCount || empCount,
                sizeText: txt,
                source: "ai_api"
              };
            }
          }
        } catch (mErr) {
          console.warn(`[COMPANY SIZE API] Model ${model} failed, trying fallback...`, mErr);
        }
      }
    } catch (err) {
      console.warn("[COMPANY SIZE API] Gemini lookup failed:", err);
    }
  }

  return { employeeCount: null, sizeText: "Unspecified Size", source: "unknown" };
}

