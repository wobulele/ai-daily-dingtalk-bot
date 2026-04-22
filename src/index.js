import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const statePath = path.join(projectRoot, "data", "state.json");

export const RSS_URL =
  "https://justlovemaki.github.io/CloudFlare-AI-Insight-Daily/rss.xml";
export const REQUIRED_KEYWORD = "AI资讯日报";

export function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function stripHtml(value) {
  return decodeXml(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUrl(value) {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return value;
  }
}

function extractTag(xml, tagName) {
  const pattern = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  );
  const match = xml.match(pattern);
  return match ? match[1].trim() : "";
}

export function parseLatestItem(xml) {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);

  if (!itemMatch) {
    throw new Error("RSS feed does not contain any <item> entries.");
  }

  return {
    title: stripHtml(extractTag(itemMatch[1], "title")),
    guid: stripHtml(extractTag(itemMatch[1], "guid")),
    link: stripHtml(extractTag(itemMatch[1], "link")),
    description: stripHtml(extractTag(itemMatch[1], "description")),
    pubDate: stripHtml(extractTag(itemMatch[1], "pubDate")),
  };
}

export function normalizeItem(item) {
  const title = item.title?.trim();
  const id = normalizeUrl(item.guid?.trim() || item.link?.trim());
  const link = normalizeUrl(item.link?.trim());
  const description = item.description?.trim();
  const pubDate = item.pubDate?.trim();

  if (!title || !id || !link || !description || !pubDate) {
    throw new Error("RSS item is missing required fields.");
  }

  return { id, title, link, description, pubDate };
}

export async function fetchLatestItem(fetchImpl = fetch) {
  const response = await fetchImpl(RSS_URL, {
    headers: {
      "user-agent": "ai-daily-dingtalk-bot/1.0",
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: HTTP ${response.status}`);
  }

  const xml = await response.text();
  return normalizeItem(parseLatestItem(xml));
}

export async function readState() {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeState(item) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    `${JSON.stringify(
      {
        lastSentId: item.id,
        lastSentAt: new Date().toISOString(),
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export function shouldSkipPush(item, state) {
  return Boolean(state?.lastSentId && state.lastSentId === item.id);
}

export function buildDingtalkPayload(item) {
  const publishedAt = new Date(item.pubDate);
  const publishedText = Number.isNaN(publishedAt.getTime())
    ? item.pubDate
    : publishedAt.toLocaleString("zh-CN", {
        hour12: false,
        timeZone: "Asia/Shanghai",
      });

  const summary = item.description.length > 240
    ? `${item.description.slice(0, 240)}...`
    : item.description;

  const markdown = [
    `## ${REQUIRED_KEYWORD}：${item.title}`,
    "",
    `> 发布时间：${publishedText}`,
    "",
    `${summary}`,
    "",
    `[查看今日完整日报](${item.link})`,
  ].join("\n");

  if (!markdown.includes(REQUIRED_KEYWORD)) {
    throw new Error(`DingTalk payload must include keyword: ${REQUIRED_KEYWORD}`);
  }

  return {
    msgtype: "markdown",
    markdown: {
      title: `${REQUIRED_KEYWORD}：${item.title}`,
      text: markdown,
    },
  };
}

export async function pushToDingtalk(item, webhook, fetchImpl = fetch) {
  if (!webhook) {
    throw new Error("Missing required environment variable: DINGTALK_WEBHOOK");
  }

  const payload = buildDingtalkPayload(item);
  const response = await fetchImpl(webhook, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`DingTalk webhook failed: HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.errcode !== 0) {
    throw new Error(
      `DingTalk webhook rejected the message: ${result.errcode} ${result.errmsg}`,
    );
  }
}

export async function run() {
  const item = await fetchLatestItem();
  const state = await readState();
  const forcePush = process.env.FORCE_PUSH === "1";

  if (!forcePush && shouldSkipPush(item, state)) {
    console.log(`Skip push: latest item already sent (${item.id}).`);
    return;
  }

  await pushToDingtalk(item, process.env.DINGTALK_WEBHOOK);
  await writeState(item);
  console.log(`Push succeeded for ${item.id}`);
}

if (process.argv[1] === __filename) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
