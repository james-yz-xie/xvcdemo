// ─────────────────────────────────────────────────────────────
// YouTube subtitle extraction
// ─────────────────────────────────────────────────────────────

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

/** Fetch subtitles for a video */
export async function fetchSubtitles(videoId: string): Promise<string> {
  const live = await fetchLiveSubtitles(videoId);
  if (live.trim().length < 100) {
    throw new Error("字幕内容过短，可能不是有效字幕");
  }
  return live;
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

  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) throw new Error("无法获取视频播放器信息");

  const playerResponse = JSON.parse(match[1]) as PlayerResponse;

  const tracks = playerResponse.captions?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error("该视频没有可用字幕");
  }

  const track = tracks.find((t) => t.languageCode === "en") ?? tracks[0];

  const transcriptRes = await fetch(track.baseUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  const xml = await transcriptRes.text();
  return parseTranscriptXml(xml);
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
