import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");

loadEnvFile(join(rootDir, ".env"));

const dataDir = process.env.DATA_DIR ? resolve(rootDir, process.env.DATA_DIR) : join(rootDir, "data");
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);
const autoRefresh = parseBool(process.env.AUTO_REFRESH, true);
const initialRefresh = parseBool(process.env.INITIAL_REFRESH, true);

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const statePath = join(dataDir, "state.json");
const settingsPath = join(dataDir, "settings.json");
const assetsPath = join(dataDir, "assets.json");
const pushPath = join(dataDir, "push-log.json");

const defaultSettings = {
  refreshIntervalMinutes: Number(process.env.REFRESH_INTERVAL_MINUTES || 10),
  heatThreshold: Number(process.env.HEAT_THRESHOLD || 72),
  riskThreshold: "中",
  sources: {
    twitter: parseBool(process.env.TWITTER_ENABLED, Boolean(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN)),
    weibo: parseBool(process.env.WEIBO_ENABLED, true),
    hackerNews: true,
    arxiv: true,
    googleNews: true,
    github: true,
    reddit: true,
    coingecko: true,
    tiktok: parseBool(process.env.TIKTOK_ENABLED, Boolean(process.env.TIKTOK_RSS_URL)),
    instagram: parseBool(process.env.INSTAGRAM_ENABLED, Boolean(process.env.INSTAGRAM_RSS_URL)),
    huggingFace: parseBool(process.env.HUGGINGFACE_ENABLED, true),
    openaiBlog: parseBool(process.env.OPENAI_BLOG_ENABLED, true),
    deepmind: parseBool(process.env.DEEPMIND_ENABLED, true),
    anthropic: parseBool(process.env.ANTHROPIC_ENABLED, true),
    glassnode: parseBool(process.env.GLASSNODE_ENABLED, Boolean(process.env.GLASSNODE_API_KEY)),
    coinMarketCap: parseBool(process.env.COINMARKETCAP_ENABLED, Boolean(process.env.COINMARKETCAP_API_KEY)),
    wikipedia: parseBool(process.env.WIKIPEDIA_ENABLED, true),
    youtube: parseBool(process.env.YOUTUBE_ENABLED, Boolean(process.env.YOUTUBE_RSS_URL)),
  },
  sourceConfig: {
    twitter: {
      bearerToken: process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || "",
      query: process.env.X_SEARCH_QUERY || process.env.TWITTER_SEARCH_QUERY || "",
      lang: process.env.X_SEARCH_LANG || process.env.TWITTER_SEARCH_LANG || "",
      maxResults: Number(process.env.X_SEARCH_MAX_RESULTS || process.env.TWITTER_SEARCH_MAX_RESULTS || 50),
      queryMaxChars: Number(process.env.X_SEARCH_QUERY_MAX_CHARS || process.env.TWITTER_SEARCH_QUERY_MAX_CHARS || 512),
    },
    weibo: {
      mode: process.env.WEIBO_MODE || "auto",
      rsshubBaseUrl: process.env.RSSHUB_BASE_URL || "https://rsshub.app",
      rssUrl: process.env.WEIBO_RSS_URL || "",
    },
    github: {
      token: process.env.GITHUB_TOKEN || "",
    },
    reddit: {
      userAgent: process.env.REDDIT_USER_AGENT || "ai-hottopics/0.1 (+local research dashboard)",
    },
    tiktok: {
      rssUrl: process.env.TIKTOK_RSS_URL || "",
      sourceName: process.env.TIKTOK_SOURCE_NAME || "TikTok RSS",
    },
    instagram: {
      rssUrl: process.env.INSTAGRAM_RSS_URL || "",
      sourceName: process.env.INSTAGRAM_SOURCE_NAME || "Instagram RSS",
    },
    huggingFace: {
      rssUrl: process.env.HUGGINGFACE_RSS_URL || "https://huggingface.co/blog/feed.xml",
      sourceName: process.env.HUGGINGFACE_SOURCE_NAME || "Hugging Face Blog",
    },
    openaiBlog: {
      rssUrl: process.env.OPENAI_BLOG_RSS_URL || "https://openai.com/news/rss.xml",
      sourceName: process.env.OPENAI_BLOG_SOURCE_NAME || "OpenAI News",
    },
    deepmind: {
      rssUrl: process.env.DEEPMIND_RSS_URL || "https://deepmind.google/blog/rss.xml",
      sourceName: process.env.DEEPMIND_SOURCE_NAME || "Google DeepMind Blog",
    },
    anthropic: {
      rssUrl: process.env.ANTHROPIC_RSS_URL || "https://www.anthropic.com/news/rss.xml",
      sourceName: process.env.ANTHROPIC_SOURCE_NAME || "Anthropic News",
    },
    glassnode: {
      apiKey: process.env.GLASSNODE_API_KEY || "",
      asset: process.env.GLASSNODE_ASSET || "BTC",
      metric: process.env.GLASSNODE_METRIC || "market/price_usd_close",
      interval: process.env.GLASSNODE_INTERVAL || "24h",
    },
    coinMarketCap: {
      apiKey: process.env.COINMARKETCAP_API_KEY || "",
      endpoint: process.env.COINMARKETCAP_ENDPOINT || "https://pro-api.coinmarketcap.com/v1/cryptocurrency/trending/latest",
    },
    wikipedia: {
      language: process.env.WIKIPEDIA_LANGUAGE || "zh",
      sourceName: process.env.WIKIPEDIA_SOURCE_NAME || "Wikipedia Featured",
    },
    youtube: {
      rssUrl: process.env.YOUTUBE_RSS_URL || "",
      sourceName: process.env.YOUTUBE_SOURCE_NAME || "YouTube RSS",
    },
  },
  keywords: csv(process.env.TRACK_KEYWORDS, ["AI", "OpenAI", "Bitcoin", "crypto", "芯片", "电动车", "地缘政治", "robot", "agent"]),
  blockedWords: csv(process.env.BLOCKED_WORDS, ["广告", "招聘", "水贴", "博彩", "返利"]),
  telegram: {
    enabled: parseBool(process.env.TELEGRAM_ENABLED, false),
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
  },
  feishu: {
    enabled: parseBool(process.env.FEISHU_ENABLED, false),
    webhookUrl: process.env.FEISHU_WEBHOOK_URL || "",
    secret: process.env.FEISHU_SECRET || "",
  },
};

