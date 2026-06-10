// ─────────────────────────────────────────────────────────────
// LM Studio local LLM service — OpenAI-compatible API
// ─────────────────────────────────────────────────────────────

const LM_BASE = "http://localhost:1234/v1";

export interface LMStreamChunk {
  text: string;
}

/** Stream content from LM Studio */
export async function* streamLMStudio(
  prompt: string
): AsyncGenerator<LMStreamChunk> {
  const url = `${LM_BASE}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-needed",
    },
    body: JSON.stringify({
      model: "gemma-4-26b-a4b-it",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`LM Studio error ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from LM Studio");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE format: data: {...}\n\n
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const json = trimmed.slice(6);
      if (json === "[DONE]") continue;

      try {
        const obj = JSON.parse(json);
        const delta = obj.choices?.[0]?.delta;
        const text = delta?.content ?? delta?.reasoning_content ?? "";
        if (text) yield { text };
      } catch {
        // ignore malformed
      }
    }
  }
}

/** Non-streaming call for 5W1H summary */
export async function callLMStudio(prompt: string): Promise<string> {
  const url = `${LM_BASE}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-needed",
    },
    body: JSON.stringify({
      model: "gemma-4-26b-a4b-it",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`LM Studio error ${res.status}: ${err}`);
  }

  const data = await res.json() as OpenAIResponse;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Types ──────────────────────────────────────────────────

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
}
