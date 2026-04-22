# AI 资讯日报钉钉机器人

每天北京时间 `09:00` 读取 [AI 资讯日报 RSS](https://justlovemaki.github.io/CloudFlare-AI-Insight-Daily/rss.xml)，如果出现新的日报条目，则将 `标题 + 摘要 + 链接` 推送到钉钉群机器人。

## 机器人配置

- 钉钉机器人使用“关键词匹配”模式
- 关键词固定为 `AI资讯日报`
- 本项目不会计算加签，因此只需要配置 `Webhook`

## GitHub Secrets

在仓库 `Settings > Secrets and variables > Actions` 中新增：

- `DINGTALK_WEBHOOK`：钉钉群机器人 Webhook

## 使用方式

```bash
npm test
npm start
```

`npm start` 需要本地环境变量 `DINGTALK_WEBHOOK`。

如果需要在同一天重复演示今天的日报推送，可以临时加上：

```bash
$env:FORCE_PUSH="1"
npm start
```

## GitHub Actions

- 定时：每天北京时间 `09:00`
- 换算成 UTC cron：`0 1 * * *`
- 也支持手动 `workflow_dispatch`

## 状态文件

项目会在 `data/state.json` 中记录最近一次成功推送的日报 `guid/link`，用于避免重复发送。该文件由 GitHub Actions 在成功推送后自动提交回仓库。

## 排障

- 查看 GitHub Actions 运行日志确认 RSS 拉取、解析和钉钉返回值
- 若钉钉不发消息，优先确认：
  - Webhook 是否正确
  - 机器人是否仍然启用
  - 关键词 `AI资讯日报` 是否匹配
  - 当天 RSS 是否已有新条目
