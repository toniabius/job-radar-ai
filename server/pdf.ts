import { createRequire } from "module";
import * as pdfParseModule from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // 1. Try pdf-parse v2 PDFParse class (new PDFParse({ data: buffer }))
  try {
    const mod: any = pdfParseModule;
    const PDFParseClass = mod?.PDFParse || mod?.default?.PDFParse;
    if (PDFParseClass) {
      const parser = new PDFParseClass({ data: buffer });
      const res = await parser.getText();
      if (res) {
        if (typeof res.text === "string" && res.text.trim()) {
          return res.text.replace(/-- \d+ of \d+ --/g, "").trim();
        }
        if (typeof res === "string" && (res as string).trim()) {
          return (res as string).trim();
        }
        if (res.pages && Array.isArray(res.pages)) {
          const textParts = res.pages.map((p: any) => p.text || "").join("\n");
          if (textParts.trim()) return textParts.trim();
        }
      }
    }
  } catch (err: any) {
    console.warn("pdf-parse v2 extraction attempt error:", err.message);
  }

  // 2. Try legacy function candidates
  try {
    const mod: any = pdfParseModule;
    const candidates: any[] = [
      mod,
      mod?.default,
      mod?.pdfParse,
    ];
    for (const fn of candidates) {
      if (typeof fn === "function") {
        try {
          const result = await fn(buffer);
          if (result && typeof result.text === "string" && result.text.trim()) {
            return result.text.trim();
          }
        } catch (e) {
          // continue
        }
      }
    }
  } catch (e) {
    // continue
  }

  // 3. Try legacy createRequire
  try {
    const req = createRequire(import.meta.url);
    const legacyFn = req("pdf-parse");
    if (typeof legacyFn === "function") {
      const result = await legacyFn(buffer);
      if (result && result.text && result.text.trim()) {
        return result.text.trim();
      }
    }
  } catch (e) {
    // continue
  }

  // 4. Fallback text stream regex extraction for PDF strings
  try {
    const pdfStr = buffer.toString("binary");
    const matches: string[] = [];
    const regex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = regex.exec(pdfStr)) !== null) {
      if (match[1] && match[1].length > 1) {
        matches.push(match[1]);
      }
    }
    if (matches.length > 5) {
      return matches.join(" ");
    }
  } catch (e) {
    // ignore
  }

  return "";
}
