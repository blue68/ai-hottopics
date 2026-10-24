export const rankingScopes = ["chinese", "aicrypto", "global"];

export const defaultRankingConfig = {
  enabled: false,
  accountsEnabled: true,
  topicsEnabled: true,
  maxPages: 2,
  maxResults: 100,
  woeid: 1,
  queries: {
    chinese: "",
    aicrypto: "AI OR OpenAI OR Anthropic OR Bitcoin OR Ethereum OR crypto",
    global: "",
  },
};

export function normalizeRankingConfig(input = {}) {
  const flag = (key) => input[key] === undefined ? defaultRankingConfig[key] : input[key] === true || input[key] === "true";
  const integer = (key, min, max) => {
    const value = Number(input[key] ?? defaultRankingConfig[key]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : defaultRankingConfig[key];
  };
  return {
    enabled: flag("enabled"),
    accountsEnabled: flag("accountsEnabled"),
    topicsEnabled: flag("topicsEnabled"),
    maxPages: integer("maxPages", 1, 10),
    maxResults: integer("maxResults", 10, 100),
    woeid: integer("woeid", 1, 2147483647),
    queries: Object.fromEntries(rankingScopes.map((scope) => [scope, String(input.queries?.[scope] ?? defaultRankingConfig.queries[scope]).trim().slice(0, 4096)])),
  };
}

export function beijingDate(value = new Date()) {
  return new Date(new Date(value).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function dayWindow(date, now = new Date()) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式应为 YYYY-MM-DD");
  const start = new Date(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start.getTime()) || beijingDate(start) !== date) throw new Error("日期无效");
  const end = new Date(Math.min(start.getTime() + 86400_000, new Date(now).getTime() - 10_000));
  return { start, end };
}

export function rankingQuery(config, scope, maxChars = 512) {
  if (!rankingScopes.includes(scope)) throw new Error("未知的 X 榜单范围");
  const base = config.queries[scope].trim();
  if (!base) throw new Error("请先在设置中心填写该范围的搜索查询，包含关键词、话题标签或 from:账号");
  const query = `(${base})${scope === "chinese" ? " lang:zh" : ""} -is:retweet`;
  if (query.length > maxChars) throw new Error(`榜单查询超过 ${maxChars} 字符限制`);
  return query;
}

const metric = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
const impressions = (rows) => rows.some((row) => row.impressions !== null) ? sum(rows, "impressions") : null;
const order = (a, b) => (b.impressions ?? -1) - (a.impressions ?? -1) || b.engagements - a.engagements;

export function aggregateRankings(posts) {
  const authors = new Map();
  const tags = new Map();
  for (const post of posts) {
    if (post.author.verifiedType === "blue") {
      const group = authors.get(post.author.id) || [];
      group.push(post);
      authors.set(post.author.id, group);
    }
    for (const name of new Set(post.hashtags.map((tag) => tag.toLowerCase()))) {
      const group = tags.get(name) || [];
      group.push(post);
      tags.set(name, group);
    }
  }
  const accounts = [...authors.values()].map((rows) => {
    const best = [...rows].sort(order)[0];
    return {
      ...rows.at(-1).author,
      impressions: impressions(rows),
      missingImpressions: rows.filter((row) => row.impressions === null).length,
      engagements: sum(rows, "engagements"),
      likes: sum(rows, "likes"),
      reposts: sum(rows, "reposts"),
      replies: sum(rows, "replies"),
      postCount: rows.length,
      topPost: { text: best.text, url: best.url },
    };
  }).sort(order).slice(0, 50);
  const topics = [...tags.entries()].map(([name, rows]) => ({
    name: `#${name}`,
    postCount: rows.length,
    authorCount: new Set(rows.map((row) => row.author.id)).size,
    impressions: impressions(rows),
    missingImpressions: rows.filter((row) => row.impressions === null).length,
    engagements: sum(rows, "engagements"),
    url: `https://x.com/search?q=${encodeURIComponent(`#${name}`)}`,
  })).sort((a, b) => b.postCount - a.postCount || order(a, b)).slice(0, 50);
  return { accounts, topics, sampledPosts: posts.length, sampledAuthors: new Set(posts.map((post) => post.author.id)).size };
}

export async function collectRankings({ config, scope, date, token, queryMaxChars, previous, request, now = new Date() }) {
  const { start, end } = dayWindow(date, now);
  if (start >= end) throw new Error("该日期尚无可抓取的时间范围");
  if (start.getTime() < new Date(now).getTime() - 7 * 86400_000) throw new Error("Recent Search 仅支持最近 7 天；更早日期可查看已保存结果");
  const query = rankingQuery(config, scope, queryMaxChars);
  const fetchedAt = new Date(now).toISOString();
  const headers = { authorization: `Bearer ${token}` };
  const errors = [];
  const bucket = structuredClone(previous || {});
  let searchSucceeded = false;
  if (config.accountsEnabled || config.topicsEnabled) {
    try {
      const collected = new Map(bucket.query === query ? (bucket.posts || []).map((post) => [post.id, post]) : []);
      let nextToken;
      let pages = 0;
      let received = 0;
      do {
        const params = new URLSearchParams({
          query,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          max_results: String(config.maxResults),
          sort_order: "recency",
          "tweet.fields": "created_at,public_metrics,lang,author_id,entities,referenced_tweets",
          expansions: "author_id",
          "user.fields": "name,username,verified_type,public_metrics,profile_image_url",
          ...(nextToken ? { next_token: nextToken } : {}),
        });
        const response = await request(`https://api.x.com/2/tweets/search/recent?${params}`, { headers });
        if (response.errors?.length) throw new Error("X 搜索返回部分错误，原榜单已保留");
        if (!Array.isArray(response.data) && response.meta?.result_count !== 0) throw new Error("X 搜索响应格式无效");
        const users = new Map((response.includes?.users || []).map((user) => [user.id, user]));
        for (const tweet of response.data || []) {
          const author = users.get(tweet.author_id);
          if (!author || !tweet.id || !tweet.created_at) continue;
          if (new Date(tweet.created_at) < start || new Date(tweet.created_at) >= end) continue;
          if (scope === "chinese" && tweet.lang !== "zh") continue;
          if (tweet.referenced_tweets?.some((reference) => reference.type === "retweeted")) continue;
          const metrics = tweet.public_metrics || {};
          const likes = metric(metrics.like_count) ?? 0;
          const reposts = metric(metrics.retweet_count) ?? 0;
          const replies = metric(metrics.reply_count) ?? 0;
          const quotes = metric(metrics.quote_count) ?? 0;
          collected.set(tweet.id, {
            id: tweet.id,
            text: String(tweet.text || ""),
            url: `https://x.com/${author.username}/status/${tweet.id}`,
            createdAt: tweet.created_at,
            author: { id: author.id, name: author.name, username: author.username, verifiedType: author.verified_type || "unknown", followers: metric(author.public_metrics?.followers_count) },
            hashtags: (tweet.entities?.hashtags || []).map((tag) => String(tag.tag)).filter(Boolean),
            impressions: metric(metrics.impression_count),
            likes, reposts, replies,
            engagements: likes + reposts + replies + quotes,
          });
          received += 1;
        }
        pages += 1;
        nextToken = response.meta?.next_token;
      } while (nextToken && pages < config.maxPages);
      bucket.posts = [...collected.values()].slice(-5000);
      bucket.query = query;
      bucket.searchAt = fetchedAt;
      bucket.truncated = Boolean(nextToken) || collected.size > 5000;
      bucket.pages = pages;
      bucket.received = received;
      searchSucceeded = true;
    } catch (error) {
      // Keep the last successful snapshot if an API request or a later page fails.
      errors.push({ source: "search", message: String(error.message || error).slice(0, 300) });
    }
  }
  if (config.topicsEnabled) {
    if (date === beijingDate(now)) {
      try {
        const params = new URLSearchParams({ max_trends: "50", "trend.fields": "trend_name,tweet_count" });
        const response = await request(`https://api.x.com/2/trends/by/woeid/${config.woeid}?${params}`, { headers });
        if (response.errors?.length || !Array.isArray(response.data)) throw new Error("X 地区热榜响应无效或权限不足");
        bucket.officialTrends = response.data.map((trend, index) => ({
          name: trend.trend_name,
          tweetCount: metric(trend.tweet_count),
          rank: index + 1,
          url: `https://x.com/search?q=${encodeURIComponent(trend.trend_name)}`,
        }));
        bucket.trendsAt = fetchedAt;
        bucket.woeid = config.woeid;
      } catch (error) {
        errors.push({ source: "trends", message: String(error.message || error).slice(0, 300) });
      }
    }
    // The official endpoint is current-only; never relabel today's trends as historical data.
  }
  bucket.errors = errors;
  bucket.lastAttemptAt = fetchedAt;
  return { bucket, ok: errors.length === 0, searchSucceeded };
}

export function rankingView(bucket = {}) {
  return {
    ...aggregateRankings(bucket.posts || []),
    officialTrends: bucket.officialTrends || [],
    searchAt: bucket.searchAt || null,
    trendsAt: bucket.trendsAt || null,
    lastAttemptAt: bucket.lastAttemptAt || null,
    query: bucket.query || "",
    woeid: bucket.woeid || null,
    truncated: Boolean(bucket.truncated),
    errors: bucket.errors || [],
  };
}

export function demoRankings(scope, date) {
  const names = {
    chinese: ["科技观察站", "城市生活志", "中文创作笔记", "数码新视角", "每日阅读室"],
    aicrypto: ["AI Research Notes", "Onchain Observer", "Agent Journal", "模型观察室", "Crypto Lab"],
    global: ["World Dispatch", "Science Notebook", "Culture Review", "Sports Journal", "Daily Lens"],
  }[scope];
  const tags = { chinese: ["科技日常", "城市生活", "中文创作", "数码新品", "周末计划"], aicrypto: ["AI", "Bitcoin", "Agents", "Ethereum", "OpenSource"], global: ["Science", "WorldNews", "Sports", "Music", "Travel"] }[scope];
  const accounts = names.map((name, index) => ({
    id: `demo-${scope}-${index}`, name, username: `demo_${scope}_${index + 1}`, verifiedType: "blue", followers: 180000 - index * 23000,
    impressions: 1260000 - index * 197000, missingImpressions: 0, engagements: 28000 - index * 4200,
    likes: 16000 - index * 2000, reposts: 6000 - index * 800, replies: 3000 - index * 500, postCount: 12 - index,
    topPost: { text: `${name} · ${date} 示例内容`, url: "" },
  }));
  const topics = tags.map((name, index) => ({ name: `#${name}`, postCount: 156 - index * 23, authorCount: 120 - index * 17, impressions: 3120000 - index * 430000, missingImpressions: 0, engagements: 72000 - index * 8000, url: "" }));
  return { accounts, topics, officialTrends: tags.map((name, index) => ({ name: `#${name}`, rank: index + 1, tweetCount: 42000 - index * 6100, url: "" })), sampledPosts: 800, sampledAuthors: 320, searchAt: null, trendsAt: null, lastAttemptAt: null, query: "", woeid: 1, truncated: false, errors: [] };
}
