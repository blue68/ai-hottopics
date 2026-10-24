# Changelog

## Unreleased

- Unified the workspace, navigation, forms and rankings with graphite surfaces and electric-blue accents, retaining distinct data-series colors.
- Fixed oversized settings checkboxes, compacted data-source rows, restored section padding and improved responsive settings fields.
- Aligned Dashboard statistic labels and icons, inset metric values and separated the summary from the charts with consistent spacing.
- Added interactive Recharts visualizations for X account performance, ranked-account traffic share, topic participation, platform distribution and category heat. Charts follow the selected data source and omit unavailable metrics.
- Refined the workspace with a graphite theme, consistent spacing and typography, compact navigation, account avatars and inline data bars, and responsive mobile navigation. Chart code loads separately from the application shell.
- Added an X daily-ranking Dashboard with Chinese, AI/Crypto, and global scope switches, explicitly labeled preview fixtures and cached live data.
- Added opt-in manual official X API adapters, shared redacted credentials, per-scope queries, pagination limits, blue-verified author aggregation, hashtag rankings, and WOEID trend snapshots.
- Added persisted daily samples, date selection, missing-metric and partial-data states, and ranking API/aggregation tests. No additional background collection is enabled.
- Added X/Twitter and Weibo data-source integration, with configurable source parameters in the settings UI.
- Fixed dashboard platform and region filters so enabled platforms remain visible and regional results update correctly.
- Connected account assets to the content factory so saved personas/templates can be applied to generated copy.
- Added channel-aware push flows for local records, Telegram, and Feishu bot webhooks.
- Added Feishu bot configuration, content copy actions, push-channel selection, and working header notification/help actions.
- Added configurable TikTok and Instagram RSS/RSSHub data sources.
- Added AI, Crypto, and lifestyle source integrations for Hugging Face, OpenAI Blog, Google DeepMind, Anthropic, Glassnode, CoinMarketCap, Wikipedia, and YouTube.

## 0.1.0

- Initial open-source release.
- React dashboard with multi-page workflow.
- Node.js API with public-source crawlers.
- Hot topic scoring, keyword radar, content templates, push log, assets, tasks, analytics, and settings.