const defaultAssets = [
  {
    id: "persona-crypto",
    type: "账号人设",
    name: "CryptoHunter",
    description: "加密市场快讯、链上观察、风险提示，适合交易向内容。",
    tags: ["Crypto", "交易", "风险"],
  },
  {
    id: "template-ai-thread",
    type: "内容模板",
    name: "AI 事件 Thread",
    description: "三段式拆解：发生了什么、为什么重要、下一步看什么。",
    tags: ["AI", "Thread", "分析"],
  },
  {
    id: "template-risk",
    type: "风控话术",
    name: "敏感事件安全表达",
    description: "降低煽动性，强调事实核验、来源和不确定性。",
    tags: ["风险", "地缘政治", "合规"],
  },
];

let memory = loadJson(statePath, {
  topics: [],
  jobs: [],
  stats: emptyStats(),
  lastRefreshAt: null,
});
let settings = loadJson(settingsPath, defaultSettings);
settings = {
  ...defaultSettings,
  ...settings,
  sources: { ...defaultSettings.sources, ...(settings.sources || {}) },
  sourceConfig: {
    ...defaultSettings.sourceConfig,
    ...(settings.sourceConfig || {}),
    twitter: { ...defaultSettings.sourceConfig.twitter, ...(settings.sourceConfig?.twitter || {}) },
    weibo: { ...defaultSettings.sourceConfig.weibo, ...(settings.sourceConfig?.weibo || {}) },
    github: { ...defaultSettings.sourceConfig.github, ...(settings.sourceConfig?.github || {}) },
    reddit: { ...defaultSettings.sourceConfig.reddit, ...(settings.sourceConfig?.reddit || {}) },
    tiktok: { ...defaultSettings.sourceConfig.tiktok, ...(settings.sourceConfig?.tiktok || {}) },
    instagram: { ...defaultSettings.sourceConfig.instagram, ...(settings.sourceConfig?.instagram || {}) },
    huggingFace: { ...defaultSettings.sourceConfig.huggingFace, ...(settings.sourceConfig?.huggingFace || {}) },
    openaiBlog: { ...defaultSettings.sourceConfig.openaiBlog, ...(settings.sourceConfig?.openaiBlog || {}) },
    deepmind: { ...defaultSettings.sourceConfig.deepmind, ...(settings.sourceConfig?.deepmind || {}) },
    anthropic: { ...defaultSettings.sourceConfig.anthropic, ...(settings.sourceConfig?.anthropic || {}) },
    glassnode: { ...defaultSettings.sourceConfig.glassnode, ...(settings.sourceConfig?.glassnode || {}) },
    coinMarketCap: { ...defaultSettings.sourceConfig.coinMarketCap, ...(settings.sourceConfig?.coinMarketCap || {}) },
    wikipedia: { ...defaultSettings.sourceConfig.wikipedia, ...(settings.sourceConfig?.wikipedia || {}) },
    youtube: { ...defaultSettings.sourceConfig.youtube, ...(settings.sourceConfig?.youtube || {}) },
  },
  telegram: { ...defaultSettings.telegram, ...(settings.telegram || {}) },
  feishu: { ...defaultSettings.feishu, ...(settings.feishu || {}) },
};
let assets = loadJson(assetsPath, defaultAssets);
let pushLog = loadJson(pushPath, []);
let refreshInFlight = false;
let refreshTimer = null;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function csv(value, fallback) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadJson(path, fallback) {
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(fallback, null, 2));
    return structuredClone(fallback);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function persist() {
  writeFileSync(statePath, JSON.stringify(memory, null, 2));
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  writeFileSync(assetsPath, JSON.stringify(assets, null, 2));
  writeFileSync(pushPath, JSON.stringify(pushLog.slice(0, 200), null, 2));
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (!autoRefresh) return;
  const intervalMs = Math.max(1, Number(settings.refreshIntervalMinutes || 10)) * 60 * 1000;
  refreshTimer = setInterval(() => {
    runRefresh({ manual: false }).catch((error) => console.error("scheduled refresh failed", error));
  }, intervalMs);
  refreshTimer.unref?.();
}

