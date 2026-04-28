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
