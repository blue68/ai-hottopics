# Data Sources

The project only targets public sources and does not bypass authentication or access controls.

## Enabled Sources

| Source | Purpose | Notes |
| --- | --- | --- |
| X API v2 Recent Search | X/Twitter topic discovery | Requires `X_BEARER_TOKEN`; disabled by default unless configured |
| Weibo Hot Search | Weibo hot-search tracking | `WEIBO_MODE=auto` tries RSSHub first, then a public Weibo hot-search JSON endpoint without cookies |
| Hacker News Algolia API | Technology and AI trend discovery | Uses recent stories and keyword searches with a time window |
| GitHub Search API | Newly active AI and agent repositories | Unauthenticated requests are rate-limited by GitHub |
| arXiv API | Recent AI, LLM, agent, and robotics papers | XML Atom feed parsed locally |
| Google News RSS | News topic discovery | May fail or be blocked in some networks |
| Reddit JSON | Community discussion discovery | May fail or be blocked in some networks |
| CoinGecko Trending | Crypto topic discovery | May be rate-limited |
| TikTok RSS | Short-video trend discovery | Requires a configured public RSS/RSSHub route |
| Instagram RSS | Instagram post/reel discovery | Requires a configured public RSS/RSSHub route |
| Hugging Face Blog RSS | AI model and platform updates | Official/blog RSS route, configurable |
| OpenAI News RSS | OpenAI product and research updates | Official/news RSS route, configurable |
| Google DeepMind Blog RSS | DeepMind research and product updates | Official/blog RSS route, configurable |
| Anthropic News RSS | Anthropic product and research updates | Official/news RSS route, configurable |
| Glassnode API | Crypto market metrics | Requires `GLASSNODE_API_KEY` |
| CoinMarketCap API | Crypto trending assets | Requires `COINMARKETCAP_API_KEY` |
| Wikipedia Featured Feed | Life/knowledge trend discovery | Uses Wikimedia featured feed API |
| YouTube RSS | Channel/video trend discovery | Requires a configured channel RSS URL |

## Failure Handling

Each source is isolated. A failed source is recorded in the latest job with:

- source name
- status
- elapsed time
- error message

Other sources can still succeed in the same refresh.

## Rate Limits

Public APIs may reject frequent requests. Keep `REFRESH_INTERVAL_MINUTES` conservative for production use. The default is `10`.

X/Twitter requires an official API Bearer Token. If `TWITTER_ENABLED=true` but no token is configured, the source fails safely and the job log records `X_BEARER_TOKEN is not configured`.

By default, the X source joins `TRACK_KEYWORDS` with `OR` and excludes retweets. You can override the generated query with `X_SEARCH_QUERY`, add a language filter with `X_SEARCH_LANG`, tune `X_SEARCH_MAX_RESULTS` between `10` and `100`, and raise `X_SEARCH_QUERY_MAX_CHARS` up to `4096` when your X API access tier supports longer queries.

The UI settings page can store the same source-specific crawler parameters in `data/settings.json`. When a configurable source is enabled, the UI displays its fields:

- X/Twitter: Bearer Token, query, language, result count, query length guard
- Weibo: mode, RSSHub base URL, custom RSS route
- GitHub: optional token
- Reddit: User-Agent
- TikTok: public RSS/RSSHub route and source name
- Instagram: public RSS/RSSHub route and source name
- AI official sources: RSS route and source name
- Glassnode: API key, asset, metric, interval
- CoinMarketCap: API key and endpoint
- Wikipedia: language and source name
- YouTube: channel RSS route and source name

TikTok and Instagram integrations intentionally use configurable public RSS routes. They do not bypass login, private account access controls, anti-bot protections, or platform restrictions.

For Weibo, `WEIBO_MODE=auto` tries an RSSHub-compatible RSS route first. If RSSHub is unavailable, it falls back to Weibo's public hot-search JSON endpoint without cookies. For production use, prefer a self-hosted RSSHub instance and set:

```bash
WEIBO_MODE=rsshub
RSSHUB_BASE_URL=https://your-rsshub.example.com
```

Or set a complete route:

```bash
WEIBO_MODE=rsshub
WEIBO_RSS_URL=https://your-rsshub.example.com/weibo/search/hot
```

## Adding Sources

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-data-source).
