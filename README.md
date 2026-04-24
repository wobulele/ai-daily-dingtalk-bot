# AI 资讯日报钉钉机器人

项目会读取 [AI 资讯日报 RSS](https://justlovemaki.github.io/CloudFlare-AI-Insight-Daily/rss.xml)，如果出现新的日报条目，则将 `标题 + 摘要 + 链接` 推送到钉钉群机器人。

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

## Debian 13 部署

### 1. 安装依赖

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
```

安装 Node.js `20+`，只要满足“原生支持 `fetch`”即可。

### 2. 拉取代码

```bash
cd /opt
sudo git clone https://github.com/wobulele/ai-daily-dingtalk-bot.git
sudo chown -R "$USER":"$USER" /opt/ai-daily-dingtalk-bot
cd /opt/ai-daily-dingtalk-bot
```

### 3. 配置服务器环境变量

```bash
cp .env.example .env
chmod 600 .env
```

编辑 `.env`：

- `DINGTALK_WEBHOOK` 填你的钉钉机器人地址
- `STATE_PATH` 建议保持为 `.runtime/state.json`

### 4. 先手动跑通一次

```bash
chmod +x scripts/run-on-server.sh
./scripts/run-on-server.sh
```

如果钉钉能收到消息，说明服务器网络、Webhook、Node.js 和脚本都正常。

### 5. 再开启 cron

推荐每 10 分钟检查一次，时间窗口设为北京时间 `10:00-12:59`。项目有去重逻辑，因此一天内即使检查多次，也只会成功发送一次。

编辑 `crontab`：

```bash
crontab -e
```

加入：

```cron
CRON_TZ=Asia/Shanghai
*/10 10-12 * * * cd /opt/ai-daily-dingtalk-bot && /bin/bash ./scripts/run-on-server.sh >> /var/log/ai-daily-dingtalk-bot.log 2>&1
```

查看日志：

```bash
tail -f /var/log/ai-daily-dingtalk-bot.log
```

## GitHub Actions

- 当前只保留手动 `workflow_dispatch`
- 目的：作为应急测试入口，不再承担生产环境的自动调度
- 迁移到 Debian `cron` 后，不要再恢复 GitHub 的 `schedule`，否则会和服务器重复推送

如果需要在 GitHub 网页里重复演示今天的推送，继续使用 `workflow_dispatch + force_push` 即可。

## 状态文件

- 默认状态文件：`data/state.json`
- Debian 服务器建议通过 `.env` 把 `STATE_PATH` 设为 `.runtime/state.json`
- 这样服务器上的去重状态不会污染 Git 工作区，也不会和 GitHub 手动测试互相干扰

## 排障

- 先手动执行 `./scripts/run-on-server.sh`，确认 RSS 拉取、解析和钉钉返回值
- 再查看 `tail -f /var/log/ai-daily-dingtalk-bot.log`
- 若钉钉不发消息，优先确认：
  - Webhook 是否正确
  - 机器人是否仍然启用
  - 关键词 `AI资讯日报` 是否匹配
  - 当天 RSS 是否已有新条目
