# Security Policy

## Supported Versions

The project is in early development. Security fixes target the latest `main` branch.

## Reporting a Vulnerability

Please report security issues privately to the project maintainer before public disclosure. If this repository is hosted on GitHub, use GitHub private vulnerability reporting when available.

Do not include real API tokens, Telegram bot tokens, private chat IDs, or scraped private data in public issues.

## Secret Handling

- Store secrets in `.env` or your deployment platform secret manager.
- Do not commit `data/settings.json` if it contains tokens.
- Telegram credentials are optional. Without them, push actions are simulated locally.

## Data Source Safety

This project is designed for public sources only. Do not add crawlers that bypass authentication, paywalls, robots restrictions, or access controls.
