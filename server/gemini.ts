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

export async function generateApplicationAnswer(
  question: string,
  jobContext?: string,
  candidateProfile?: any,
  resumeContent?: string
): Promise<string> {
  const apiKey = getCleanApiKey();
  if (!apiKey || !hasValidApiKey()) {
    return `Based on my ${candidateProfile?.yearsExperience || 5}+ years of professional experience and background, I am well-positioned to excel in this role.`;
  }

  const ai = getGeminiClient();
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

${jobContext ? `Target Job Details:\n${jobContext.slice(0, 1000)}` : ''}

Application Question To Answer:
"${question}"

Instructions:
Write a concise, compelling, professional, and authentic 1-3 paragraph response for the candidate to submit in their application.
Be direct, relevant to their actual background, and write in the first-person ("I"). Do not output placeholders or generic meta commentary.`;

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
