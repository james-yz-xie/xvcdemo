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

  const result = await fetchSubtitles(videoId);

  const response: SubtitlesResponse = {
    videoId,
    subtitles: result.text,
    source: result.source,
  };

  return c.json(response);
});

export default app;