function emptyStats() {
  return {
    discovered: 0,
    hot: 0,
    generated: 0,
    pushed: 0,
    failedSources: 0,
    activeSources: 0,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function idFor(input) {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function minutesAgo(dateValue) {
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return 240;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}

function categoryFor(text) {
  const lower = text.toLowerCase();
  if (/bitcoin|btc|crypto|ethereum|solana|token|coin|defi|链|比特币|加密|币圈|web3/.test(lower)) return "Crypto";
  if (/ai|openai|anthropic|deepmind|hugging face|huggingface|model|agent|robot|llm|sora|芯片|英伟达|大模型|人工智能|机器人/.test(lower)) return "AI";
  if (/war|israel|iran|russia|ukraine|tariff|election|protest|中东|以色列|伊朗|政治|选举|示威|关税/.test(lower)) return "地缘政治";
  if (/meme|funny|viral|joke|梗|整活|笑|热搜|爆了|塌房/.test(lower)) return "整活/Meme";
  if (/health|life|food|travel|生活|健康|旅游|教育|明星|电影|综艺|直播/.test(lower)) return "生活百科";
  return "猎奇";
}

function regionFor(text) {
  const lower = text.toLowerCase();
  if (/china|beijing|shanghai|中国|北京|上海|深圳|香港|台湾/.test(lower)) return "中国";
  if (/japan|tokyo|日本|东京/.test(lower)) return "日本";
  if (/korea|seoul|韩国|首尔/.test(lower)) return "韩国";
  if (/us |usa|america|washington|美国|美联储|纽约/.test(lower)) return "美国";
  return "全球";
}

function riskFor(text, category) {
  const lower = text.toLowerCase();
  const high = /war|attack|strike|death|explosion|protest|election|israel|iran|russia|ukraine|空袭|爆炸|死亡|抗议|示威|选举|战争|制裁|暴力|政治/.test(lower);
  const medium = /hack|lawsuit|ban|crash|fraud|监管|封禁|诉讼|造假|崩盘|诈骗|争议/.test(lower);
  if (high || category === "地缘政治") return "高";
  if (medium || category === "Crypto") return "中";
  return "低";
}

function sentimentFor(text, risk) {
  const lower = text.toLowerCase();
  if (risk === "高") return "警惕";
  if (/breakthrough|surge|record|launch|growth|突破|发布|上涨|创新|增长|开放/.test(lower)) return "积极";
  if (/fall|drop|ban|risk|concern|下跌|风险|争议|担忧/.test(lower)) return "警惕";
  return "中性";
}

function extractKeywords(text) {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "are",
    "was",
    "what",
    "when",
    "over",
    "about",
    "into",
    "after",
    "before",
    "your",
    "you",
    "how",
    "why",
    "not",
    "can",
  ]);
  const english = text.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}/g) || [];
  const chinese = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  const tokens = [...english, ...chinese]
    .map((word) => word.trim())
    .filter((word) => !stop.has(word.toLowerCase()) && !settings.blockedWords.some((blocked) => word.includes(blocked)));
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([word]) => word);
}

function heatScore(raw) {
  const recency = Math.max(0, 42 - Math.sqrt(minutesAgo(raw.publishedAt || Date.now())) * 2.6);
  const engagement = Math.log10((raw.score || 0) + (raw.comments || 0) * 2 + 10) * 19;
    const sourceWeight =
    raw.platform === "X"
      ? 20
      : raw.platform === "微博"
        ? 20
        : raw.platform === "TikTok" || raw.platform === "Instagram"
          ? 19
          : raw.platform === "GitHub"
            ? 16
            : raw.platform === "CoinGecko"
              ? 18
              : raw.platform === "Hacker News"
                ? 18
                : raw.platform === "arXiv"
                  ? 15
                  : 10;
  return Math.max(30, Math.min(99.8, recency + engagement + sourceWeight));
}

function trendFor(score, seed) {
  const base = Math.max(8, Math.round(score * 0.45));
  return Array.from({ length: 11 }, (_, index) => {
    const wave = Math.sin((index + seed.length) * 0.9) * 5;
    const lift = index * (score - base) / 10;
    return Math.max(3, Math.min(100, Math.round(base + lift + wave)));
  });
}

function normalizeTopic(raw) {
  const title = stripHtml(raw.title || raw.name || "Untitled");
  const desc = stripHtml(raw.desc || raw.description || raw.url || "");
  const text = `${title} ${desc}`;
  const category = categoryFor(text);
  const risk = riskFor(text, category);
  const heat = heatScore(raw);
  const topic = {
    id: idFor(`${raw.platform}:${title}:${raw.url || raw.publishedAt || ""}`),
    title,
    desc: desc || "公开数据源抓取到的新近内容，等待进一步人工复核。",
    platform: raw.platform,
    source: raw.source || raw.platform,
    category,
    region: regionFor(text),
    heat: Number(heat.toFixed(1)),
    boost: Math.round(Math.max(12, heat * 2.6 - minutesAgo(raw.publishedAt) * 0.2)),
    sentiment: sentimentFor(text, risk),
    risk,
    url: raw.url || "",
    author: raw.author || raw.source || raw.platform,
    publishedAt: raw.publishedAt || nowIso(),
    crawledAt: nowIso(),
    score: raw.score || 0,
    commentsCount: raw.comments || 0,
    trend: trendFor(heat, title),
    keywords: extractKeywords(text),
  };
  topic.summary = makeSummary(topic);
  topic.comments = makeComments(topic);
  topic.publishCopy = makeCopies(topic);
  return topic;
}

function makeSummary(topic) {
  const why = topic.category === "AI"
    ? "技术迭代和应用落地预期会放大传播速度"
    : topic.category === "Crypto"
      ? "价格、资金流和情绪共振会带来短线扩散"
      : topic.category === "地缘政治"
        ? "事件可能牵动能源、政策与市场风险偏好"
        : "话题具备强共鸣或猎奇传播属性";
  return `${topic.title} 正在 ${topic.platform} 等公开源升温，当前热度 ${topic.heat}。${why}，建议结合原始链接和二次来源继续核验。`;
}

function makeComments(topic) {
  return [
    {
      author: "系统观点",
      handle: "@signal",
      avatar: "S",
      text: `核心看点：${topic.keywords.slice(0, 3).join(" / ") || topic.category}。`,
      replies: String(Math.max(8, Math.round(topic.commentsCount * 0.18))),
      shares: String(Math.max(12, Math.round(topic.score * 0.12))),
      likes: String(Math.max(60, Math.round(topic.heat * 42))),
    },
    {
      author: "风险雷达",
      handle: "@risk",
      avatar: "R",
      text: topic.risk === "高" ? "先核验事实和来源，再决定是否跟进。" : "适合做快讯或观点延展，但仍需检查标题党风险。",
      replies: String(Math.max(3, Math.round(topic.heat / 8))),
      shares: String(Math.max(5, Math.round(topic.heat / 5))),
      likes: String(Math.max(40, Math.round(topic.heat * 18))),
    },
  ];
}

