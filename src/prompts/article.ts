import type { GenerationRequirements } from "../types";

// ─────────────────────────────────────────────────────────────
// Article generation prompt builder
// ─────────────────────────────────────────────────────────────

export function buildArticlePrompt(
  subtitles: string,
  requirements?: GenerationRequirements
): string {
  const reqBlock = requirements
    ? formatRequirements(requirements)
    : "";

  return [
    "你是一位资深中文科技内容编辑。请严格根据以下要求撰写文章。",
    "",
    reqBlock ? reqBlock.replace("## 用户生成要求", "## 用户生成要求（必须严格遵守，违者视为不合格）") : "",
    "## 字幕内容",
    subtitles,
    "",
    "## 输出要求",
    "1. 文章必须按章节组织，每个章节标题以 `## ` 开头（例如 `## 智能经济：收入爆发与成本塌陷`）。",
    "2. 以对话或叙述形式呈现视频的核心内容，保留对话者的原意和语气。",
    "3. 排版清晰、逻辑连贯，使用恰当的段落分隔。",
    "4. 突出视频中的关键观点、论据和数据，不要遗漏重要信息。",
    "5. 语言流畅自然，符合中文阅读习惯。",
    "6. 不要在文末添加总结或结语之类的固定套路段落。",
    "7. 如果上方存在「用户生成要求」，你必须在内容中明确体现这些要求，不能忽略。",
    "",
    "请直接输出文章正文，不要包含前言或元信息。",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatRequirements(req: GenerationRequirements): string {
  const parts: string[] = ["## 用户生成要求"];

  if (req.taskType) parts.push(`- 任务类型：${req.taskType}`);
  if (req.style) parts.push(`- 输出风格：${req.style}`);
  if (req.audience) parts.push(`- 目标受众：${req.audience}`);
  if (req.constraints) parts.push(`- 约束条件：${req.constraints}`);

  parts.push("");
  return parts.join("\n");
}
