// ─────────────────────────────────────────────────────────────
// LLM router — supports Gemini (cloud), LM Studio (local), or Kimi
// ─────────────────────────────────────────────────────────────

import { streamGemini, callGemini } from "./gemini";
import { streamLMStudio, callLMStudio } from "./lmstudio";
import { streamKimi, callKimi } from "./kimi";

export interface LLMStreamChunk {
  text: string;
}

function detectProvider(apiKey: string, model?: string): "gemini" | "lmstudio" | "kimi" {
  if (model === "kimi") return "kimi";
  if (model === "lmstudio") return "lmstudio";
  if (apiKey.startsWith("lm-") || apiKey === "local" || apiKey === "") return "lmstudio";
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
    case "lmstudio":
      yield* streamLMStudio(prompt);
      break;
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
    case "lmstudio":
      return callLMStudio(prompt);
    case "kimi":
      return callKimi(prompt, apiKey);
    default:
      return callGemini(prompt, apiKey);
  }
}