function makeCopies(topic) {
  const tags = topic.keywords.slice(0, 4).map((word) => `#${word.replace(/\s+/g, "")}`).join(" ");
  return {
    快讯版: `刚刚关注到：${topic.title}。当前热度 ${topic.heat}，主要关键词是 ${topic.keywords.slice(0, 3).join("、") || topic.category}。${tags}`,
    锐评版: `${topic.title} 的关键不只是事件本身，而是它可能改变 ${topic.category} 领域的预期。先看传播速度，再看是否有权威来源确认。`,
    Thread版: `1/ ${topic.title}\n2/ 当前热度 ${topic.heat}，来源：${topic.source}。\n3/ 重点看 ${topic.keywords.slice(0, 3).join("、") || topic.category}。\n4/ 风险等级：${topic.risk}，发布前建议二次核验。`,
    Meme版: `${topic.title}\n网友：今天就安静刷会儿。\n热搜：不，你不能。`,
    带节奏版: `${topic.title} 已经开始扩散。现在的问题不是要不要关注，而是谁能更快把事实、影响和机会讲清楚。`,
  };
}

function applyAssetContext(text, asset) {
  if (!asset) return text;
  const tags = Array.isArray(asset.tags) && asset.tags.length ? ` 标签：${asset.tags.join("、")}` : "";
  return `${text}\n\n参考素材：${asset.name}（${asset.type || "素材"}）。${asset.description || ""}${tags}`.trim();
}

function feishuSignature(timestamp, secret) {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "ai-hottopics/0.1 (+local research dashboard)",
        accept: "application/json,text/plain,*/*",
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      const detail = stripHtml(text).slice(0, 240);
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ai-hottopics/0.1 (+local research dashboard)",
        accept: "application/rss+xml,text/xml,text/plain,*/*",
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function crawlTwitter() {
  const config = settings.sourceConfig?.twitter || {};
  const bearerToken = config.bearerToken || process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN is not configured");
  }

  const query = twitterSearchQuery();
  const params = new URLSearchParams({
    query,
    max_results: twitterMaxResults(),
    "tweet.fields": "created_at,public_metrics,lang,author_id",
    expansions: "author_id",
    "user.fields": "name,username",
  });
  const data = await fetchJson(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: {
      authorization: `Bearer ${bearerToken}`,
    },
  });
  const users = new Map((data.includes?.users || []).map((user) => [user.id, user]));
  return (data.data || []).map((tweet) => {
    const metrics = tweet.public_metrics || {};
    const user = users.get(tweet.author_id) || {};
    const username = user.username || tweet.author_id || "unknown";
    const score =
      (metrics.like_count || 0) * 0.7 +
      (metrics.retweet_count || 0) * 3 +
      (metrics.reply_count || 0) * 2 +
      (metrics.quote_count || 0) * 2.5;
    return {
      platform: "X",
      source: "X Recent Search",
      title: stripHtml(tweet.text).slice(0, 110),
      desc: stripHtml(tweet.text),
      url: `https://x.com/${username}/status/${tweet.id}`,
      author: user.name || username,
      publishedAt: tweet.created_at,
      score: Math.round(score),
      comments: metrics.reply_count || 0,
    };
  });
}

function twitterSearchQuery() {
  const config = settings.sourceConfig?.twitter || {};
  const override = (config.query || process.env.X_SEARCH_QUERY || process.env.TWITTER_SEARCH_QUERY || "").trim();
  if (override) return assertTwitterQueryLength(override);

  const terms = settings.keywords
    .slice(0, 12)
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword) => (/\s/.test(keyword) ? `"${keyword.replace(/"/g, '\\"')}"` : keyword));
  if (!terms.length) throw new Error("No keywords configured for X search");

  const language = (config.lang || process.env.X_SEARCH_LANG || process.env.TWITTER_SEARCH_LANG || "").trim();
  const languageFilter = /^[a-z]{2,3}$/i.test(language) ? ` lang:${language.toLowerCase()}` : "";
  return assertTwitterQueryLength(`(${terms.join(" OR ")})${languageFilter} -is:retweet`);
}

function assertTwitterQueryLength(query) {
  const configured = Number(settings.sourceConfig?.twitter?.queryMaxChars || process.env.X_SEARCH_QUERY_MAX_CHARS || process.env.TWITTER_SEARCH_QUERY_MAX_CHARS || 512);
  const maxLength = Math.max(1, Math.min(4096, Number.isFinite(configured) ? Math.round(configured) : 512));
  if (query.length > maxLength) {
    throw new Error(`X search query exceeds ${maxLength} characters`);
  }
  return query;
}

function twitterMaxResults() {
  const value = Number(settings.sourceConfig?.twitter?.maxResults || process.env.X_SEARCH_MAX_RESULTS || process.env.TWITTER_SEARCH_MAX_RESULTS || 50);
  return String(Math.max(10, Math.min(100, Number.isFinite(value) ? Math.round(value) : 50)));
}

async function crawlHackerNews() {
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const urls = [
    "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=35",
    ...settings.keywords
      .slice(0, 4)
      .map(
        (keyword) =>
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(keyword)}&tags=story&numericFilters=created_at_i>${sevenDaysAgo}&hitsPerPage=12`,
      ),
  ];
  const hits = [];
  for (const url of urls) {
    const data = await fetchJson(url);
    hits.push(...(data.hits || []));
  }
  return hits.map((item) => ({
    platform: "Hacker News",
    source: "HN",
    title: item.title || item.story_title,
    desc: item.url || item.story_text || "",
    url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
    author: item.author,
    publishedAt: item.created_at,
    score: item.points || 0,
    comments: item.num_comments || 0,
  }));
}

function parseAtom(xml, source) {
  const entries = [];
  const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entryMatches.slice(0, 18)) {
    const pick = (tag) => stripHtml((entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || "");
    const link = (entry.match(/<link[^>]+href="([^"]+)"/) || [])[1] || "";
    entries.push({
      platform: "arXiv",
      source,
      title: pick("title"),
      desc: pick("summary"),
      url: link,
      author: source,
      publishedAt: pick("published") || pick("updated") || nowIso(),
      score: 130,
      comments: 10,
    });
  }
  return entries;
}

async function crawlArxiv() {
  const all = [];
  const queries = ["artificial intelligence", "large language model", "agent", "robotics"];
  for (const query of queries) {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending`;
    const xml = await fetchText(url);
    all.push(...parseAtom(xml, `arXiv: ${query}`));
  }
  return all;
}

