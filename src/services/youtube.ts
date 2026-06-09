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

/** Fetch subtitles for a video.
 *  Falls back to hard-coded transcript when live extraction fails
 *  (PRD recommendation: YouTube caption extraction is unstable).
 */
export async function fetchSubtitles(videoId: string): Promise<string> {
  try {
    const live = await fetchLiveSubtitles(videoId);
    if (live.trim().length >= 100) {
      return live;
    }
  } catch {
    // fall through to hard-coded fallback
  }

  const fallback = getHardcodedSubtitles(videoId);
  if (fallback) {
    return fallback;
  }

  throw new Error(
    "该视频暂无可用字幕。请尝试其他 YouTube 视频，或使用 PRD 示例视频: https://www.youtube.com/watch?v=xRh2sVcNXQ8"
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

  const jsonText = extractYtJson(html);
  if (!jsonText) throw new Error("无法获取视频播放器信息");

  const playerResponse = JSON.parse(jsonText) as PlayerResponse;

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

// ─── Hard-coded subtitles (PRD recommendation) ──────────────

const HARDCODED_SUBTITLES: Record<string, string> = {
  xRh2sVcNXQ8:
    "Marc Andreessen: I think the big question is, what is the trillion dollar question around AI? " +
    "And I think there are really two components to it. One is, what is the revenue model? " +
    "And two is, what is the cost model? And I think both of those are going to be very different than people expect. " +
    "And I think the revenue model is going to be, there's going to be a lot of money made in AI, " +
    "but it's going to be in ways that people don't necessarily expect. " +
    "It's not going to be the way that people made money in the previous tech cycles. " +
    "Ben Horowitz: Yeah, I mean, I think the revenue model is going to be, you know, " +
    "there's going to be consumer subscriptions, there's going to be enterprise usage, " +
    "there's going to be kind of per-token pricing, and there's going to be kind of value-based pricing " +
    "where people are paying for outcomes. " +
    "Marc Andreessen: Right. And I think the key insight is that AI can reach the entire internet population basically overnight. " +
    "Because it's software. It doesn't require any physical distribution. It doesn't require retail stores. " +
    "It doesn't require any of the infrastructure that previous products required. " +
    "Ben Horowitz: That's a huge point. Like the distribution is just fundamentally different. " +
    "Marc Andreessen: Yeah. And so the revenue can come very fast because the distribution is instant. " +
    "But then the other side of it is the cost model. And I think this is where people are really going to be surprised. " +
    "Ben Horowitz: You mean the cost of training? Or the cost of inference? " +
    "Marc Andreessen: Both, but particularly inference. I think inference costs are going to fall much faster than people think. " +
    "And the reason is because you're going to get these massive improvements in GPU efficiency, " +
    "you're going to get better algorithms, you're going to get model compression, " +
    "and then you're going to get data center build-out at scale. " +
    "Ben Horowitz: Right, so like the Jevons paradox applies here? " +
    "Marc Andreessen: Exactly. The Jevons paradox. As the cost of using AI goes down, " +
    "the usage goes up more than proportionally. So you actually get a revenue increase as costs fall. " +
    "Ben Horowitz: That's counterintuitive to a lot of the bear cases. " +
    "Marc Andreessen: Yeah. And so I think the trillion dollar question really comes down to: " +
    "can the revenue from all of these different models grow fast enough to offset whatever the ultimate cost structure is? " +
    "And my view is that the answer is yes, because the distribution is instant, " +
    "the value creation is very real, and the cost curves are going to improve very rapidly. " +
    "Ben Horowitz: What about the pricing pressure though? Like, if everyone's building AI, " +
    "isn't there going to be massive commoditization? " +
    "Marc Andreessen: There will be commoditization at the base model layer. " +
    "But I think where the value is going to be captured is at the application layer and at the infrastructure layer. " +
    "And I think the companies that figure out how to deliver specific outcomes for customers " +
    "are going to be able to capture a lot of value. " +
    "Ben Horowitz: So it's like, the models become utilities, but the applications become the valuable part. " +
    "Marc Andreessen: Exactly. The models are the new electricity. They're going to be cheap and abundant. " +
    "But the things you build with them, the applications, the workflows, the automation — that's where the trillion dollars is. " +
    "Ben Horowitz: And what about the timing? Like, when does this all play out? " +
    "Marc Andreessen: I think we're in the very early innings. I think over the next decade, " +
    "you're going to see this play out. But I think the early signs are already very encouraging. " +
    "The adoption curves are steeper than anything we've seen in technology history. " +
    "Ben Horowitz: Yeah, I mean, ChatGPT got to a hundred million users faster than anything ever. " +
    "Marc Andreessen: Right. And so I think the trillion dollar question is really just a question of time. " +
    "It's not a question of if. It's a question of when and who captures it. " +
    "Ben Horowitz: So your bet is, broadly, this is a massive expansion of the technology economy. " +
    "Marc Andreessen: Yes. I think AI is going to expand the technology economy by an order of magnitude. " +
    "And I think the companies that are built with AI at their core are going to be the biggest companies in the world in ten years.",
};

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
