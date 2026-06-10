import { Hono } from "hono";
import type { Env } from "../types";
import { extractVideoId, fetchSubtitles } from "../services/youtube";
import type { SubtitlesRequest, SubtitlesResponse } from "../types";

const app = new Hono<Env>();

app.post("/", async (c) => {
  const body = await c.req.json<SubtitlesRequest>();
  const videoId = extractVideoId(body.videoUrl);

  if (!videoId) {
    return c.json({ error: "Invalid YouTube URL" }, 400);
  }

  try {
    const forceLive = body.forceLive === true;
    const result = await fetchSubtitles(videoId, forceLive);

    const response: SubtitlesResponse = {
      videoId,
      subtitles: result.text,
      source: result.source,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "字幕提取失败";
    return c.json({ error: message }, 500);
  }
});

export default app;