async function crawlGithub() {
  const token = settings.sourceConfig?.github?.token || process.env.GITHUB_TOKEN || "";
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const data = await fetchJson("https://api.github.com/search/repositories?q=AI+OR+agent+OR+LLM+created:%3E2026-01-01&sort=updated&order=desc&per_page=20", { headers });
  return (data.items || []).map((repo) => ({
    platform: "GitHub",
    source: "GitHub Search",
    title: repo.full_name,
    desc: repo.description || "Recently active repository",
    url: repo.html_url,
    author: repo.owner?.login,
    publishedAt: repo.updated_at,
    score: repo.stargazers_count || 0,
    comments: repo.open_issues_count || 0,
  }));
}

async function crawlCoinGecko() {
  const data = await fetchJson("https://api.coingecko.com/api/v3/search/trending");
  return (data.coins || []).map(({ item }) => ({
    platform: "CoinGecko",
    source: "CoinGecko Trending",
    title: `${item.name} (${item.symbol}) 热度上升`,
    desc: `Market cap rank ${item.market_cap_rank || "-"}, price BTC ${item.price_btc || "-"}`,
    url: `https://www.coingecko.com/en/coins/${item.id}`,
    author: item.symbol,
    publishedAt: nowIso(),
    score: item.score ? 1000 - item.score * 100 : 200,
    comments: item.market_cap_rank ? Math.max(1, 500 - item.market_cap_rank) : 50,
  }));
}

async function crawlReddit() {
  const subs = ["artificial", "technology", "CryptoCurrency", "worldnews"];
  const results = [];
  const userAgent = settings.sourceConfig?.reddit?.userAgent || process.env.REDDIT_USER_AGENT || "ai-hottopics/0.1 (+local research dashboard)";
  for (const sub of subs) {
    const data = await fetchJson(`https://www.reddit.com/r/${sub}/hot.json?limit=12`, {
      headers: { accept: "application/json", "user-agent": userAgent },
    });
    for (const child of data.data?.children || []) {
      const post = child.data;
      results.push({
        platform: "Reddit",
        source: `r/${sub}`,
        title: post.title,
        desc: post.selftext || post.url || "",
        url: `https://www.reddit.com${post.permalink}`,
        author: post.author,
        publishedAt: new Date(post.created_utc * 1000).toISOString(),
        score: post.score || 0,
        comments: post.num_comments || 0,
      });
    }
  }
  return results;
}

function parseRss(xml, source, platform = "Google News") {
  const items = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const [index, item] of itemMatches.slice(0, 25).entries()) {
    const pick = (tag) => stripHtml((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || "");
    items.push({
      platform,
      source,
      title: pick("title"),
      desc: pick("description"),
      url: pick("link"),
      author: source,
      publishedAt: pick("pubDate") || nowIso(),
      score: platform === "微博" ? Math.max(100, 520 - index * 14) : platform === "TikTok" || platform === "Instagram" ? Math.max(90, 260 - index * 8) : 80,
      comments: platform === "微博" ? Math.max(10, 80 - index * 2) : platform === "TikTok" || platform === "Instagram" ? Math.max(8, 45 - index) : 12,
    });
  }
  return items;
}

async function crawlConfiguredRss(sourceKey, platform, fallbackSourceName) {
  const config = settings.sourceConfig?.[sourceKey] || {};
  const url = config.rssUrl || process.env[`${sourceKey.toUpperCase()}_RSS_URL`] || "";
  if (!url) throw new Error(`${sourceKey.toUpperCase()}_RSS_URL is not configured`);
  const xml = await fetchText(url);
  const source = config.sourceName || fallbackSourceName;
  return parseRss(xml, source, platform);
}

async function crawlWikipedia() {
  const config = settings.sourceConfig?.wikipedia || {};
  const language = (config.language || "zh").trim() || "zh";
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const data = await fetchJson(`https://api.wikimedia.org/feed/v1/wikipedia/${encodeURIComponent(language)}/featured/${yyyy}/${mm}/${dd}`);
  const source = config.sourceName || "Wikipedia Featured";
  const mostread = data.mostread?.articles || [];
  return mostread.slice(0, 25).map((item, index) => ({
    platform: "Wikipedia",
    source,
    title: item.normalizedtitle || item.title,
    desc: item.description || item.extract || "",
    url: item.content_urls?.desktop?.page || item.content_urls?.mobile?.page || "",
    author: source,
    publishedAt: nowIso(),
    score: Math.max(80, 320 - index * 8),
    comments: Math.max(6, 35 - index),
  }));
}

async function crawlGlassnode() {
  const config = settings.sourceConfig?.glassnode || {};
  const apiKey = config.apiKey || process.env.GLASSNODE_API_KEY || "";
  if (!apiKey) throw new Error("GLASSNODE_API_KEY is not configured");
  const asset = config.asset || "BTC";
  const metric = (config.metric || "market/price_usd_close").replace(/^\/+/, "");
  const interval = config.interval || "24h";
  const params = new URLSearchParams({ a: asset, i: interval, api_key: apiKey });
  const rows = await fetchJson(`https://api.glassnode.com/v1/metrics/${metric}?${params}`);
  const latest = Array.isArray(rows) ? rows.at(-1) : null;
  if (!latest) return [];
  const previous = Array.isArray(rows) && rows.length > 1 ? rows.at(-2) : null;
  const latestValue = Number(latest.v || 0);
  const previousValue = Number(previous?.v || latestValue || 0);
  const change = previousValue ? ((latestValue - previousValue) / previousValue) * 100 : 0;
  return [{
    platform: "Glassnode",
    source: `Glassnode ${metric}`,
    title: `${asset} ${metric} ${change >= 0 ? "上涨" : "下跌"} ${Math.abs(change).toFixed(2)}%`,
    desc: `Latest value ${latestValue.toFixed(2)} from Glassnode metric ${metric}`,
    url: "https://studio.glassnode.com/",
    author: "Glassnode",
    publishedAt: latest.t ? new Date(latest.t * 1000).toISOString() : nowIso(),
    score: Math.max(80, Math.round(Math.abs(change) * 80 + 120)),
    comments: Math.max(8, Math.round(Math.abs(change) * 10)),
  }];
}

