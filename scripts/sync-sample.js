#!/usr/bin/env node
/**
 * Sync sample_output.md → src/services/fallback.ts
 * Run this whenever sample_output.md changes.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "sample_output.md");
const target = path.join(root, "src", "services", "fallback.ts");

const md = fs.readFileSync(source, "utf-8").trimEnd();

// Escape backticks and ${} for template literal
const escaped = md
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$/g, "\\$");

const ts = `// ─────────────────────────────────────────────────────────────
// Fallback article for demo when Gemini API is unavailable
// AUTO-GENERATED from sample_output.md — do not edit manually
// Run: node scripts/sync-sample.js
// ─────────────────────────────────────────────────────────────

export const FALLBACK_ARTICLE = \`${escaped}\`;

export const FALLBACK_5W1H: Record<string, Record<string, string>> = {
  "0": {
    who: "Marc Andreessen 与 Ben Horowitz",
    what: "探讨 AI 革命的万亿美元价值命题，分析收入与成本模型",
    when: "当前 AI 商业化早期阶段",
    where: "全球科技投资与 AI 产业领域",
    why: "AI 的商业模式和成本结构将决定万亿美元价值的归属",
    how: "通过软件零边际成本的分发特性，快速触达全球用户",
  },
  "1": {
    who: "Mark Andreessen",
    what: "AI 行业的收入增长、商业模式、普及速度、定价方式和单位成本下降趋势",
    when: "当前 AI 商业化早期，以及未来十年",
    where: "消费者 AI 市场、企业 AI 市场、云服务和数据中心基础设施领域",
    why: "AI 可以依托已有互联网快速触达全球用户，并能为个人和企业直接创造效率提升、收入增长和成本优化等价值",
    how: "通过消费者订阅、企业按需 token 计费和基于业务价值的变现方式获得收入；同时随着 GPU 和数据中心供给改善，单位成本下降会进一步扩大需求",
  },
  "2": {
    who: "应用层和基础设施层的企业",
    what: "基础模型将被商品化，价值捕获将转移至应用层",
    when: "未来 5-10 年的模型成熟期内",
    where: "垂直行业解决方案、自动化工作流、智能决策系统",
    why: "基础模型像电力一样廉价普及，差异化在于交付具体成果的能力",
    how: "通过构建垂直应用、工作流自动化和领域特定解决方案来捕获价值",
  },
  "3": {
    who: "AI 公司和早期采用者",
    what: "AI 采纳曲线的陡峭程度超越科技史上任何先例",
    when: "当前处于变革极早期，未来十年内将成熟",
    where: "全球市场，特别是消费级和企业级软件市场",
    why: "ChatGPT 等产品的用户增长速度已打破历史记录，预示巨大经济潜力",
    how: "通过持续的技术迭代和产品市场契合，逐步扩大用户基础和收入规模",
  },
};
`;

fs.writeFileSync(target, ts, "utf-8");
console.log("✅ synced sample_output.md → src/services/fallback.ts");
