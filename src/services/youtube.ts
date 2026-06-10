// ─────────────────────────────────────────────────────────────
// YouTube subtitle extraction
// ─────────────────────────────────────────────────────────────

import { HARDCODED_SUBTITLES } from "../data/subtitles";
import { fetchViaProxy } from "./proxy";

/** Extract video ID from any YouTube URL format */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export interface SubtitleResult {
  text: string;
  source: "fallback" | "live";
}

/** Fetch subtitles for a video.
 *  Hard-coded transcripts are returned instantly (PRD recommendation).
 *  Falls back to live extraction only when no hard-coded data exists.
 */
export async function fetchSubtitles(videoId: string, forceLive = false): Promise<SubtitleResult> {
  // 1. Return hard-coded immediately if available — zero latency
  if (!forceLive) {
    const fallback = getHardcodedSubtitles(videoId);
    if (fallback) {
      return { text: fallback, source: "fallback" };
    }
  }

  // 2. Attempt direct live extraction
  try {
    const live = await fetchLiveSubtitles(videoId);
    if (live.trim().length >= 100) {
      return { text: live, source: "live" };
    }
  } catch {
    // fall through to proxy attempt
  }

  // 3. Attempt via webshare.io proxy (PRD recommendation)
  try {
    const live = await fetchLiveSubtitlesViaProxy(videoId);
    if (live.trim().length >= 100) {
      return { text: live, source: "live" };
    }
  } catch {
    // fall through
  }

  throw new Error(
    "该视频暂无可用字幕。YouTube 目前对自动化字幕提取做了限制，大多数视频无法获取字幕。请使用下方「📄 PRD 示例（Demo 模式）」按钮体验完整功能。"
  );
}

// ─── Live extraction ────────────────────────────────────────

async function fetchLiveSubtitles(videoId: string): Promise<string> {
  const pageRes = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }
  );

  const html = await pageRes.text();
  return extractAndParseSubtitles(html, false);
}

async function fetchLiveSubtitlesViaProxy(videoId: string): Promise<string> {
  const pageRes = await fetchViaProxy(
    `https://www.youtube.com/watch?v=${videoId}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }
  );

  const html = await pageRes.text();
  return extractAndParseSubtitles(html, true);
}

async function extractAndParseSubtitles(html: string, useProxy = false): Promise<string> {
  const jsonText = extractYtJson(html);
  if (!jsonText) throw new Error("无法获取视频播放器信息");

  const playerResponse = JSON.parse(jsonText) as PlayerResponse;

  const tracks = playerResponse.captions?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error("该视频没有可用字幕");
  }

  const track = tracks.find((t) => t.languageCode === "en") ?? tracks[0];

  // Fetch transcript XML — try proxy if requested
  const transcriptRes = useProxy
    ? await fetchViaProxy(track.baseUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      })
    : await fetch(track.baseUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

  const xml = await transcriptRes.text();
  return parseTranscriptXml(xml);
}

/** Extract ytInitialPlayerResponse JSON using brace counting */
function extractYtJson(html: string): string | null {
  const marker = "ytInitialPlayerResponse";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  // Find the first '{' after the marker
  let braceStart = html.indexOf("{", startIdx);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];

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
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return html.slice(braceStart, i + 1);
      }
    }
  }

  return null;
}

function parseTranscriptXml(xml: string): string {
  const texts: string[] = [];
  const re = /<text[^>]*>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const decoded = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    if (decoded.trim()) texts.push(decoded.trim());
  }
  return texts.join(" ");
}

function getHardcodedSubtitles(videoId: string): string | null {
  return HARDCODED_SUBTITLES[videoId] ?? null;
}

// ─── Types ──────────────────────────────────────────────────

interface PlayerResponse {
  captions?: {
    captionTracks?: Array<{
      baseUrl: string;
      languageCode: string;
      name?: { simpleText: string };
    }>;
  };
}
