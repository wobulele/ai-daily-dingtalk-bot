import assert from "node:assert/strict";

import {
  buildDingtalkPayload,
  formatDescriptionSections,
  normalizeItem,
  shouldSkipPush,
  writeState,
} from "../src/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statePath = path.resolve(__dirname, "..", "data", "state.json");

await runTest("normalizeItem prefers guid and keeps required fields", () => {
  const item = normalizeItem({
    title: "2026-04-22日刊",
    guid: "https://ai.hubtoday.app//2026-04/2026-04-22/",
    link: "https://ai.hubtoday.app//2026-04/2026-04-22/",
    description: "摘要内容",
    pubDate: "Wed, 22 Apr 2026 09:44:53 GMT",
  });

  assert.equal(item.id, "https://ai.hubtoday.app/2026-04/2026-04-22/");
  assert.equal(item.link, "https://ai.hubtoday.app/2026-04/2026-04-22/");
  assert.equal(item.title, "2026-04-22日刊");
  assert.equal(item.description, "摘要内容");
});

await runTest("shouldSkipPush returns true when the latest item was already sent", () => {
  assert.equal(
    shouldSkipPush(
      { id: "same-guid" },
      { lastSentId: "same-guid", lastSentAt: "2026-04-22T10:00:00.000Z" },
    ),
    true,
  );
});

await runTest("buildDingtalkPayload contains the required keyword and article details", () => {
  const payload = buildDingtalkPayload({
    title: "2026-04-22日刊",
    link: "https://ai.hubtoday.app/2026-04/2026-04-22/",
    description:
      "前往官网查看完整版 (ai.hubtoday.app) 产品与功能更新 GPT-Image-2 登顶文生图竞技场并刷新纪录。 谷歌 发布 Gemini 深度研究智能体更新。 前沿研究 研究人员 发布内窥镜 AI 超分可靠性框架。 研究者 利用新技术增强视频生成一致性。 斯坦福",
    pubDate: "Wed, 22 Apr 2026 09:44:53 GMT",
  });

  assert.equal(payload.msgtype, "markdown");
  assert.match(payload.markdown.title, /AI资讯日报/);
  assert.match(payload.markdown.text, /AI资讯日报/);
  assert.match(payload.markdown.text, /2026-04-22日刊/);
  assert.match(payload.markdown.text, /日期：2026-04-22/);
  assert.doesNotMatch(payload.markdown.text, /发布时间：/);
  assert.doesNotMatch(payload.markdown.text, /前往官网查看完整版/);
  assert.match(payload.markdown.text, /\*\*产品与功能更新：\*\*/);
  assert.match(payload.markdown.text, /- GPT-Image-2 登顶文生图竞技场并刷新纪录。/);
  assert.match(payload.markdown.text, /\[查看今日完整日报\]\(https:\/\/ai\.hubtoday\.app\/2026-04\/2026-04-22\/\)/);
});

await runTest("normalizeItem throws when mandatory fields are missing", () => {
  assert.throws(
    () =>
      normalizeItem({
        title: "",
        guid: "",
        link: "",
        description: "",
        pubDate: "",
      }),
    /RSS item is missing required fields/,
  );
});

await runTest("formatDescriptionSections removes intro text and drops incomplete fragments", () => {
  const sections = formatDescriptionSections(
    "前往官网查看完整版 (ai.hubtoday.app) 产品与功能更新 GPT-Image-2 登顶文生图竞技场并刷新纪录。 谷歌 发布 Gemini 深度研究智能体更新。 前沿研究 研究人员 发布内窥镜 AI 超分可靠性框架。 研究者 利用新技术增强视频生成一致性。 斯坦福",
  );

  assert.deepEqual(sections, [
    {
      heading: "产品与功能更新",
      lines: [
        "GPT-Image-2 登顶文生图竞技场并刷新纪录。",
        "谷歌 发布 Gemini 深度研究智能体更新。",
      ],
    },
    {
      heading: "前沿研究",
      lines: [
        "研究人员 发布内窥镜 AI 超分可靠性框架。",
        "研究者 利用新技术增强视频生成一致性。",
      ],
    },
  ]);
});

await runTest("writeState records trigger metadata for debugging", async () => {
  const original = await fs.readFile(statePath, "utf8");

  process.env.RUN_EVENT_NAME = "schedule";
  process.env.RUN_EVENT_SCHEDULE = "7,37 1-4 * * *";

  await writeState({
    id: "https://ai.hubtoday.app/2026-04/2026-04-23/",
    title: "2026-04-23日刊",
    link: "https://ai.hubtoday.app/2026-04/2026-04-23/",
    pubDate: "Thu, 23 Apr 2026 10:22:35 GMT",
  });

  const saved = JSON.parse(await fs.readFile(statePath, "utf8"));
  assert.equal(saved.lastTriggerEvent, "schedule");
  assert.equal(saved.lastTriggerSchedule, "7,37 1-4 * * *");

  await fs.writeFile(statePath, original, "utf8");
  delete process.env.RUN_EVENT_NAME;
  delete process.env.RUN_EVENT_SCHEDULE;
});
