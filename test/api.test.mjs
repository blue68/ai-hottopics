import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

const token = "test-admin-token";
let baseUrl;
let serverProcess;

async function freePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  probe.close();
  await once(probe, "close");
  return port;
}

async function request(path, options = {}) {
  const headers = {
    ...(options.auth === false ? {} : { authorization: `Bearer ${token}` }),
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await request("/api/health", { auth: false });
      if (response.ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

before(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = mkdtempSync(join(tmpdir(), "ai-hottopics-test-"));
  serverProcess = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      INITIAL_REFRESH: "false",
      AUTO_REFRESH: "false",
      REQUIRE_AUTH: "true",
      ADMIN_TOKEN: token,
    },
    stdio: "ignore",
  });
  await waitForHealth();
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill("SIGTERM");
  await once(serverProcess, "exit");
});

test("health is public but protected API endpoints require authentication", async () => {
  const health = await request("/api/health", { auth: false });
  assert.equal(health.status, 200);
  const settings = await request("/api/settings", { auth: false });
  assert.equal(settings.status, 401);
});

test("static assets include baseline security headers", async () => {
  const response = await request("/", { auth: false });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("settings are normalized at the API boundary", async () => {
  const response = await request("/api/settings", {
    method: "POST",
    body: JSON.stringify({ refreshIntervalMinutes: 0, heatThreshold: 999, sources: { github: "false" } }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.settings.refreshIntervalMinutes, 1);
  assert.equal(payload.settings.heatThreshold, 100);
  assert.equal(payload.settings.sources.github, false);

  const secretResponse = await request("/api/settings", {
    method: "POST",
    body: JSON.stringify({ telegram: { botToken: "real-secret-token" } }),
  });
  assert.equal(secretResponse.status, 200);
  const secretPayload = await secretResponse.json();
  assert.equal(secretPayload.settings.telegram.botToken, "********");
  const visible = await request("/api/settings");
  const visiblePayload = await visible.json();
  assert.equal(visiblePayload.settings.telegram.botToken, "********");

  const roundTrip = await request("/api/settings", {
    method: "POST",
    body: JSON.stringify(visiblePayload.settings),
  });
  assert.equal(roundTrip.status, 200);
  const afterRoundTrip = await request("/api/settings");
  const afterRoundTripPayload = await afterRoundTrip.json();
  assert.equal(afterRoundTripPayload.settings.telegram.botToken, "********");
});

test("malformed and unsafe mutations are rejected", async () => {
  const malformed = await request("/api/assets", { method: "POST", body: "{" });
  assert.equal(malformed.status, 400);

  const invalidTarget = await request("/api/push/send", {
    method: "POST",
    body: JSON.stringify({ text: "hello", target: "unknown" }),
  });
  assert.equal(invalidTarget.status, 400);

  const emptyText = await request("/api/push/send", {
    method: "POST",
    body: JSON.stringify({ text: "", target: "local" }),
  });
  assert.equal(emptyText.status, 400);
});

test("refresh blocks private source endpoints", async () => {
  const current = await request("/api/settings");
  const currentPayload = await current.json();
  const sources = Object.fromEntries(Object.keys(currentPayload.settings.sources).map((key) => [key, false]));
  sources.coinMarketCap = true;
  const save = await request("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      sources,
      sourceConfig: { coinMarketCap: { apiKey: "test-key", endpoint: "http://127.0.0.1:9/internal" } },
    }),
  });
  assert.equal(save.status, 200);
  const refresh = await request("/api/refresh", { method: "POST" });
  assert.equal(refresh.status, 200);
  const refreshPayload = await refresh.json();
  const source = refreshPayload.jobs[0].sources.find((item) => item.name === "CoinMarketCap");
  assert.match(source.error, /Private external/);
});

test("empty content generation returns a useful client error", async () => {
  const response = await request("/api/content/generate", {
    method: "POST",
    body: JSON.stringify({ mode: "快讯版" }),
  });
  assert.equal(response.status, 400);
});

test("X ranking preview, cached data and disabled refresh work without external requests", async () => {
  const protectedResponse = await request("/api/twitter/rankings?mode=demo", { auth: false });
  assert.equal(protectedResponse.status, 401);
  const demo = await request("/api/twitter/rankings?mode=demo&scope=chinese");
  assert.equal(demo.status, 200);
  const preview = await demo.json();
  assert.equal(preview.mode, "demo");
  assert.equal(preview.accounts.length, 5);
  assert.equal(preview.timezone, "Asia/Shanghai");
  const cached = await request("/api/twitter/rankings?mode=live&scope=global");
  assert.deepEqual((await cached.json()).accounts, []);
  const disabled = await request("/api/twitter/rankings/refresh", { method: "POST", body: JSON.stringify({ scope: "global" }) });
  assert.equal(disabled.status, 400);
  assert.match((await disabled.json()).error, /启用/);
  assert.equal((await request("/api/twitter/rankings?scope=invalid")).status, 400);
  assert.equal((await request("/api/twitter/rankings?date=2026-02-30")).status, 400);
  assert.equal((await request("/api/twitter/rankings?mode=invalid")).status, 400);
});

test("ranking settings preserve query scopes on partial updates and redact shared credentials", async () => {
  const save = await request("/api/settings", { method: "POST", body: JSON.stringify({ twitterRankings: { enabled: true, maxPages: 99, queries: { chinese: "科技" } }, sourceConfig: { twitter: { bearerToken: "test-x-secret" } } }) });
  const first = (await save.json()).settings;
  assert.equal(first.twitterRankings.maxPages, 10);
  assert.equal(first.twitterRankings.queries.chinese, "科技");
  assert.equal(first.sourceConfig.twitter.bearerToken, "********");
  const update = await request("/api/settings", { method: "POST", body: JSON.stringify({ twitterRankings: { queries: { global: "news" } } }) });
  const second = (await update.json()).settings;
  assert.equal(second.twitterRankings.queries.chinese, "科技");
  assert.equal(second.twitterRankings.queries.global, "news");
  const future = await request("/api/twitter/rankings/refresh", { method: "POST", body: JSON.stringify({ scope: "global", date: "2099-01-01" }) });
  assert.equal(future.status, 400);
  assert.match((await future.json()).error, /尚无可抓取/);
});
