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
    "【系统指令】你是一位资深中文科技内容编辑。你的唯一任务是按照以下用户要求撰写文章。",
    "",
    "【重要】用户生成要求具有最高优先级，必须严格遵守。任何违反用户要求的内容都是错误的。",
    "",
    reqBlock ? reqBlock.replace("## 用户生成要求", "## 用户生成要求（最高优先级指令 — 必须严格遵守）") : "",
    "## 字幕内容",
    subtitles,
    "",
    "## 输出要求",
    "1. 文章必须按章节组织，每个章节标题以 `## ` 开头。",
    "2. 以对话或叙述形式呈现视频的核心内容，保留对话者的原意和语气。",
    "3. 排版清晰、逻辑连贯，使用恰当的段落分隔。",
    "4. 突出视频中的关键观点、论据和数据，不要遗漏重要信息。",
    "5. 语言流畅自然，符合中文阅读习惯。",
    "6. 不要在文末添加总结或结语之类的固定套路段落。",
    "7. 必须严格遵守上方的「用户生成要求」。如果用户要求限制字数，必须精确控制；如果用户要求特定风格，必须明确体现。",
    "8. 在输出文章前，先自检：是否违反了用户生成要求？如果有，立即修正。",
    "",
    "请直接输出文章正文，不要包含前言、元信息或自检说明。",
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
