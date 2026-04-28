# Data Sources

The project only targets public sources and does not bypass authentication or access controls.

## Enabled Sources

| Source | Purpose | Notes |
| --- | --- | --- |
| Hacker News Algolia API | Technology and AI trend discovery | Uses recent stories and keyword searches with a time window |
| GitHub Search API | Newly active AI and agent repositories | Unauthenticated requests are rate-limited by GitHub |
| arXiv API | Recent AI, LLM, agent, and robotics papers | XML Atom feed parsed locally |
| Google News RSS | News topic discovery | May fail or be blocked in some networks |
| Reddit JSON | Community discussion discovery | May fail or be blocked in some networks |
| CoinGecko Trending | Crypto topic discovery | May be rate-limited |

## Failure Handling

Each source is isolated. A failed source is recorded in the latest job with:

- source name
- status
- elapsed time
- error message

Other sources can still succeed in the same refresh.

## Rate Limits

Public APIs may reject frequent requests. Keep `REFRESH_INTERVAL_MINUTES` conservative for production use. The default is `10`.

## Adding Sources

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-data-source).