async function crawlCoinMarketCap() {
  const config = settings.sourceConfig?.coinMarketCap || {};
  const apiKey = config.apiKey || process.env.COINMARKETCAP_API_KEY || "";
  if (!apiKey) throw new Error("COINMARKETCAP_API_KEY is not configured");
  const endpoint = config.endpoint || "https://pro-api.coinmarketcap.com/v1/cryptocurrency/trending/latest";
  const data = await fetchJson(endpoint, { headers: { "X-CMC_PRO_API_KEY": apiKey } });
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.slice(0, 25).map((coin, index) => {
    const quote = coin.quote?.USD || {};
    const change = Number(quote.percent_change_24h || 0);
    return {
      platform: "CoinMarketCap",
      source: "CoinMarketCap Trending",
      title: `${coin.name || coin.symbol} (${coin.symbol || "-"}) ${change >= 0 ? "上涨" : "下跌"} ${Math.abs(change).toFixed(2)}%`,
      desc: `Rank ${coin.cmc_rank || "-"}, price ${quote.price ? `$${Number(quote.price).toFixed(4)}` : "-"}`,
      url: coin.slug ? `https://coinmarketcap.com/currencies/${coin.slug}/` : "https://coinmarketcap.com/trending-cryptocurrencies/",
      author: coin.symbol || "CMC",
      publishedAt: coin.last_updated || nowIso(),
      score: Math.max(80, Math.round(Math.abs(change) * 60 + 260 - index * 6)),
      comments: Math.max(8, 50 - index),
    };
  });
}

async function crawlWeibo() {
  const mode = (settings.sourceConfig?.weibo?.mode || process.env.WEIBO_MODE || "auto").toLowerCase();
  if (mode === "direct") return crawlWeiboDirect();
  if (mode === "rsshub") return crawlWeiboRssHub();
  try {
    return await crawlWeiboRssHub();
  } catch {
    return crawlWeiboDirect();
  }
}

async function crawlWeiboRssHub() {
  const baseUrl = (settings.sourceConfig?.weibo?.rsshubBaseUrl || process.env.RSSHUB_BASE_URL || "https://rsshub.app").replace(/\/$/, "");
  const url = settings.sourceConfig?.weibo?.rssUrl || process.env.WEIBO_RSS_URL || `${baseUrl}/weibo/search/hot`;
  const xml = await fetchText(url);
  return parseRss(xml, "Weibo Hot Search", "微博").map((item) => ({
    ...item,
    region: "中国",
  }));
}

