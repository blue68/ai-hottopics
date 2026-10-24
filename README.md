

# AI HotTopics

AI HotTopics 是一个开源热点追踪系统，用于抓取公开数据源、归并话题、计算热度、提取关键词、生成内容草稿，并把结果推送到外部渠道。

它不是纯 dashboard。项目包含一个本地 Node.js API、React 工作台、数据源抓取器、分析规则、内容生成模板、任务监控、素材库和推送中心。

## 功能

- 多源抓取：X/Twitter、微博热搜、Hacker News、GitHub Search、arXiv，另有 Google News RSS、Reddit、CoinGecko 的容错接入
- 热点排序：按发布时间、互动量、来源权重、关键词信号计算热度
- X 日榜：中文圈、AI/Crypto、全球范围切换，蓝 V 流量榜、圈层话题榜和官方地区热榜，支持示例预览与真实接口对接
- 可视化分析：平台热点分布、类目平均热度、蓝 V 账号表现、榜内流量占比和话题参与度；图表随当前筛选和榜单来源更新
- 关键词雷达：聚合关键词、关联话题、平均热度和风险
- 内容工厂：生成快讯版、锐评版、Thread、Meme、带节奏版文案
- 推送中心：支持本地模拟推送，配置 Telegram 后可真实发送
- 任务监控：记录每次抓取的数据源、耗时、数量和失败原因
- 设置中心：管理数据源开关、追踪关键词、屏蔽词、热度阈值和 Telegram 配置
- 本地持久化：运行数据默认写入 `data/`，不会提交到仓库

## 快速开始

需要 Node.js `>=20.0.0` 和 npm `>=10.0.0`。

```bash
npm install
cp .env.example .env
npm run dev
```

开发服务默认只监听本机。对外部署请使用 `npm run build && npm start` 或 Docker，不要直接暴露 Vite 开发服务器。

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
- `HOST`：监听地址，默认 `127.0.0.1`；对外监听前必须配置 `ADMIN_TOKEN`
- `DATA_DIR`：本地数据目录，默认 `./data`
- `AUTO_REFRESH`：是否启动后定时刷新，默认 `true`
- `INITIAL_REFRESH`：启动时无数据是否自动抓取，默认 `true`
- `SOURCE_CONCURRENCY`：并行抓取数据源数量，默认 `4`
- `MAX_BODY_BYTES`：API 请求体上限，默认 `1048576`
- `MUTATION_RATE_LIMIT`：每个客户端每分钟的写操作上限，默认 `30`
- `REQUIRE_AUTH` / `ADMIN_TOKEN`：启用 Bearer API 认证
- `VITE_ADMIN_TOKEN`：前端构建时使用的 Bearer Token，单用户部署使用
- `TWITTER_ENABLED`：是否启用 X/Twitter Recent Search
- `X_BEARER_TOKEN`：X API Bearer Token，启用 Twitter 源时必填
- `X_SEARCH_QUERY`：可选，直接指定 X Recent Search 查询；为空时使用 `TRACK_KEYWORDS` 组合
- `X_SEARCH_LANG`：可选，按语言过滤 X 结果，例如 `en` 或 `zh`
- `X_SEARCH_MAX_RESULTS`：X 单次抓取数量，范围 `10` 到 `100`，默认 `50`
- `X_SEARCH_QUERY_MAX_CHARS`：X 查询长度保护，默认 `512`，最高 `4096`
- `WEIBO_ENABLED`：是否启用微博热搜 RSS 源
- `WEIBO_MODE`：微博源模式，`auto`、`rsshub` 或 `direct`
- `RSSHUB_BASE_URL`：RSSHub 实例地址，默认 `https://rsshub.app`
- `WEIBO_RSS_URL`：自定义微博 RSS 地址，设置后优先于 `RSSHUB_BASE_URL`
- `GITHUB_TOKEN`：可选，GitHub Search API token，用于提升限流额度
- `REDDIT_USER_AGENT`：可选，Reddit JSON 请求的 User-Agent
- `TIKTOK_ENABLED` / `TIKTOK_RSS_URL`：可选，启用 TikTok RSS/RSSHub 数据源
- `INSTAGRAM_ENABLED` / `INSTAGRAM_RSS_URL`：可选，启用 Instagram RSS/RSSHub 数据源
- `HUGGINGFACE_RSS_URL`、`OPENAI_BLOG_RSS_URL`、`DEEPMIND_RSS_URL`、`ANTHROPIC_RSS_URL`：AI 官方博客类 RSS 数据源
- `GLASSNODE_API_KEY`：可选，Glassnode API Key
- `COINMARKETCAP_API_KEY`：可选，CoinMarketCap Pro API Key
- `WIKIPEDIA_LANGUAGE`：Wikipedia feed 语言，默认 `zh`
- `YOUTUBE_RSS_URL`：可选，YouTube 频道 RSS 地址
- `TELEGRAM_ENABLED`：是否启用 Telegram 真实推送
- `TELEGRAM_BOT_TOKEN`：Telegram Bot Token
- `TELEGRAM_CHAT_ID`：Telegram Chat ID
- `FEISHU_ENABLED`：是否启用飞书机器人推送
- `FEISHU_WEBHOOK_URL`：飞书自定义机器人 Webhook
- `FEISHU_SECRET`：飞书机器人签名密钥，可选

