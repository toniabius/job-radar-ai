import { ResumeData } from "../src/types.js";
import { extractExperienceInfo } from "./utils.js";
import { loadConfig } from "./storage.js";
import { hasValidApiKey, getGeminiClient, enforceGeminiRateLimit, ALL_GEMINI_FALLBACK_MODELS } from "./gemini.js";

export function extractSkillsRegex(content: string, configSkills?: string[]): string[] {
  const baselineSkills = [
    "TypeScript", "JavaScript", "React", "Node.js", "Python", "Java", "C++", "Go", "Rust",
    "SQL", "PostgreSQL", "MongoDB", "Redis", "AWS", "GCP", "Azure", "Docker", "Kubernetes",
    "GraphQL", "REST API", "Tailwind CSS", "Vite", "Express", "Distributed Systems",
    "Machine Learning", "System Design", "Microservices", "CI/CD", "Terraform", "Spring Boot",
    "Angular", "Vue", "Kafka", "Snowflake", "Spark", "Scala", "Swift", "Kotlin",
  ];
  const skillVocabulary = configSkills && configSkills.length > 0
    ? [...new Set([...configSkills, ...baselineSkills])]
    : baselineSkills;

  return skillVocabulary.filter((s) =>
    new RegExp(`\\b${s.replace(/[+.]/g, (c) => `\\${c}`)}\\b`, "i").test(content)
  );
}

export async function extractSkillsWithGemini(content: string, configSkills?: string[]): Promise<string[]> {
  if (!content.trim()) {
    console.log("[RESUME] extractSkillsWithGemini: empty content, using regex");
    return extractSkillsRegex(content, configSkills);
  }
  if (!hasValidApiKey()) {
    console.log("[RESUME] extractSkillsWithGemini: no valid API key, using regex");
    return extractSkillsRegex(content, configSkills);
  }

  const config = loadConfig();
  const primaryModel = config.gemini_model || "gemini-3.1-flash-lite";
  const candidateModels = [primaryModel, ...ALL_GEMINI_FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const model of candidateModels) {
    try {
      await enforceGeminiRateLimit(model);
      const ai = getGeminiClient();

      const prompt = `You are a senior technical recruiter and software engineer with deep knowledge of the tech industry. Your task is to extract a comprehensive list of technical skills from a candidate's resume.

Extract every technical skill including: programming languages, frameworks, libraries, databases, cloud platforms, DevOps tools, AI/ML concepts, protocols, architectures, and methodologies.

Rules:
- Return ONLY a JSON array of strings, e.g. ["TypeScript", "React", "AWS"]
- Use industry-standard casing for each skill (e.g. "TypeScript", "PostgreSQL", "CI/CD", "GraphQL", "LLMs", "RAG")
- Include modern AI/ML terms where present: LLMs, RAG, fine-tuning, embeddings, vector databases, prompt engineering, etc.
- Infer skills from context when clearly implied (e.g. "built REST APIs in Node.js" → include "REST API" and "Node.js")
- DO NOT include soft skills, job titles, company names, or vague phrases like "problem solving" or "agile mindset"
- De-duplicate — each skill appears exactly once
- Return ONLY the raw JSON array with no explanation, commentary, or markdown formatting

Resume:
${content.slice(0, 12000)}`;

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const raw = (response.text || "").trim()
        .replace(/^```json\n?/i, "").replace(/^```\n?/, "").replace(/```$/, "").trim();

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[RESUME] Gemini (${model}) extracted ${parsed.length} skills from resume.`);
        return parsed.map((s: any) => String(s).trim()).filter(Boolean);
      }
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED");
      if (isRateLimit) {
        console.log(`[RESUME] Gemini (${model}) rate limit reached (429), trying fallback...`);
      } else {
        console.log(`[RESUME] Gemini (${model}) skill extraction error, trying fallback...`);
      }
    }
  }

  console.log("[RESUME] Gemini skill extraction fallback to regex keyword parser.");
  return extractSkillsRegex(content, configSkills);
}

export function parseResumeDetails(content: string, configSkills?: string[]): ResumeData {
  const expInfo = extractExperienceInfo(content);
  let experienceYears = expInfo.experienceYears;

  const parsedSkills = extractSkillsRegex(content, configSkills);

  return {
    title: "Resume",
    lastUpdated: new Date().toISOString().split("T")[0],
    content,
    parsedSkills,
    experienceYears,
  };
}

export async function parseResumeDetailsEnriched(content: string, configSkills?: string[]): Promise<ResumeData> {
  const base = parseResumeDetails(content, configSkills);
  base.parsedSkills = await extractSkillsWithGemini(content, configSkills);
  return base;
}