async function crawlWeiboDirect() {
  const data = await fetchJson("https://weibo.com/ajax/side/hotSearch", {
    headers: {
      accept: "application/json,text/plain,*/*",
      referer: "https://weibo.com/hot/search",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    },
  });
  return (data.data?.realtime || [])
    .filter((item) => item.word && !item.is_ad)
    .slice(0, 40)
    .map((item, index) => {
      const title = stripHtml(item.note || item.word);
      const rank = Number(item.realpos || index + 1);
      const rawHeat = Number(item.num || 100);
      return {
        platform: "微博",
        source: "Weibo Hot Search",
        title,
        desc: `${item.label_name || "热搜"} · 排名 ${rank} · 热度 ${item.num || "-"}`,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word_scheme || `#${item.word}#`)}`,
        author: "微博热搜",
        publishedAt: new Date(Date.now() - Math.max(0, rank - 1) * 12 * 60 * 1000).toISOString(),
        score: Math.max(8, Math.round(Math.log10(Math.max(rawHeat, 10)) * 12)),
        comments: Math.max(10, 80 - index),
      };
    });
}

async function crawlGoogleNews() {
  const queries = settings.keywords.slice(0, 7);
  const all = [];
  for (const query of queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
    const xml = await fetchText(url);
    all.push(...parseRss(xml, `Google News: ${query}`));
  }
  return all;
}

async function runRefresh({ manual = false } = {}) {
  if (refreshInFlight) return memory;
  refreshInFlight = true;
  const job = {
    id: idFor(`${Date.now()}:refresh`),
    type: manual ? "手动抓取" : "自动抓取",
    status: "running",
    startedAt: nowIso(),
    finishedAt: null,
    sources: [],
    message: "抓取中",
  };
  memory.jobs.unshift(job);
  memory.jobs = memory.jobs.slice(0, 80);

  const sourceTasks = [
    ["twitter", "X Recent Search", crawlTwitter],
    ["weibo", "Weibo Hot Search", crawlWeibo],
    ["hackerNews", "Hacker News", crawlHackerNews],
    ["arxiv", "arXiv", crawlArxiv],
    ["googleNews", "Google News RSS", crawlGoogleNews],
    ["github", "GitHub Search", crawlGithub],
    ["reddit", "Reddit", crawlReddit],
    ["coingecko", "CoinGecko", crawlCoinGecko],
    ["tiktok", "TikTok RSS", () => crawlConfiguredRss("tiktok", "TikTok", "TikTok RSS")],
    ["instagram", "Instagram RSS", () => crawlConfiguredRss("instagram", "Instagram", "Instagram RSS")],
    ["huggingFace", "Hugging Face Blog", () => crawlConfiguredRss("huggingFace", "Hugging Face", "Hugging Face Blog")],
    ["openaiBlog", "OpenAI News", () => crawlConfiguredRss("openaiBlog", "OpenAI", "OpenAI News")],
    ["deepmind", "Google DeepMind Blog", () => crawlConfiguredRss("deepmind", "Google DeepMind", "Google DeepMind Blog")],
    ["anthropic", "Anthropic News", () => crawlConfiguredRss("anthropic", "Anthropic", "Anthropic News")],
    ["glassnode", "Glassnode", crawlGlassnode],
    ["coinMarketCap", "CoinMarketCap", crawlCoinMarketCap],
    ["wikipedia", "Wikipedia", crawlWikipedia],
    ["youtube", "YouTube RSS", () => crawlConfiguredRss("youtube", "YouTube", "YouTube RSS")],
  ].filter(([key]) => settings.sources[key]);

  const raw = [];
  for (const [, name, fn] of sourceTasks) {
    const started = Date.now();
    try {
      const items = await fn();
      raw.push(...items);
      job.sources.push({ name, status: "ok", count: items.length, ms: Date.now() - started });
    } catch (error) {
      job.sources.push({ name, status: "failed", count: 0, ms: Date.now() - started, error: error.message });
    }
  }

  const merged = new Map();
  for (const item of raw) {
    if (!item.title) continue;
    const normalized = normalizeTopic(item);
    const key = normalized.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "").slice(0, 42);
    const existing = merged.get(key);
    if (!existing || normalized.heat > existing.heat) merged.set(key, normalized);
  }

  const oldTopics = new Map(memory.topics.map((topic) => [topic.id, topic]));
  memory.topics = [...merged.values()]
    .map((topic) => {
      const old = oldTopics.get(topic.id);
      if (old) {
        const heat = Math.max(topic.heat, old.heat * 0.92);
        return {
          ...topic,
          firstSeenAt: old.firstSeenAt || topic.crawledAt,
          heat: Number(heat.toFixed(1)),
        };
      }
      return { ...topic, firstSeenAt: topic.crawledAt };
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 120);

  job.status = "success";
  job.finishedAt = nowIso();
  job.message = `抓取 ${raw.length} 条，归并 ${memory.topics.length} 个热点`;
  memory.lastRefreshAt = nowIso();
  memory.stats = {
    discovered: memory.topics.length,
    hot: memory.topics.filter((topic) => topic.heat >= settings.heatThreshold).length,
    generated: memory.stats.generated || 0,
    pushed: pushLog.filter((item) => item.status === "sent" || item.status === "simulated").length,
    failedSources: job.sources.filter((source) => source.status === "failed").length,
    activeSources: job.sources.filter((source) => source.status === "ok").length,
  };
  refreshInFlight = false;
  persist();
  return memory;
}

function filteredTopics(query) {
  const params = new URLSearchParams(query);
  const platform = params.get("platform") || "全部";
  const category = params.get("category") || "全部";
  const region = params.get("region") || "全球";
  const keyword = (params.get("q") || "").toLowerCase().trim();
  return memory.topics.filter((topic) => {
    const platformOk = platform === "全部" || topic.platform === platform;
    const categoryOk = category === "全部" || topic.category === category;
    const regionOk = region === "全球" || topic.region === region;
    const keywordOk = !keyword || `${topic.title} ${topic.desc} ${topic.keywords.join(" ")}`.toLowerCase().includes(keyword);
    return platformOk && categoryOk && regionOk && keywordOk;
  });
}

function radar() {
  const counts = new Map();
  for (const topic of memory.topics) {
    for (const word of topic.keywords) {
      const row = counts.get(word) || { keyword: word, count: 0, heat: 0, risk: 0, topics: [] };
      row.count += 1;
      row.heat += topic.heat;
      row.risk += topic.risk === "高" ? 3 : topic.risk === "中" ? 2 : 1;
      row.topics.push(topic.title);
      counts.set(word, row);
    }
  }
  return [...counts.values()]
    .map((row) => ({
      ...row,
      heat: Number((row.heat / row.count).toFixed(1)),
      risk: Number((row.risk / row.count).toFixed(1)),
      topics: row.topics.slice(0, 4),
    }))
    .sort((a, b) => b.heat * b.count - a.heat * a.count)
    .slice(0, 40);
}

function analytics() {
  const byCategory = groupCount(memory.topics, "category");
  const byPlatform = groupCount(memory.topics, "platform");
  const byRisk = groupCount(memory.topics, "risk");
  const timeline = Array.from({ length: 12 }, (_, index) => {
    const slice = memory.topics.slice(index * 8, index * 8 + 8);
    return {
      label: `${index * 2}:00`,
      heat: Number((slice.reduce((sum, topic) => sum + topic.heat, 0) / Math.max(slice.length, 1)).toFixed(1)),
      count: slice.length,
    };
  });
  return { byCategory, byPlatform, byRisk, timeline };
}

function groupCount(rows, field) {
  const map = new Map();
  for (const row of rows) map.set(row[field], (map.get(row[field]) || 0) + 1);
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function json(res, payload, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(distDir, `.${pathname}`);
  if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
    const indexPath = join(distDir, "index.html");
    if (existsSync(indexPath)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(indexPath));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const type = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  }[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(filePath));
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, { ok: true, lastRefreshAt: memory.lastRefreshAt, topics: memory.topics.length });
  }
  if (req.method === "GET" && url.pathname === "/api/topics") {
    return json(res, { topics: filteredTopics(url.search), stats: memory.stats, lastRefreshAt: memory.lastRefreshAt });
  }
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    const next = await runRefresh({ manual: true });
    return json(res, { ok: true, topics: next.topics, stats: next.stats, jobs: next.jobs });
  }
  if (req.method === "GET" && url.pathname === "/api/radar") {
    return json(res, { keywords: radar(), topics: memory.topics.slice(0, 20) });
  }
  if (req.method === "GET" && url.pathname === "/api/analytics") {
    return json(res, { stats: memory.stats, analytics: analytics(), lastRefreshAt: memory.lastRefreshAt });
  }
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return json(res, { jobs: memory.jobs, refreshInFlight });
  }
  if (req.method === "GET" && url.pathname === "/api/settings") {
    return json(res, { settings });
  }
  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    settings = {
      ...settings,
      ...body,
      sources: { ...settings.sources, ...(body.sources || {}) },
      sourceConfig: {
        ...settings.sourceConfig,
        ...(body.sourceConfig || {}),
        twitter: { ...settings.sourceConfig.twitter, ...(body.sourceConfig?.twitter || {}) },
        weibo: { ...settings.sourceConfig.weibo, ...(body.sourceConfig?.weibo || {}) },
        github: { ...settings.sourceConfig.github, ...(body.sourceConfig?.github || {}) },
        reddit: { ...settings.sourceConfig.reddit, ...(body.sourceConfig?.reddit || {}) },
        tiktok: { ...settings.sourceConfig.tiktok, ...(body.sourceConfig?.tiktok || {}) },
        instagram: { ...settings.sourceConfig.instagram, ...(body.sourceConfig?.instagram || {}) },
        huggingFace: { ...settings.sourceConfig.huggingFace, ...(body.sourceConfig?.huggingFace || {}) },
        openaiBlog: { ...settings.sourceConfig.openaiBlog, ...(body.sourceConfig?.openaiBlog || {}) },
        deepmind: { ...settings.sourceConfig.deepmind, ...(body.sourceConfig?.deepmind || {}) },
        anthropic: { ...settings.sourceConfig.anthropic, ...(body.sourceConfig?.anthropic || {}) },
        glassnode: { ...settings.sourceConfig.glassnode, ...(body.sourceConfig?.glassnode || {}) },
        coinMarketCap: { ...settings.sourceConfig.coinMarketCap, ...(body.sourceConfig?.coinMarketCap || {}) },
        wikipedia: { ...settings.sourceConfig.wikipedia, ...(body.sourceConfig?.wikipedia || {}) },
        youtube: { ...settings.sourceConfig.youtube, ...(body.sourceConfig?.youtube || {}) },
      },
      telegram: { ...settings.telegram, ...(body.telegram || {}) },
      feishu: { ...settings.feishu, ...(body.feishu || {}) },
    };
    persist();
    scheduleAutoRefresh();
    return json(res, { ok: true, settings });
  }
  if (req.method === "GET" && url.pathname === "/api/assets") {
    return json(res, { assets });
  }
  if (req.method === "POST" && url.pathname === "/api/assets") {
    const body = await readBody(req);
    const asset = { id: idFor(`${Date.now()}:${body.name}`), type: body.type || "素材", name: body.name || "未命名素材", description: body.description || "", tags: body.tags || [] };
    assets.unshift(asset);
    persist();
    return json(res, { ok: true, asset, assets });
  }
  if (req.method === "POST" && url.pathname === "/api/content/generate") {
    const body = await readBody(req);
    const topic = memory.topics.find((item) => item.id === body.topicId) || memory.topics[0];
    if (!topic) return json(res, { error: "暂无热点，请先刷新抓取" }, 400);
    const mode = body.mode || "快讯版";
    const asset = assets.find((item) => item.id === body.assetId);
    const baseText = topic.publishCopy[mode] || makeCopies(topic).快讯版;
    memory.stats.generated += 1;
    persist();
    return json(res, { topic, mode, asset, text: applyAssetContext(baseText, asset) });
  }
  if (req.method === "GET" && url.pathname === "/api/push/log") {
    return json(res, {
      pushLog,
      channels: {
        local: true,
        telegram: Boolean(settings.telegram.enabled && settings.telegram.botToken && settings.telegram.chatId),
        feishu: Boolean(settings.feishu.enabled && settings.feishu.webhookUrl),
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/push/send") {
    const body = await readBody(req);
    const text = body.text || "";
    const target = body.target || "local";
    const entry = { id: idFor(`${Date.now()}:${target}:${text}`), text, createdAt: nowIso(), status: "simulated", target };
    if (target === "telegram") {
      if (!(settings.telegram.enabled && settings.telegram.botToken && settings.telegram.chatId)) {
        entry.status = "failed";
        entry.error = "Telegram is not configured";
      } else {
        try {
          const result = await fetchJson(`https://api.telegram.org/bot${settings.telegram.botToken}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: settings.telegram.chatId, text }),
          });
          entry.status = result.ok ? "sent" : "failed";
        } catch (error) {
          entry.status = "failed";
          entry.error = error.message;
        }
      }
    } else if (target === "feishu") {
      if (!(settings.feishu.enabled && settings.feishu.webhookUrl)) {
        entry.status = "failed";
        entry.error = "Feishu webhook is not configured";
      } else {
        try {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const body = {
            msg_type: "text",
            content: { text },
            ...(settings.feishu.secret ? { timestamp, sign: feishuSignature(timestamp, settings.feishu.secret) } : {}),
          };
          const result = await fetchJson(settings.feishu.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          entry.status = result.StatusCode === 0 || result.code === 0 ? "sent" : "failed";
          if (entry.status === "failed") entry.error = result.msg || result.StatusMessage || "Feishu webhook returned an error";
        } catch (error) {
          entry.status = "failed";
          entry.error = error.message;
        }
      }
    }
    pushLog.unshift(entry);
    memory.stats.pushed = pushLog.filter((item) => item.status === "sent" || item.status === "simulated").length;
    persist();
    return json(res, { ok: entry.status !== "failed", entry, pushLog });
  }
  return json(res, { error: "Not found" }, 404);
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return json(res, { error: error.message || "Internal error" }, 500);
  }
});

server.listen(port, async () => {
  console.log(`AI hot topics API listening on http://localhost:${port}`);
  console.log(`Data directory: ${dataDir}`);
  scheduleAutoRefresh();
  if (initialRefresh) {
    runRefresh({ manual: false }).catch((error) => console.error("initial refresh failed", error));
  }
});
