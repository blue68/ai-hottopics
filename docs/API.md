# API

Base URL in development: `http://localhost:8787`.

All endpoints return JSON.

## Health

```http
GET /api/health
```

Returns service status, last refresh time, and topic count.

## Topics

```http
GET /api/topics?platform=全部&category=全部&region=全球&q=
```

Returns filtered topics, stats, and `lastRefreshAt`.

Query parameters:

- `platform`: platform name or `全部`
- `category`: category name or `全部`
- `region`: region name or `全球`
- `q`: keyword search

## Refresh

```http
POST /api/refresh
```

Runs all enabled crawlers. Source failures are captured in jobs and do not fail the whole refresh unless the server itself errors.

## Keyword Radar

```http
GET /api/radar
```

Returns aggregated keywords with count, average heat, risk score, and related topic titles.

## Analytics

```http
GET /api/analytics
```

Returns category, platform, risk, and timeline aggregates.

## Jobs

```http
GET /api/jobs
```

Returns recent crawler jobs and source-level statuses.

## Settings

```http
GET /api/settings
POST /api/settings
```

Settings include:

- `refreshIntervalMinutes`
- `heatThreshold`
- `sources`
- `sourceConfig`
- `keywords`
- `blockedWords`
- `telegram`
- `feishu`

`sources` can include:

- `twitter`
- `weibo`
- `hackerNews`
- `arxiv`
- `googleNews`
- `github`
- `reddit`
- `coingecko`

`sourceConfig` can include crawler parameters for configurable sources:

- `twitter`: `bearerToken`, `query`, `lang`, `maxResults`, `queryMaxChars`
- `weibo`: `mode`, `rsshubBaseUrl`, `rssUrl`
- `github`: `token`
- `reddit`: `userAgent`

## Assets

```http
GET /api/assets
POST /api/assets
```

Creates and lists local persona/template/material records.

POST body:

```json
{
  "type": "内容模板",
  "name": "AI 快讯模板",
  "description": "适合高热 AI 事件",
  "tags": ["AI", "快讯"]
}
```

## Content Generation

```http
POST /api/content/generate
```

POST body:

```json
{
  "topicId": "topic-id",
  "mode": "快讯版",
  "assetId": "optional-asset-id"
}
```

Supported modes:

- `快讯版`
- `锐评版`
- `Thread版`
- `Meme版`
- `带节奏版`

## Push

```http
GET /api/push/log
POST /api/push/send
```

POST body:

```json
{
  "text": "message",
  "target": "local"
}
```

Supported `target` values:

- `local`
- `telegram`
- `feishu`

`local` records a simulated push. `telegram` and `feishu` send real messages when their settings are configured.
