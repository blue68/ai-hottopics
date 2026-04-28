# AI HotTopics

AI HotTopics 是一个开源热点追踪系统，用于抓取公开数据源、归并话题、计算热度、提取关键词、生成内容草稿，并把结果推送到外部渠道。

它不是纯 dashboard。项目包含一个本地 Node.js API、React 工作台、数据源抓取器、分析规则、内容生成模板、任务监控、素材库和推送中心。

## 功能

- 多源抓取：Hacker News、GitHub Search、arXiv，另有 Google News RSS、Reddit、CoinGecko 的容错接入
- 热点排序：按发布时间、互动量、来源权重、关键词信号计算热度
- 关键词雷达：聚合关键词、关联话题、平均热度和风险
- 内容工厂：生成快讯版、锐评版、Thread、Meme、带节奏版文案
- 推送中心：支持本地模拟推送，配置 Telegram 后可真实发送
- 任务监控：记录每次抓取的数据源、耗时、数量和失败原因
- 设置中心：管理数据源开关、追踪关键词、屏蔽词、热度阈值和 Telegram 配置
- 本地持久化：运行数据默认写入 `data/`，不会提交到仓库

## 快速开始

```bash
npm install
cp .env.example .env
npm run dev
```

打开：

- 前端工作台：http://localhost:5173
- API 服务：http://localhost:8787

生产模式：

```bash
npm run build
npm start
```

生产服务默认监听 `http://localhost:8787`，并直接托管 `dist/` 里的前端静态文件。

## 配置

复制 `.env.example` 为 `.env` 后按需修改。

常用环境变量：

- `PORT`：API 和生产静态服务端口，默认 `8787`
- `DATA_DIR`：本地数据目录，默认 `./data`
- `AUTO_REFRESH`：是否启动后定时刷新，默认 `true`
- `INITIAL_REFRESH`：启动时无数据是否自动抓取，默认 `true`
- `TELEGRAM_ENABLED`：是否启用 Telegram 真实推送
- `TELEGRAM_BOT_TOKEN`：Telegram Bot Token
- `TELEGRAM_CHAT_ID`：Telegram Chat ID

UI 设置中心里的配置会写入 `data/settings.json`。环境变量用于初始化默认值和无 UI 部署场景。

## 项目结构

```text
.
├── server/              # Node.js API、抓取器、分析与推送逻辑
├── src/                 # React 前端工作台
├── docs/                # API、数据源、部署和架构文档
├── scripts/             # 本地/CI 校验脚本
├── data/                # 本地运行数据，默认被 .gitignore 忽略
└── dist/                # 前端构建产物，默认被 .gitignore 忽略
```

## 开发命令

```bash
npm run dev       # 同时启动 API 和 Vite
npm run api       # 只启动 API
npm run check     # TypeScript + server 语法检查
npm run build     # 构建前端
npm run smoke     # 对运行中的 API 做基础接口检查
npm run clean     # 清理构建产物
```

## 数据与合规说明

本项目只抓取公开来源，不绕过登录、付费墙或访问控制。不同数据源可能有频率限制、地域限制或服务条款约束。用于生产环境前，请确认你的使用方式符合对应数据源的条款。

生成的内容草稿仅供编辑参考。涉及金融、政治、公共安全、医疗等高风险话题时，应进行人工复核。

## 文档

- [API 文档](docs/API.md)
- [架构说明](docs/ARCHITECTURE.md)
- [数据源说明](docs/DATA_SOURCES.md)
- [部署说明](docs/DEPLOYMENT.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)

## License

MIT
