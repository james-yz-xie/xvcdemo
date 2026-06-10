// ─────────────────────────────────────────────────────────────
// LLM router — supports Gemini (cloud) and Kimi
// LM Studio is handled directly by the frontend
// ─────────────────────────────────────────────────────────────

import { streamGemini, callGemini } from "./gemini";
import { streamKimi, callKimi } from "./kimi";

export interface LLMStreamChunk {
  text: string;
}

function detectProvider(_apiKey: string, model?: string): "gemini" | "kimi" {
  if (model === "kimi") return "kimi";
  return "gemini";
}

/** Stream content from LLM */
export async function* streamLLM(
  prompt: string,
  apiKey: string,
  model?: string
): AsyncGenerator<LLMStreamChunk> {
  const provider = detectProvider(apiKey, model);

  switch (provider) {
    case "kimi":
      yield* streamKimi(prompt, apiKey);
      break;
    default:
      yield* streamGemini(prompt, apiKey);
  }
}

/** Non-streaming call for 5W1H summary */
export async function callLLM(
  prompt: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const provider = detectProvider(apiKey, model);

  switch (provider) {
    case "kimi":
      return callKimi(prompt, apiKey);
    default:
      return callGemini(prompt, apiKey);
  }
}
