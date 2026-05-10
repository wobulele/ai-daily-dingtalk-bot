import assert from "node:assert/strict";

import {
  DEFAULT_STATE_PATH,
  buildDingtalkPayload,
  fetchLatestItem,
  formatDescriptionSections,
  getStatePath,
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
const statePath = DEFAULT_STATE_PATH;

await runTest("normalizeItem prefers guid and keeps required fields", () => {
  const item = normalizeItem({
    title: "2026-05-07日刊",
    guid: "https://ai.hubtoday.app//2026-05/2026-05-07/",
    link: "https://ai.hubtoday.app//2026-05/2026-05-07/",
    description: "摘要内容",
    pubDate: "Thu, 07 May 2026 10:50:22 GMT",
  });

  assert.equal(item.id, "https://ai.hubtoday.app/2026-05/2026-05-07/");
  assert.equal(item.link, "https://ai.hubtoday.app/docs/2026-05/2026-05-07/");
  assert.equal(item.title, "2026-05-07日刊");
  assert.equal(item.description, "摘要内容");
});

await runTest("normalizeItem does not duplicate docs in daily article links", () => {
  const item = normalizeItem({
    title: "2026-05-07日刊",
    guid: "https://ai.hubtoday.app/docs/2026-05/2026-05-07/",
    link: "https://ai.hubtoday.app/docs/2026-05/2026-05-07/",
    description: "摘要内容",
    pubDate: "Thu, 07 May 2026 10:50:22 GMT",
  });

  assert.equal(item.link, "https://ai.hubtoday.app/docs/2026-05/2026-05-07/");
});

await runTest("normalizeItem does not rewrite unrelated article hosts", () => {
  const item = normalizeItem({
    title: "2026-05-07日刊",
    guid: "https://example.com//2026-05/2026-05-07/",
    link: "https://example.com//2026-05/2026-05-07/",
    description: "摘要内容",
    pubDate: "Thu, 07 May 2026 10:50:22 GMT",
  });

  assert.equal(item.id, "https://example.com/2026-05/2026-05-07/");
  assert.equal(item.link, "https://example.com/2026-05/2026-05-07/");
});

await runTest("fetchLatestItem falls back to the daily page when RSS is gone", async () => {
  const requests = [];
  const dailyHtml = `
    <html>
      <head>
        <title>AI资讯日报 2026/5/10</title>
        <meta name="description" content="GPT 5.5 Pro突破博士级数学难题震惊学界，蚂蚁发布万亿模型并计划开源" />
      </head>
      <body>
        <h3 id="产品与功能更新"><span>产品与功能更新</span></h3>
        <ol>
          <li><p><strong>ChatGPT 5.5 Pro 攻克数学博士难题。</strong> 菲尔兹奖得主进行测评。</p></li>
        </ol>
        <h3 id="前沿研究"><span>前沿研究</span></h3>
        <ol>
          <li><p><strong>PCNET 算法检测幻觉异常点。</strong> 研究团队提高了检测效率。</p></li>
        </ol>
      </body>
    </html>
  `;
  const fetchImpl = async (url) => {
    requests.push(url);

    if (url === "https://justlovemaki.github.io/CloudFlare-AI-Insight-Daily/rss.xml") {
      return {
        ok: false,
        status: 404,
        text: async () => "",
      };
    }

    if (url === "https://hex2077.dev/docs/2026-05/2026-05-10/") {
      return {
        ok: true,
        status: 200,
        text: async () => dailyHtml,
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const item = await fetchLatestItem(fetchImpl, new Date("2026-05-10T02:30:00.000Z"));

  assert.deepEqual(requests, [
    "https://justlovemaki.github.io/CloudFlare-AI-Insight-Daily/rss.xml",
    "https://hex2077.dev/docs/2026-05/2026-05-10/",
  ]);
  assert.equal(item.id, "https://ai.hubtoday.app/docs/2026-05/2026-05-10/");
  assert.equal(item.title, "2026-05-10日刊");
  assert.equal(item.link, "https://ai.hubtoday.app/docs/2026-05/2026-05-10/");
  assert.match(item.description, /GPT 5\.5 Pro/);
  assert.match(item.contentEncoded, /产品与功能更新/);
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
    link: "https://ai.hubtoday.app/docs/2026-04/2026-04-22/",
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
  assert.match(payload.markdown.text, /\[查看今日完整日报\]\(https:\/\/ai\.hubtoday\.app\/docs\/2026-04\/2026-04-22\/\)/);
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

await runTest("formatDescriptionSections extracts multiline daily page list items", () => {
  const sections = formatDescriptionSections(
    "",
    `
      <h3 id="产品与功能更新"><span>产品与功能更新</span></h3>
      <ol>
        <li>
          <p><strong>ChatGPT 5.5 Pro 攻克数学博士难题。</strong> 菲尔兹奖得主进行测评。</p>
        </li>
      </ol>
      <h3 id="前沿研究"><span>前沿研究</span></h3>
      <ol>
        <li>
          <p><strong>PCNET 算法检测幻觉异常点。</strong> 研究团队提高了检测效率。</p>
        </li>
      </ol>
      <h3 id="开源TOP项目"><span>开源TOP项目</span></h3>
      <ol>
        <li>
          <p><strong>谷歌发布 Chrome-DevTools-MCP。</strong> 自动调试浏览器。</p>
        </li>
      </ol>
      <h2>社媒分享</h2>
      <ul>
        <li>页脚导航不应进入日报摘要</li>
      </ul>
    `,
  );

  assert.deepEqual(sections, [
    {
      heading: "产品与功能更新",
      lines: ["ChatGPT 5.5 Pro 攻克数学博士难题。 菲尔兹奖得主进行测评。"],
    },
    {
      heading: "前沿研究",
      lines: ["PCNET 算法检测幻觉异常点。 研究团队提高了检测效率。"],
    },
    {
      heading: "开源TOP项目",
      lines: ["谷歌发布 Chrome-DevTools-MCP。 自动调试浏览器。"],
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

await runTest("getStatePath uses STATE_PATH when provided", async () => {
  const customStatePath = path.resolve(__dirname, "tmp-state.json");

  process.env.STATE_PATH = customStatePath;

  assert.equal(getStatePath(), customStatePath);

  await writeState({
    id: "https://ai.hubtoday.app/2026-04/2026-04-24/",
    title: "2026-04-24日刊",
    link: "https://ai.hubtoday.app/2026-04/2026-04-24/",
    pubDate: "Fri, 24 Apr 2026 10:00:00 GMT",
  });

  const saved = JSON.parse(await fs.readFile(customStatePath, "utf8"));
  assert.equal(saved.lastSentId, "https://ai.hubtoday.app/2026-04/2026-04-24/");

  await fs.rm(customStatePath, { force: true });
  delete process.env.STATE_PATH;
});
