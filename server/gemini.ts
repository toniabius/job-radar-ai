import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

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
