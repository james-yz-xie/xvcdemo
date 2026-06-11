// ─────────────────────────────────────────────────────────────
// Firecrawl API — extracts YouTube transcript from markdown
// https://www.firecrawl.dev/
// ─────────────────────────────────────────────────────────────

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2/scrape";

export async function fetchYoutubeTranscript(
  videoId: string,
  apiKey: string
): Promise<string> {
  const res = await fetch(FIRECRAWL_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      formats: ["markdown"],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Firecrawl error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as FirecrawlResponse;
  const markdown = data.data?.markdown ?? "";

  // Extract transcript section from markdown
  const transcript = extractTranscriptFromMarkdown(markdown);
  if (!transcript || transcript.length < 100) {
    throw new Error("Firecrawl returned no transcript");
  }

  return transcript;
}

function extractTranscriptFromMarkdown(md: string): string {
  // Find "## Transcript" section
  const marker = "## Transcript";
  const startIdx = md.indexOf(marker);
  if (startIdx === -1) return "";

  let transcript = md.slice(startIdx + marker.length).trim();

  // Stop at next h2 or end of document
  const nextH2 = transcript.search(/\n##\s/);
  if (nextH2 !== -1) {
    transcript = transcript.slice(0, nextH2).trim();
  }

  // Clean up: Firecrawl returns each phrase on a new line
  // Join lines that are part of the same sentence
  const lines = transcript.split("\n").map((l) => l.trim()).filter(Boolean);

  const paragraphs: string[] = [];
  let current = "";

  for (const line of lines) {
    // Skip speaker markers like ">> " or "— "
    const cleaned = line.replace(/^>>\s*/, "").replace(/^—\s*/, "");

    if (!current) {
      current = cleaned;
    } else {
      // If current ends with sentence-ending punctuation, start new paragraph
      const endsSentence = /[.!?。！？]\s*$/.test(current);
      if (endsSentence) {
        paragraphs.push(current);
        current = cleaned;
      } else {
        current += " " + cleaned;
      }
    }
  }

  if (current) paragraphs.push(current);

  return paragraphs.join("\n\n");
}

// ─── Types ──────────────────────────────────────────────────

interface FirecrawlResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: Record<string, unknown>;
  };
}