UI 设置中心里的配置会写入 `data/settings.json`。环境变量用于初始化默认值和无 UI 部署场景。勾选 X、微博、GitHub、Reddit、TikTok、Instagram、Glassnode、CoinMarketCap、YouTube 等需要参数的数据源时，设置中心会自动展开对应抓取参数表单。飞书机器人可在推送中心配置。

### X 日榜展示与接口

Dashboard 顶部的「X 日榜」支持直接查看明确标注的示例数据，无需 API 凭据。此功能提供 Dashboard、官方 API 适配和手动采集效果展示，不启动额外的后台采集任务。

实际使用时，在设置中心的「X 日榜接口」启用接口，分别填写三个范围的搜索查询，在「X / Twitter」填写使用者自己的 Bearer Token，然后保存设置。回到 X 日榜切换「实际数据」，点击「抓取该日数据」。该开关独立于原有 Twitter 热点数据源；不开启原有数据源也可手动获取日榜。读取页面和切换筛选只访问本地缓存，不消耗 X API 额度。

- 中文圈：在查询外附加 `lang:zh`，基于帖子语言，不代表用户国籍或地理位置。
- AI/Crypto：默认提供相关关键词查询，可自定义。
- 全球不限领域：不附加语言、地区或类别条件，使用者需填写关键词、话题标签或 `from:账号` 等有效搜索查询；普通 Recent Search 不等于全站数据流。
- 蓝 V 榜：按北京时间选定日期发布的采样帖子汇总累计浏览量，只包含 `verified_type=blue`。这不是账号当天新增流量，也不是独立访客数；缺失浏览量显示 `--`，不伪造为零。
- 圈层话题榜：从采样帖子提取 hashtag，不区分大小写，同一帖子在同一标签中去重，按帖子数排序。参与账号不限于蓝 V。
- 官方地区热榜：调用 WOEID 地区热榜接口，默认 `1` 为全球。该榜不按中文/AI/Crypto 范围筛选，只保存当前日期的最新快照；接口帖子量不解释为当日新增讨论量。
- 每次搜索最多读取设置指定的页数，达到上限会提示结果不完整；同日期同查询重复采集按帖子 ID 更新，不重复累加。修改查询后重新建立该范围的采样，失败时保留上次成功数据。
- 仅可新抓取 Recent Search 支持的最近 7 天，历史日期可查看已保存快照。快照写入 `data/twitter-rankings.json`，采集时清理超过 30 天的记录，单范围最多保存 5,000 条采样帖子。

官方接口可能计费，需要使用者自行配置具有相应权限和额度的 X 开发者应用。API 参数与权限以 [X 搜索文档](https://docs.x.com/x-api/posts/search/introduction)、[公开指标文档](https://docs.x.com/x-api/fundamentals/metrics) 和 [地区热榜文档](https://docs.x.com/x-api/trends/get-trends-by-woeid) 为准。

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
