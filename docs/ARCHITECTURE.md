# Architecture

AI HotTopics is intentionally small and self-contained.

## Runtime

```text
React UI -> Vite dev proxy or Node static server -> Node API -> public data sources
                                                     -> local JSON store
```

## Backend

`server/index.js` contains:

- configuration loading
- local JSON persistence
- crawler functions
- normalization and scoring
- keyword extraction
- content template generation
- push delivery
- HTTP API and static file serving

The current implementation avoids a database to keep local setup simple. The persisted files live in `data/` by default:

- `state.json`: topics, jobs, stats, refresh timestamps
- `settings.json`: user settings and source switches
- `assets.json`: persona/template/material library
- `push-log.json`: simulated or real push history

## Frontend

`src/App.tsx` is a React workbench with these sections:

- Dashboard
- Hot list
- Keyword radar
- Content factory
- Push center
- Account assets
- Tasks and monitoring
- Analytics
- Settings

The frontend does not hard-code topic data. It reads from `/api/*`.

## Scoring Model

The heat score combines:

- recency
- source weight
- engagement score
- normalized topic metadata

This is a rule-based model, not a predictive ML model. It is meant to be inspectable and easy to tune.

## Extension Points

- Add a crawler function and register it in `sourceTasks`.
- Adjust `categoryFor`, `riskFor`, `sentimentFor`, and `heatScore` to fit your niche.
- Replace JSON persistence with SQLite/PostgreSQL when multi-user or long-term history is needed.
- Replace template generation with an LLM API if you want higher-quality copy generation.
