import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateRankings, beijingDate, collectRankings, dayWindow, defaultRankingConfig, demoRankings, normalizeRankingConfig, rankingQuery, rankingView } from "../server/twitter-rankings.js";

const now = new Date("2026-10-24T10:00:00Z");
const config = normalizeRankingConfig({ ...defaultRankingConfig, enabled: true, queries: { chinese: "科技 OR 生活", aicrypto: "AI OR Bitcoin", global: "news OR sports" } });
function page(id = "post-1", impressionCount = 100) {
  return {
    data: [{ id, author_id: "blue-1", text: "AI news #AI #ai", lang: "zh", created_at: "2026-10-24T01:00:00Z", public_metrics: { impression_count: impressionCount, like_count: 10, retweet_count: 2, reply_count: 1, quote_count: 1 }, entities: { hashtags: [{ tag: "AI" }, { tag: "ai" }] } }],
    includes: { users: [{ id: "blue-1", name: "Sample", username: "sample", verified_type: "blue", public_metrics: { followers_count: 1000 } }] },
    meta: { result_count: 1 },
  };
}
async function collect(overrides = {}) {
  return collectRankings({ config, scope: "chinese", date: "2026-10-24", token: "test-token", queryMaxChars: 512, now, request: async (url) => url.includes("/trends/") ? { data: [{ trend_name: "#AI", tweet_count: 500 }] } : page(), ...overrides });
}

test("Beijing date boundaries and query restrictions are explicit", () => {
  assert.equal(beijingDate("2026-10-23T16:00:00Z"), "2026-10-24");
  const { start, end } = dayWindow("2026-10-23", now);
  assert.equal(start.toISOString(), "2026-10-22T16:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-23T16:00:00.000Z");
  assert.throws(() => dayWindow("2026-02-30"), /日期无效/);
  assert.match(rankingQuery(config, "chinese"), /lang:zh/);
  assert.doesNotMatch(rankingQuery(config, "global"), /lang:/);
  assert.throws(() => rankingQuery(defaultRankingConfig, "global"), /搜索查询/);
  assert.throws(() => rankingQuery(config, "global", 5), /字符限制/);
  assert.equal(normalizeRankingConfig({ maxPages: 900, maxResults: -1 }).maxPages, 10);
  assert.equal(normalizeRankingConfig({ maxPages: 900, maxResults: -1 }).maxResults, 10);
});

test("official requests use date windows, author verification, pagination and bounded samples", async () => {
  const requests = [];
  const result = await collect({ request: async (url, options) => {
    const parsed = new URL(url);
    requests.push(parsed);
    assert.equal(options.headers.authorization, "Bearer test-token");
    if (parsed.pathname.includes("/trends/")) return { data: [{ trend_name: "#AI" }] };
    assert.equal(parsed.origin, "https://api.x.com");
    assert.equal(parsed.searchParams.get("start_time"), "2026-10-23T16:00:00.000Z");
    assert.match(parsed.searchParams.get("user.fields"), /verified_type/);
    assert.match(parsed.searchParams.get("tweet.fields"), /entities/);
    const response = page(parsed.searchParams.has("next_token") ? "post-2" : "post-1");
    response.meta.next_token = "next-page";
    return response;
  } });
  assert.equal(requests.length, 3);
  assert.equal(result.bucket.pages, 2);
  assert.equal(result.bucket.truncated, true);
  const view = rankingView(result.bucket);
  assert.equal(view.accounts[0].impressions, 200);
  assert.equal(view.accounts[0].engagements, 28);
  assert.equal(view.topics[0].postCount, 2);
  assert.equal(view.officialTrends[0].tweetCount, null);
});

test("repeated collection updates IDs without double counting; changed queries isolate samples", async () => {
  const first = await collect();
  const second = await collect({ previous: first.bucket, request: async (url) => url.includes("/trends/") ? { data: [] } : page("post-1", 250) });
  assert.equal(rankingView(second.bucket).sampledPosts, 1);
  assert.equal(rankingView(second.bucket).accounts[0].impressions, 250);
  const changed = await collect({ previous: second.bucket, config: { ...config, queries: { ...config.queries, chinese: "新查询" } }, request: async (url) => url.includes("/trends/") ? { data: [] } : page("post-new", 50) });
  assert.equal(rankingView(changed.bucket).sampledPosts, 1);
  assert.equal(rankingView(changed.bucket).accounts[0].impressions, 50);
});

test("blue is distinct from other verification, missing impressions stay unknown and tags deduplicate", async () => {
  const result = await collect();
  const post = result.bucket.posts[0];
  const view = aggregateRankings([
    { ...post, id: "missing", impressions: null },
    { ...post, id: "business-post", author: { ...post.author, id: "business", verifiedType: "business" } },
    { ...post, id: "unknown-post", author: { ...post.author, id: "unknown", verifiedType: "unknown" } },
  ]);
  assert.equal(view.accounts.length, 1);
  assert.equal(view.accounts[0].impressions, null);
  assert.equal(view.accounts[0].missingImpressions, 1);
  assert.equal(view.topics.length, 1);
  assert.equal(view.topics[0].postCount, 3);
  assert.equal(view.topics[0].authorCount, 3);
});

test("failed pages preserve the last snapshot and trends failures do not discard search results", async () => {
  const first = await collect();
  let searches = 0;
  const result = await collect({ previous: first.bucket, request: async (url) => {
    if (url.includes("/trends/")) throw new Error("403 Forbidden");
    searches += 1;
    if (searches === 2) throw new Error("429 Too Many Requests");
    const response = page("new-uncommitted-post", 999);
    response.meta.next_token = "next";
    return response;
  } });
  assert.equal(result.ok, false);
  assert.equal(result.bucket.errors.length, 2);
  assert.equal(result.bucket.posts[0].id, "post-1");
  const independent = await collect({ request: async (url) => {
    if (url.includes("/trends/")) throw new Error("403 Forbidden");
    return page();
  } });
  assert.equal(independent.searchSucceeded, true);
  assert.equal(rankingView(independent.bucket).accounts.length, 1);
});

test("historical collections never write current official trends to a past date", async () => {
  let trendsCalled = false;
  const result = await collect({ date: "2026-10-23", request: async (url) => {
    if (url.includes("/trends/")) trendsCalled = true;
    return { data: [], meta: { result_count: 0 } };
  } });
  assert.equal(trendsCalled, false);
  assert.equal(result.bucket.trendsAt, undefined);
  await assert.rejects(collect({ date: "2026-10-10" }), /最近 7 天/);
});

test("Chinese collection excludes other languages and reshares even if returned by API", async () => {
  const result = await collect({ request: async (url) => {
    if (url.includes("/trends/")) return { data: [] };
    const response = page();
    response.data.push({ ...response.data[0], id: "english", lang: "en" }, { ...response.data[0], id: "reshare", referenced_tweets: [{ type: "retweeted" }] });
    return response;
  } });
  assert.equal(rankingView(result.bucket).sampledPosts, 1);
});

test("preview fixtures differ across scopes and never contain invented outbound account URLs", () => {
  const chinese = demoRankings("chinese", "2026-10-24");
  const global = demoRankings("global", "2026-10-24");
  assert.notEqual(chinese.accounts[0].name, global.accounts[0].name);
  assert.ok(chinese.accounts.every((account) => !account.topPost.url));
  assert.equal(rankingView().accounts.length, 0);
});
