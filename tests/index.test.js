import assert from "node:assert/strict";

import {
  buildDingtalkPayload,
  normalizeItem,
  shouldSkipPush,
} from "../src/index.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("normalizeItem prefers guid and keeps required fields", () => {
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

runTest("shouldSkipPush returns true when the latest item was already sent", () => {
  assert.equal(
    shouldSkipPush(
      { id: "same-guid" },
      { lastSentId: "same-guid", lastSentAt: "2026-04-22T10:00:00.000Z" },
    ),
    true,
  );
});

runTest("buildDingtalkPayload contains the required keyword and article details", () => {
  const payload = buildDingtalkPayload({
    title: "2026-04-22日刊",
    link: "https://ai.hubtoday.app/2026-04/2026-04-22/",
    description: "这是当天摘要",
    pubDate: "Wed, 22 Apr 2026 09:44:53 GMT",
  });

  assert.equal(payload.msgtype, "markdown");
  assert.match(payload.markdown.title, /AI资讯日报/);
  assert.match(payload.markdown.text, /AI资讯日报/);
  assert.match(payload.markdown.text, /2026-04-22日刊/);
  assert.match(
    payload.markdown.text,
    /https:\/\/ai\.hubtoday\.app\/2026-04\/2026-04-22\//,
  );
});

runTest("normalizeItem throws when mandatory fields are missing", () => {
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
