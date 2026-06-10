// ─────────────────────────────────────────────────────────────
// Gemini API service — streaming & non-streaming with multi-key rotation
// ─────────────────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.0-flash";

export interface GeminiStreamChunk {
  text: string;
}

function parseKeys(apiKey: string): string[] {
  return apiKey
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Stream content from Gemini via Server-Sent Events style parsing */
export async function* streamGemini(
  prompt: string,
  apiKey: string
): AsyncGenerator<GeminiStreamChunk> {
  const keys = parseKeys(apiKey);
  if (keys.length === 0) throw new Error("Gemini API key not configured");

  let lastError = "unknown";
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const url = `${GEMINI_BASE}/${MODEL}:streamGenerateContent?key=${key}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (res.status === 429) {
        const err = await res.text().catch(() => "rate limited");
        lastError = `Gemini API 429: ${err}`;
        continue; // try next key
      }

      if (!res.ok) {
        const err = await res.text().catch(() => "unknown");
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body from Gemini");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = extractJsonObjects(buffer);
        buffer = chunks.remainder;

        for (const obj of chunks.objects) {
          const text = extractTextFromGeminiChunk(obj);
          if (text) yield { text };
        }
      }

      const chunks = extractJsonObjects(buffer);
      for (const obj of chunks.objects) {
        const text = extractTextFromGeminiChunk(obj);
        if (text) yield { text };
      }
      return;
    } catch (err) {
      if (i === keys.length - 1) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`All Gemini API keys exhausted. Last error: ${lastError}`);
}

/** Non-streaming call for 5W1H summary */
export async function callGemini(
  prompt: string,
  apiKey: string
): Promise<string> {
  const keys = parseKeys(apiKey);
  if (keys.length === 0) throw new Error("Gemini API key not configured");

  let lastError = "unknown";
  for (const key of keys) {
    const url = `${GEMINI_BASE}/${MODEL}:generateContent?key=${key}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (res.status === 429) {
      const err = await res.text().catch(() => "rate limited");
      lastError = `Gemini API 429: ${err}`;
      continue;
    }

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
  throw new Error(`All Gemini API keys exhausted. Last error: ${lastError}`);
}

// ─── Helpers ────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/** Extract text from a single Gemini stream chunk object */
function extractTextFromGeminiChunk(obj: unknown): string | null {
  const chunk = obj as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  return parts.map((p) => p.text ?? "").join("");
}

/** Extract complete JSON objects from a buffer string.
 *  Gemini stream format is: [{obj1}, {obj2}, ...] where objects may arrive partially.
 */
function extractJsonObjects(buffer: string): {
  objects: unknown[];
  remainder: string;
} {
  const objects: unknown[] = [];

  // Strip wrapping brackets if present at the start
  let text = buffer.trim();
  if (text.startsWith("[")) text = text.slice(1);
  if (text.endsWith("]")) {
    text = text.slice(0, -1);
  }

  let depth = 0;
  let start = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          objects.push(JSON.parse(slice));
          start = i + 1;
        } catch {
          // malformed, keep in remainder
        }
      }
    }
  }

  const remainder = text.slice(start);
  return { objects, remainder };
}
