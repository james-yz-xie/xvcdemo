# AI 视频文章生成器 — 架构设计文档

> 一个基于 TypeScript + Cloudflare Workers 的 AI 应用实战案例，探索类型安全在现代 AI 工程中的价值。

---

## 目录

1. [项目概述](#1-项目概述)
2. [为什么选择 TypeScript](#2-为什么选择-typescript)
3. [系统架构](#3-系统架构)
4. [核心设计决策](#4-核心设计决策)
5. [TypeScript 在 AI 工程中的实践](#5-typescript-在-ai-工程中的实践)
6. [部署与运维](#6-部署与运维)
7. [扩展方向](#7-扩展方向)

---

## 1. 项目概述

### 1.1 背景

本项目是一个 YouTube 视频字幕提取 + AI 文章生成器。用户输入 YouTube 视频 URL，系统自动提取字幕，调用大语言模型（LLM）生成结构化的中文文章，并支持章节级 5W1H 总结。

### 1.2 核心功能

| 功能 | 说明 |
|------|------|
| 字幕提取 | 支持 Firecrawl 代理、直接请求、硬编码三档 fallback |
| 文章生成 | 流式输出，支持 Gemini、Kimi、LM Studio 多模型 |
| 生成要求 | 任务类型、风格、受众、约束条件自定义 |
| 5W1H 总结 | 章节级结构化总结，基于服务端 KV 缓存 |
| 多 Key 轮询 | Gemini 429 自动切换，提升稳定性 |

### 1.3 技术栈

```
前端: 原生 HTML + marked.js (零构建)
后端: TypeScript + Hono + Cloudflare Workers
存储: Cloudflare KV
AI: Google Gemini / Moonshot Kimi / LM Studio
代理: Firecrawl API
```

---

## 2. 为什么选择 TypeScript

### 2.1 AI 时代的类型安全需求

AI 应用的核心特点是**数据流复杂、边界模糊、错误代价高**：

- **LLM 输出不可预测**：JSON 结构可能变异，字段可能缺失
- **多模型适配**：不同 API 的响应格式差异大
- **流式处理**：数据分片到达，状态管理复杂
- **外部服务依赖**：YouTube、Firecrawl、Gemini 等，任一失败都需优雅降级

TypeScript 的静态类型系统在这些场景下价值显著：

```typescript
// 没有类型：LLM 返回的 JSON 可能是任何东西
const data = await res.json();
console.log(data.candidates[0].content.parts[0].text); // 运行时可能崩溃

// 有类型：编译时就能发现潜在问题
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}
const data: GeminiResponse = await res.json();
// data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
```

### 2.2 本项目的类型实践

#### 2.2.1 核心数据类型定义

```typescript
// src/types.ts
export interface Env {
  Bindings: {
    GEMINI_API_KEY: string;
    KIMI_API_KEY?: string;
    FIRECRAWL_KEY?: string;
    SESSIONS: KVNamespace;
    ASSETS?: Fetcher;
  };
}

export interface Chapter {
  title: string;
  content: string;
}

export interface SessionContext {
  fullArticle: string;
  chapters: Chapter[];
  createdAt: number;
}

export interface GenerationRequirements {
  taskType?: string;
  style?: string;
  audience?: string;
  constraints?: string;
}
```

#### 2.2.2 Prompt 构建的类型安全

```typescript
// src/prompts/article.ts
export function buildArticlePrompt(
  subtitles: string,
  requirements?: GenerationRequirements  // 类型约束输入
): string {
  const reqBlock = requirements
    ? formatRequirements(requirements)    // 类型安全的格式化
    : "";
  // ...
}
```

#### 2.2.3 流式输出的类型约束

```typescript
// src/services/gemini.ts
export interface GeminiStreamChunk {
  text: string;
}

export async function* streamGemini(
  prompt: string,
  apiKey: string
): AsyncGenerator<GeminiStreamChunk> {  // 明确的返回类型
  // ...
  yield { text: chunk };  // 编译器确保 yield 的结构正确
}
```

### 2.3 TypeScript vs Python in AI Engineering

| 维度 | TypeScript | Python |
|------|-----------|--------|
| 类型系统 | 渐进式类型，可严格可宽松 | 动态类型，依赖运行时检查 |
| AI 生态 | 前端 + 边缘计算优势 | 训练/推理框架丰富 (PyTorch/TensorFlow) |
| 部署 | 边缘运行时（Cloudflare Workers/Vercel Edge） | 服务器/容器为主 |
| 流式处理 | 原生 AsyncGenerator + ReadableStream | asyncio + 第三方库 |
| 错误发现 | 编译时捕获大部分类型错误 | 运行时才能发现 |
| 团队协作 | 类型即文档，IDE 智能提示 | 依赖 docstring 和约定 |

**结论**：TypeScript 更适合**AI 应用的工程层**（API 网关、流式转发、前端交互），Python 更适合**AI 模型层**（训练、推理、算法实现）。两者互补，而非替代。

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户浏览器 (Frontend)                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  YouTube URL    │  │  生成要求表单    │  │  章节级 5W1H 按钮            │  │
│  │  字幕提取控制    │  │  模型选择       │  │  (点击展开总结面板)          │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────────┘  │
│           │                    │                                             │
│           ▼                    ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     public/index.html (单文件前端)                   │    │
│  │  • 字幕提取: 调用 /api/subtitles                                    │    │
│  │  • 云端生成: 调用 /api/generate (ReadableStream 实时渲染)            │    │
│  │  • 云端 5W1H: 调用 /api/summarize (仅传 sessionId + chapterIndex)   │    │
│  │  • LM Studio 生成: 直连 http://localhost:1234/v1/chat/completions   │    │
│  │  • LM Studio 5W1H:  直连 localhost 构造 prompt 并解析 JSON          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Workers (Backend)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Hono App                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │    │
│  │  │ /api/subtitles│  │ /api/generate │  │ /api/summarize           │  │    │
│  │  │ 字幕提取      │  │ 流式文章生成  │  │ 云端 5W1H 总结           │  │    │
│  │  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │    │
│  │         │                 │                       │                 │    │
│  │         ▼                 ▼                       ▼                 │    │
│  │  ┌─────────────┐   ┌─────────────┐        ┌─────────────┐          │    │
│  │  │ youtube.ts  │   │  llm.ts     │        │ storage.ts  │          │    │
│  │  │ Firecrawl   │   │ Gemini/Kimi │        │ KV Session  │          │    │
│  │  │ 字幕提取    │   │ 路由网关    │        │ 上下文缓存  │          │    │
│  │  └─────────────┘   └─────────────┘        └─────────────┘          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────────────────────────┐   │
│  │  Cloudflare KV  │  │ 外部 API                                        │   │
│  │  (SESSIONS)     │  │  • Google Gemini API                            │   │
│  │  存储生成上下文  │  │  • Moonshot Kimi API                            │   │
│  └─────────────────┘  │  • Firecrawl API (YouTube 字幕)                 │   │
│                       └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              本地开发环境                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  npm run dev → tsx src/dev.ts @ http://localhost:8789              │    │
│  │  • 加载 .dev.vars 中的 API Key                                     │    │
│  │  • 使用内存 Map 模拟 Cloudflare KV                                  │    │
│  │  • LM Studio 前端直连 localhost:1234                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

#### 3.2.1 字幕提取流程

```
用户输入 URL
    │
    ▼
前端 POST /api/subtitles {videoUrl, forceLive}
    │
    ▼
服务端 youtube.ts
    ├── 1. forceLive=false? → 检查硬编码字幕 → 有则返回
    ├── 2. 直接请求 YouTube → 成功则返回
    └── 3. Firecrawl 代理 → 成功则返回
         └── 都失败 → 报错
```

#### 3.2.2 文章生成流程

```
用户点击生成
    │
    ▼
前端 POST /api/generate {videoId, subtitles, requirements, model}
    │
    ▼
服务端 generate.ts
    ├── model === 'demo'? → 返回硬编码文章
    └── 否则 → buildArticlePrompt(subtitles, requirements)
              │
              ▼
         llm.ts 路由到 Gemini/Kimi
              │
              ▼
         TransformStream 流式返回
              │
              ▼
         前端实时渲染 markdown
              │
              ▼
         流末尾附带 <!--SESSION:uuid-->
```

#### 3.2.3 5W1H 总结流程

```
用户点击章节 5W1H 按钮
    │
    ▼
前端 POST /api/summarize {sessionId, chapterIndex, model}
    │
    ▼
服务端 summarize.ts
    ├── 从 KV 读取 session（fullArticle + chapters）
    ├── 提取指定 chapter
    ├── buildSummaryPrompt(fullArticle, chapter)
    └── llm.ts 调用 Gemini/Kimi → 返回 JSON
```

---

## 4. 核心设计决策

### 4.1 前端：零构建单文件 HTML

**决策**：不使用 React/Vue，直接用原生 HTML + `<script>`

**原因**：
- 项目规模小，构建工具增加复杂度
- 部署简单，无需 CI/CD 构建步骤
- 类型安全由后端保证，前端只需轻量交互

**权衡**：
- ✅ 开发快、部署快、无构建依赖
- ❌ 大型项目难以维护，组件复用性差

### 4.2 后端：Hono + Cloudflare Workers

**决策**：使用 Hono 框架运行在 Cloudflare Workers 边缘运行时

**原因**：
- Workers 是 V8 isolate，冷启动 < 1ms
- 天然支持流式响应（TransformStream）
- KV 存储配置极简，适合 session 缓存
- TypeScript 原生支持

**代码示例**：

```typescript
// src/index.ts
import { Hono } from "hono";
import type { Env } from "./types";

const app = new Hono<Env>();

// 类型安全的中间件
app.use(async (c, next) => {
  // c.env.GEMINI_API_KEY 有类型提示
  await next();
});

app.route("/api/subtitles", subtitlesRoute);
app.route("/api/generate", generateRoute);
app.route("/api/summarize", summarizeRoute);
```

### 4.3 LLM 路由网关

**决策**：统一 `llm.ts` 网关，隐藏不同模型的差异

```typescript
// src/services/llm.ts
export async function* streamLLM(
  prompt: string,
  apiKey: string,
  model?: string
): AsyncGenerator<LLMStreamChunk> {
  const provider = detectProvider(apiKey, model);
  switch (provider) {
    case "kimi": yield* streamKimi(prompt, apiKey); break;
    default: yield* streamGemini(prompt, apiKey);
  }
}
```

**价值**：
- 新增模型只需实现接口，不影响路由逻辑
- 统一错误处理（429 重试、超时等）
- 类型约束确保所有模型实现一致的输入输出

### 4.4 字幕提取三档 Fallback

```typescript
// src/services/youtube.ts
export async function fetchSubtitles(
  videoId: string,
  forceLive = false,
  firecrawlKey?: string
): Promise<SubtitleResult> {
  // 1. 硬编码兜底（零延迟）
  if (!forceLive) {
    const fallback = getHardcodedSubtitles(videoId);
    if (fallback) return { text: fallback, source: "fallback" };
  }

  // 2. 直接请求 YouTube
  try {
    return { text: await fetchLiveSubtitles(videoId), source: "live" };
  } catch { /* continue */ }

  // 3. Firecrawl 代理
  try {
    return { text: await fetchLiveSubtitlesViaFirecrawl(videoId, firecrawlKey), source: "live" };
  } catch { /* continue */ }

  throw new Error("字幕提取失败");
}
```

**设计哲学**：
- **优雅降级**：每一层失败都不影响下一层尝试
- **用户无感知**：成功时返回 source 标记，失败时报错而非静默 fallback
- **可观测性**：source 字段让前端知道数据来源

---

## 5. TypeScript 在 AI 工程中的实践

### 5.1 类型驱动的 Prompt 工程

Prompt 是 AI 应用的"接口定义"。TypeScript 类型可以约束 Prompt 的输入输出：

```typescript
// 输入类型约束
interface GenerationRequirements {
  taskType?: string;   // "摘要" | "深度分析" | "新闻稿"
  style?: string;      // "幽默" | "严肃" | "学术"
  audience?: string;   // "投资人" | "普通读者"
  constraints?: string; // "1000字以内" | "不要专业术语"
}

// Prompt 构建器：类型保证不会遗漏字段
function formatRequirements(req: GenerationRequirements): string {
  const parts: string[] = ["## 用户生成要求"];
  if (req.taskType) parts.push(`- 任务类型：${req.taskType}`);
  if (req.style) parts.push(`- 输出风格：${req.style}`);
  // ...
  return parts.join("\n");
}
```

### 5.2 LLM 输出的类型解析

LLM 经常返回不严格的 JSON。TypeScript 配合防御性解析：

```typescript
// src/services/gemini.ts
function extractTextFromGeminiChunk(obj: unknown): string | null {
  // 先断言为预期结构
  const chunk = obj as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  // 安全访问，任何层级缺失都返回 null
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  return parts.map((p) => p.text ?? "").join("");
}
```

### 5.3 流式处理的类型安全

```typescript
// 明确的异步生成器类型
export async function* streamGemini(
  prompt: string,
  apiKey: string
): AsyncGenerator<GeminiStreamChunk> {
  const res = await fetch(url, { ... });
  const reader = res.body?.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // 编译器确保 yield 的值符合 GeminiStreamChunk 结构
    yield { text: extractText(value) };
  }
}

// 消费端也有类型约束
for await (const chunk of streamGemini(prompt, key)) {
  // chunk.text 有类型提示，不会写错字段名
  await writer.write(encoder.encode(chunk.text));
}
```

### 5.4 环境变量的类型安全

```typescript
// src/types.ts
export interface Env {
  Bindings: {
    GEMINI_API_KEY: string;      // 必填
    KIMI_API_KEY?: string;       // 可选
    FIRECRAWL_KEY?: string;      // 可选
    SESSIONS: KVNamespace;       // Cloudflare KV 绑定
    ASSETS?: Fetcher;            // 静态资源
  };
}

// Hono 自动推断 c.env 类型
app.use(async (c, next) => {
  // c.env.GEMINI_API_KEY 是 string，有类型提示
  // c.env.KIMI_API_KEY 是 string | undefined
  if (!c.env.GEMINI_API_KEY) {
    return c.json({ error: "GEMINI_API_KEY not configured" }, 500);
  }
  await next();
});
```

### 5.5 AI 时代的 TypeScript 优势总结

| 场景 | TypeScript 价值 |
|------|----------------|
| **Prompt 工程** | 类型约束输入参数，避免拼写错误 |
| **LLM 输出解析** | 接口定义预期结构，防御性访问 |
| **多模型适配** | 统一接口，编译时检查实现完整性 |
| **流式处理** | AsyncGenerator 类型保证数据流正确 |
| **配置管理** | 环境变量类型化，缺失必填项编译报错 |
| **团队协作** | 类型即文档，减少沟通成本 |

---

## 6. 部署与运维

### 6.1 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cat > .dev.vars << EOF
GEMINI_API_KEY=key1,key2,key3
KIMI_API_KEY=your_kimi_key
FIRECRAWL_KEY=your_firecrawl_key
EOF

# 3. 启动开发服务器
npm run dev  # http://localhost:8789
```

### 6.2 生产部署

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 KV namespace
npx wrangler kv:namespace create "SESSIONS"
# 将返回的 id 填入 wrangler.toml

# 3. 设置 secrets
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put KIMI_API_KEY
npx wrangler secret put FIRECRAWL_KEY

# 4. 部署
npm run deploy
```

### 6.3 监控与日志

```bash
# 实时查看 Worker 日志
npx wrangler tail

# 查看特定时间段日志
npx wrangler tail --format=pretty
```

---

## 7. 扩展方向

### 7.1 短期优化

- [ ] 支持更多视频平台（Bilibili、Twitter/X）
- [ ] 添加多语言字幕翻译
- [ ] 支持自定义 LLM 模型（OpenAI、Claude、本地模型）
- [ ] 添加文章导出功能（PDF、Markdown）

### 7.2 中期演进

- [ ] 用户认证与历史记录
- [ ] 文章收藏与分享
- [ ] 批量视频处理
- [ ] 自定义 Prompt 模板

### 7.3 长期愿景

- [ ] AI 驱动的视频内容分析平台
- [ ] 多模态理解（视频画面 + 音频 + 字幕）
- [ ] 个性化内容推荐引擎

---

## 附录：关键代码片段

### A.1 流式响应实现

```typescript
// src/routes/generate.ts
const stream = new TransformStream();
const writer = stream.writable.getWriter();

// 异步生成，不阻塞主线程
c.executionCtx.waitUntil(
  (async () => {
    try {
      for await (const chunk of streamLLM(prompt, apiKey, model)) {
        await writer.write(new TextEncoder().encode(chunk.text));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      await writer.write(new TextEncoder().encode(`\n\n<!--ERROR:${msg}-->`));
    } finally {
      await writer.close();
    }
  })()
);

return c.body(stream.readable);
```

### A.2 多 Key 轮询

```typescript
// src/services/gemini.ts
export async function* streamGemini(prompt: string, apiKey: string) {
  const keys = apiKey.split(",").map(k => k.trim()).filter(Boolean);
  let lastError = "unknown";

  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${MODEL}:streamGenerateContent?key=${keys[i]}`, { ... });
      if (res.status === 429) { lastError = "429"; continue; }
      // ... 处理响应
      return; // 成功则退出
    } catch (err) {
      if (i === keys.length - 1) throw err;
    }
  }
  throw new Error(`All keys exhausted. Last: ${lastError}`);
}
```

### A.3 KV Session 缓存

```typescript
// src/services/storage.ts
export async function saveSession(
  kv: KVNamespace,
  sessionId: string,
  ctx: SessionContext
): Promise<void> {
  await kv.put(sessionId, JSON.stringify(ctx), {
    expirationTtl: 60 * 60 * 24, // 24h
  });
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string
): Promise<SessionContext | null> {
  const raw = await kv.get(sessionId);
  return raw ? JSON.parse(raw) : null;
}
```

---

*文档版本: 1.0*
*最后更新: 2026-06-09*
