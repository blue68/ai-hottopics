# Deployment

## Local Production Mode

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Open `http://localhost:8787`.

## Environment Variables

See `.env.example` for all options.

Minimum useful production values:

```bash
PORT=8787
DATA_DIR=/var/lib/ai-hottopics
AUTO_REFRESH=true
INITIAL_REFRESH=true
REFRESH_INTERVAL_MINUTES=10
```

Telegram:

```bash
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456:xxx
TELEGRAM_CHAT_ID=123456789
```

Feishu bot:

```bash
FEISHU_ENABLED=true
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
FEISHU_SECRET=optional_signing_secret
```

X/Twitter:

```bash
TWITTER_ENABLED=true
X_BEARER_TOKEN=your_x_api_bearer_token
# optional:
X_SEARCH_QUERY='(OpenAI OR "large language model" OR agent) -is:retweet'
X_SEARCH_LANG=en
X_SEARCH_MAX_RESULTS=50
X_SEARCH_QUERY_MAX_CHARS=512
```

These values can also be configured from Settings -> 数据源参数. UI-saved values are persisted in `data/settings.json` and take precedence over `.env` for crawler execution.

Weibo via RSSHub:

```bash
WEIBO_ENABLED=true
WEIBO_MODE=auto
RSSHUB_BASE_URL=https://your-rsshub.example.com
# or
WEIBO_RSS_URL=https://your-rsshub.example.com/weibo/search/hot
```

Optional API tuning:

```bash
GITHUB_TOKEN=github_pat_xxx
REDDIT_USER_AGENT=ai-hottopics/0.1 (+local research dashboard)
```

## Docker Notes

There is no Dockerfile yet. If you add one, persist `DATA_DIR` as a volume and run:

```bash
npm ci
npm run build
npm start
```

## Reverse Proxy

The Node server serves both API and frontend in production. A reverse proxy only needs to route all requests to the same port.

## Operational Notes

- Monitor `/api/health`.
- Check `/api/jobs` for source failures and rate-limit issues.
- Do not expose Telegram tokens in logs or public issue reports.
