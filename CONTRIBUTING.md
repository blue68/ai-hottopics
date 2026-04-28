# Contributing

Thanks for considering a contribution.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Before opening a pull request:

```bash
npm run check
npm run build
```

If an API server is running, also run:

```bash
npm run smoke
```

## Pull Request Guidelines

- Keep changes scoped. Separate UI, crawler, scoring, and documentation changes when possible.
- Do not commit `data/`, `dist/`, `node_modules/`, screenshots, tokens, or local caches.
- Add or update docs when changing API behavior, data sources, configuration, or deployment flow.
- Treat generated content as draft output. Avoid positioning generated copy as verified fact.
- Respect public data source rate limits and terms of service.

## Adding a Data Source

1. Add a crawler function in `server/index.js`.
2. Normalize records through the same topic shape used by `normalizeTopic`.
3. Add a source flag to default settings and `.env.example` if it needs configuration.
4. Record failures in task output instead of throwing through the whole refresh.
5. Document the source in `docs/DATA_SOURCES.md`.

## Commit Style

Use short, descriptive commits, for example:

```text
feat: add arxiv crawler
fix: prevent stale HN stories from ranking
docs: document telegram setup
```
