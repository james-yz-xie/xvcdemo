// ─────────────────────────────────────────────────────────────
// Kimi Code API service — Anthropic-compatible API
// ─────────────────────────────────────────────────────────────

const KIMI_BASE = "https://api.kimi.com/coding";
const KIMI_MODEL = "kimi-code";

export interface KimiStreamChunk {
  text: string;
}

/** Stream content from Kimi Code */
export async function* streamKimi(
  prompt: string,
  apiKey: string
): AsyncGenerator<KimiStreamChunk> {
  const url = `${KIMI_BASE}/v1/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Kimi API error ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from Kimi");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE format: event: xxx\ndata: {...}\n\n
    const lines = buffer.split("\n");
    buffer = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const json = line.slice(6);
        if (json === "[DONE]") continue;

        try {
          const obj = JSON.parse(json);
          // Anthropic streaming format
          const text = obj.delta?.text ?? obj.content_block?.text ?? "";
          if (text) yield { text };
        } catch {
          // ignore malformed
        }
      }
    }
  }
}

/** Non-streaming call for 5W1H summary */
export async function callKimi(prompt: string, apiKey: string): Promise<string> {
  const url = `${KIMI_BASE}/v1/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Kimi API error ${res.status}: ${err}`);
  }

  const data = await res.json() as AnthropicResponse;
  return data.content?.[0]?.text ?? "";
}

// ─── Types ──────────────────────────────────────────────────

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  delta?: { text?: string };
}
