import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");

loadEnvFile(join(rootDir, ".env"));

const dataDir = process.env.DATA_DIR ? resolve(rootDir, process.env.DATA_DIR) : join(rootDir, "data");
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const adminToken = process.env.ADMIN_TOKEN || "";
const requireAuth = parseBool(process.env.REQUIRE_AUTH, Boolean(adminToken));
const maxBodyBytes = Math.max(16 * 1024, Math.min(4 * 1024 * 1024, Number(process.env.MAX_BODY_BYTES || 1024 * 1024)));
const sourceConcurrency = Math.max(1, Math.min(8, Number(process.env.SOURCE_CONCURRENCY || 4)));
const mutationRateLimit = Math.max(5, Math.min(300, Number(process.env.MUTATION_RATE_LIMIT || 30)));
const autoRefresh = parseBool(process.env.AUTO_REFRESH, true);
const initialRefresh = parseBool(process.env.INITIAL_REFRESH, true);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
if (!Number.isInteger(maxBodyBytes)) throw new Error("MAX_BODY_BYTES must be a number");
if (!Number.isInteger(sourceConcurrency) || sourceConcurrency < 1 || sourceConcurrency > 8) throw new Error("SOURCE_CONCURRENCY must be an integer between 1 and 8");
if (!Number.isInteger(mutationRateLimit)) throw new Error("MUTATION_RATE_LIMIT must be a number");
if (requireAuth && !adminToken) throw new Error("ADMIN_TOKEN is required when REQUIRE_AUTH=true");
if (!isLoopbackHost(host) && !adminToken) throw new Error("ADMIN_TOKEN is required when HOST is not loopback");

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

const copyModes = ["快讯版", "锐评版", "Thread版", "Meme版", "带节奏版"];
const redactedSecret = "********";
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "#cdata",
  textNodeName: "#text",
  trimValues: true,
});

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

let memory = normalizeMemory(loadJson(statePath, {
  topics: [],
  jobs: [],
  stats: emptyStats(),
  lastRefreshAt: null,
  history: {},
}));
let settings = normalizeSettings(loadJson(settingsPath, defaultSettings));
let assets = normalizeAssets(loadJson(assetsPath, defaultAssets));
let pushLog = normalizePushLog(loadJson(pushPath, []));
let refreshInFlight = false;
let refreshTimer = null;
const rateBuckets = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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

function isLoopbackHost(value) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(value).toLowerCase());
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

function normalizeMemory(input) {
  const value = input && typeof input === "object" ? input : {};
  const stats = value.stats && typeof value.stats === "object" ? value.stats : {};
  return {
    topics: Array.isArray(value.topics) ? value.topics : [],
    jobs: Array.isArray(value.jobs) ? value.jobs.slice(0, 80) : [],
    history: isRecord(value.history) ? value.history : {},
    stats: {
      ...emptyStats(),
      ...stats,
      discovered: finiteNumber(stats.discovered, 0, { min: 0, integer: true }),
      hot: finiteNumber(stats.hot, 0, { min: 0, integer: true }),
      generated: finiteNumber(stats.generated, 0, { min: 0, integer: true }),
      pushed: finiteNumber(stats.pushed, 0, { min: 0, integer: true }),
      failedSources: finiteNumber(stats.failedSources, 0, { min: 0, integer: true }),
      activeSources: finiteNumber(stats.activeSources, 0, { min: 0, integer: true }),
    },
    lastRefreshAt: typeof value.lastRefreshAt === "string" ? value.lastRefreshAt : null,
  };
}

function normalizeAssets(input) {
  if (!Array.isArray(input)) return structuredClone(defaultAssets);
  return input.map((asset, index) => ({
    id: String(asset?.id || `asset-${index}`),
    type: String(asset?.type || "素材").slice(0, 60),
    name: String(asset?.name || "未命名素材").slice(0, 120),
    description: String(asset?.description || "").slice(0, 2000),
    tags: Array.isArray(asset?.tags) ? asset.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 20) : [],
  }));
}

function normalizePushLog(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 200).map((entry, index) => ({
    id: String(entry?.id || `push-${index}`),
    text: String(entry?.text || "").slice(0, 4096),
    createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : nowIso(),
    status: String(entry?.status || "unknown"),
    target: String(entry?.target || "local"),
    ...(entry?.error ? { error: String(entry.error).slice(0, 500) } : {}),
  }));
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const normalized = integer ? Math.round(number) : number;
  return Math.max(min, Math.min(max, normalized));
}

function stringList(value, fallback) {
  const rows = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : fallback;
  return rows.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeSettings(input = {}) {
  const sourceValues = input.sources || {};
  const sourceConfig = input.sourceConfig || {};
  const next = {
    ...defaultSettings,
    ...input,
    sources: Object.fromEntries(
      Object.entries(defaultSettings.sources).map(([key, fallback]) => [key, parseBool(sourceValues[key], fallback)]),
    ),
    sourceConfig: {
      ...defaultSettings.sourceConfig,
      ...sourceConfig,
      twitter: { ...defaultSettings.sourceConfig.twitter, ...(sourceConfig.twitter || {}) },
      weibo: { ...defaultSettings.sourceConfig.weibo, ...(sourceConfig.weibo || {}) },
      github: { ...defaultSettings.sourceConfig.github, ...(sourceConfig.github || {}) },
      reddit: { ...defaultSettings.sourceConfig.reddit, ...(sourceConfig.reddit || {}) },
      tiktok: { ...defaultSettings.sourceConfig.tiktok, ...(sourceConfig.tiktok || {}) },
      instagram: { ...defaultSettings.sourceConfig.instagram, ...(sourceConfig.instagram || {}) },
      huggingFace: { ...defaultSettings.sourceConfig.huggingFace, ...(sourceConfig.huggingFace || {}) },
      openaiBlog: { ...defaultSettings.sourceConfig.openaiBlog, ...(sourceConfig.openaiBlog || {}) },
      deepmind: { ...defaultSettings.sourceConfig.deepmind, ...(sourceConfig.deepmind || {}) },
      anthropic: { ...defaultSettings.sourceConfig.anthropic, ...(sourceConfig.anthropic || {}) },
      glassnode: { ...defaultSettings.sourceConfig.glassnode, ...(sourceConfig.glassnode || {}) },
      coinMarketCap: { ...defaultSettings.sourceConfig.coinMarketCap, ...(sourceConfig.coinMarketCap || {}) },
      wikipedia: { ...defaultSettings.sourceConfig.wikipedia, ...(sourceConfig.wikipedia || {}) },
      youtube: { ...defaultSettings.sourceConfig.youtube, ...(sourceConfig.youtube || {}) },
    },
    telegram: { ...defaultSettings.telegram, ...(input.telegram || {}) },
    feishu: { ...defaultSettings.feishu, ...(input.feishu || {}) },
  };
  return {
    ...next,
    refreshIntervalMinutes: finiteNumber(next.refreshIntervalMinutes, defaultSettings.refreshIntervalMinutes, { min: 1, max: 1440, integer: true }),
    heatThreshold: finiteNumber(next.heatThreshold, defaultSettings.heatThreshold, { min: 0, max: 100 }),
    riskThreshold: ["低", "中", "高"].includes(next.riskThreshold) ? next.riskThreshold : defaultSettings.riskThreshold,
    keywords: stringList(next.keywords, defaultSettings.keywords),
    blockedWords: stringList(next.blockedWords, defaultSettings.blockedWords),
    sourceConfig: {
      ...next.sourceConfig,
      twitter: {
        ...next.sourceConfig.twitter,
        maxResults: finiteNumber(next.sourceConfig.twitter.maxResults, defaultSettings.sourceConfig.twitter.maxResults, { min: 10, max: 100, integer: true }),
        queryMaxChars: finiteNumber(next.sourceConfig.twitter.queryMaxChars, defaultSettings.sourceConfig.twitter.queryMaxChars, { min: 1, max: 4096, integer: true }),
      },
    },
    telegram: { ...next.telegram, enabled: parseBool(next.telegram.enabled, defaultSettings.telegram.enabled) },
    feishu: { ...next.feishu, enabled: parseBool(next.feishu.enabled, defaultSettings.feishu.enabled) },
  };
}

function clientSettings() {
  const value = structuredClone(settings);
  const secretPaths = [
    ["sourceConfig", "twitter", "bearerToken"],
    ["sourceConfig", "github", "token"],
    ["sourceConfig", "glassnode", "apiKey"],
    ["sourceConfig", "coinMarketCap", "apiKey"],
    ["telegram", "botToken"],
    ["feishu", "webhookUrl"],
    ["feishu", "secret"],
  ];
  for (const path of secretPaths) {
    let target = value;
    for (const segment of path.slice(0, -1)) target = target?.[segment];
    const key = path.at(-1);
    if (target?.[key]) target[key] = redactedSecret;
  }
  return value;
}

function preserveRedactedSecret(value, current) {
  return value === redactedSecret ? current : value;
}

function persist() {
  writeJsonAtomic(statePath, memory);
  writeJsonAtomic(settingsPath, settings);
  writeJsonAtomic(assetsPath, assets);
  writeJsonAtomic(pushPath, pushLog.slice(0, 200));
}

function writeJsonAtomic(path, value) {
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(value, null, 2));
  renameSync(tempPath, path);
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
  const recency = Math.max(0, 34 - Math.sqrt(minutesAgo(raw.publishedAt)) * 2.1);
  const engagementBase = Math.max(0, Number(raw.score || 0) + Number(raw.comments || 0) * 2);
  const engagement = Math.min(42, Math.log1p(engagementBase) * 5.5);
  const sourceWeight =
    raw.platform === "X"
      ? 12
      : raw.platform === "微博"
        ? 12
        : raw.platform === "TikTok" || raw.platform === "Instagram"
          ? 11
          : raw.platform === "GitHub"
            ? 10
            : raw.platform === "CoinGecko"
              ? 10
              : raw.platform === "Hacker News"
                ? 10
                : raw.platform === "arXiv"
                  ? 8
                  : 6;
  return Math.max(0, Math.min(99.8, recency + engagement + sourceWeight));
}

function historyFor(topicId) {
  const history = memory.history?.[topicId];
  return Array.isArray(history) ? history.filter((row) => Number.isFinite(row?.heat)) : [];
}

function trendFor(history, currentHeat) {
  const values = [...history.slice(-10).map((row) => row.heat), currentHeat];
  return values.length < 2 ? [currentHeat, currentHeat] : values;
}

function boostFor(history, currentHeat) {
  const previous = history.at(-1)?.heat;
  if (!Number.isFinite(previous) || previous <= 0) return 0;
  return Math.round(((currentHeat - previous) / previous) * 100);
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
    region: raw.region || regionFor(text),
    heat: Number(heat.toFixed(1)),
    boost: 0,
    sentiment: sentimentFor(text, risk),
    risk,
    url: raw.url || "",
    author: raw.author || raw.source || raw.platform,
    publishedAt: raw.publishedAt || nowIso(),
    crawledAt: nowIso(),
    score: raw.score || 0,
    commentsCount: raw.comments || 0,
    trend: [heat, heat],
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

function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const lower = String(address).toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:") || lower.startsWith("::ffff:127.");
}

async function assertSafeUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid external URL");
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("External URL must use http(s) without credentials");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "metadata.google.internal") {
    throw new Error("Private external hosts are not allowed");
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) throw new Error("Private external IPs are not allowed");
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Private external IPs are not allowed");
  } catch (error) {
    if (error.message === "Private external IPs are not allowed") throw error;
    throw new Error(`Unable to resolve external host: ${hostname}`);
  }
  return parsed;
}

async function fetchWithPolicy(url, options = {}) {
  let nextUrl = String(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertSafeUrl(nextUrl);
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    const response = await fetch(nextUrl, {
      ...fetchOptions,
      signal: AbortSignal.timeout(options.timeoutMs || 9000),
      redirect: "manual",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("Too many external redirects");
    nextUrl = new URL(location, nextUrl).toString();
  }
  throw new Error("Too many external redirects");
}

async function readResponseText(response, limit = 2 * 1024 * 1024) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) throw new Error("External response is too large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("External response is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchJson(url, options = {}) {
  const res = await fetchWithPolicy(url, {
    ...options,
    headers: { "user-agent": "ai-hottopics/0.1 (+local research dashboard)", accept: "application/json,text/plain,*/*", ...(options.headers || {}) },
  });
  const text = await readResponseText(res);
  if (!res.ok) {
    const detail = stripHtml(text).slice(0, 240);
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return text ? JSON.parse(text) : {};
}

async function fetchText(url) {
  const res = await fetchWithPolicy(url, {
    headers: {
      "user-agent": "ai-hottopics/0.1 (+local research dashboard)",
      accept: "application/rss+xml,text/xml,text/plain,*/*",
    },
  });
  const text = await readResponseText(res);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return text;
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

function valueText(value) {
  if (Array.isArray(value)) return valueText(value[0]);
  if (value && typeof value === "object") return value["#cdata"] || value["#text"] || "";
  return value === undefined || value === null ? "" : String(value);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function feedLink(value) {
  for (const link of arrayValue(value)) {
    if (typeof link === "string") return link;
    if (link && typeof link === "object" && link["@_href"]) return String(link["@_href"]);
  }
  return "";
}

function parseFeed(xml) {
  let document;
  try {
    document = xmlParser.parse(xml);
  } catch (error) {
    throw new Error(`Invalid feed XML: ${safeError(error)}`);
  }
  const rssItems = document.rss?.channel?.item || document["rdf:RDF"]?.item;
  const atomItems = document.feed?.entry;
  return arrayValue(rssItems || atomItems);
}

function parseAtom(xml, source) {
  return parseFeed(xml).slice(0, 18).map((entry) => ({
    platform: "arXiv",
    source,
    title: valueText(entry.title),
    desc: valueText(entry.summary || entry.content),
    url: feedLink(entry.link),
    author: source,
    publishedAt: valueText(entry.published || entry.updated) || undefined,
    score: 130,
    comments: 10,
  }));
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
  for (const [index, item] of parseFeed(xml).slice(0, 25).entries()) {
    items.push({
      platform,
      source,
      title: valueText(item.title),
      desc: valueText(item.description || item["content:encoded"] || item.summary || item.content),
      url: feedLink(item.link || item.guid),
      author: source,
      publishedAt: valueText(item.pubDate || item.published || item.updated) || undefined,
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
  if (refreshInFlight) return null;
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

  try {
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
  let nextTask = 0;
  async function worker() {
    while (nextTask < sourceTasks.length) {
      const taskIndex = nextTask;
      nextTask += 1;
      const [, name, fn] = sourceTasks[taskIndex];
      const started = Date.now();
      try {
        const items = await fn();
        raw.push(...items);
        job.sources.push({ name, status: "ok", count: items.length, ms: Date.now() - started });
      } catch (error) {
        job.sources.push({ name, status: "failed", count: 0, ms: Date.now() - started, error: safeError(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(sourceConcurrency, sourceTasks.length) }, () => worker()));

    const merged = new Map();
    for (const item of raw) {
      if (!item.title) continue;
      const normalized = normalizeTopic(item);
      const key = normalized.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "").slice(0, 42);
      const existing = merged.get(key);
      if (!existing || normalized.heat > existing.heat) merged.set(key, normalized);
    }

    const oldTopics = new Map(memory.topics.map((topic) => [topic.id, topic]));
    const nextHistory = { ...(memory.history || {}) };
    memory.topics = [...merged.values()]
      .map((topic) => {
        const old = oldTopics.get(topic.id);
        const history = historyFor(topic.id);
        const heat = Number(topic.heat.toFixed(1));
        nextHistory[topic.id] = [...history, { at: topic.crawledAt, heat }].slice(-48);
        return {
          ...topic,
          firstSeenAt: old?.firstSeenAt || topic.crawledAt,
          heat,
          boost: boostFor(history, heat),
          trend: trendFor(history, heat),
        };
      })
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 120);
    const activeTopicIds = new Set(memory.topics.map((topic) => topic.id));
    memory.history = Object.fromEntries(Object.entries(nextHistory).filter(([id]) => activeTopicIds.has(id)));

    const failedSources = job.sources.filter((source) => source.status === "failed").length;
    job.status = failedSources === 0 ? "success" : raw.length > 0 ? "partial" : "failed";
    job.finishedAt = nowIso();
    job.message = `抓取 ${raw.length} 条，归并 ${memory.topics.length} 个热点${failedSources ? `，${failedSources} 个数据源失败` : ""}`;
    memory.lastRefreshAt = nowIso();
    memory.stats = {
      discovered: memory.topics.length,
      hot: memory.topics.filter((topic) => topic.heat >= settings.heatThreshold).length,
      generated: memory.stats.generated || 0,
      pushed: pushLog.filter((item) => item.status === "sent" || item.status === "simulated").length,
      failedSources,
      activeSources: job.sources.filter((source) => source.status === "ok").length,
    };
    persist();
    return memory;
  } catch (error) {
    job.status = "failed";
    job.finishedAt = nowIso();
    job.message = error.message || "抓取失败";
    memory.stats = {
      ...memory.stats,
      failedSources: job.sources.filter((source) => source.status === "failed").length,
      activeSources: job.sources.filter((source) => source.status === "ok").length,
    };
    persist();
    throw error;
  } finally {
    refreshInFlight = false;
  }
}

function filteredTopics(query) {
  const params = new URLSearchParams(query);
  const platform = params.get("platform") || "全部";
  const category = params.get("category") || "全部";
  const region = params.get("region") || "全部";
  const timeWindow = params.get("timeWindow") || "24h";
  const keyword = (params.get("q") || "").toLowerCase().trim();
  const windowMinutes = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 }[timeWindow];
  return memory.topics.filter((topic) => {
    const platformOk = platform === "全部" || topic.platform === platform;
    const categoryOk = category === "全部" || topic.category === category;
    const regionOk = region === "全部" || topic.region === region;
    const ageMinutes = minutesAgo(topic.publishedAt);
    const timeOk = !windowMinutes || ageMinutes <= windowMinutes;
    const keywordOk = !keyword || `${topic.title} ${topic.desc} ${topic.keywords.join(" ")}`.toLowerCase().includes(keyword);
    return platformOk && categoryOk && regionOk && timeOk && keywordOk;
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
  const buckets = new Map();
  for (const topic of memory.topics) {
    const timestamp = new Date(topic.publishedAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const bucket = new Date(timestamp);
    bucket.setMinutes(0, 0, 0);
    const label = bucket.toISOString();
    const row = buckets.get(label) || { label, heat: 0, count: 0 };
    row.heat += topic.heat;
    row.count += 1;
    buckets.set(label, row);
  }
  const timeline = [...buckets.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-24)
    .map((row) => ({ ...row, heat: Number((row.heat / row.count).toFixed(1)), label: row.label.slice(0, 13) }));
  return { byCategory, byPlatform, byRisk, timeline };
}

function groupCount(rows, field) {
  const map = new Map();
  for (const row of rows) map.set(row[field], (map.get(row[field]) || 0) + 1);
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

async function readBody(req) {
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) throw new HttpError(413, "Request body is too large");
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) throw new HttpError(413, "Request body is too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Request body must be a JSON object");
  return body;
}

function safeError(error) {
  return String(error?.message || error || "Unknown error").replace(/(?:token|secret|api[_-]?key)=?[^\s&]+/gi, (value) => `${value.split(/[=:]/, 1)[0]}=[redacted]`).slice(0, 500);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, field, { min = 0, max = 4096 } = {}) {
  if (typeof value !== "string") throw new HttpError(400, `${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new HttpError(400, `${field} length must be between ${min} and ${max}`);
  return normalized;
}

function isAuthorized(req) {
  if (!requireAuth) return true;
  const value = req.headers.authorization || "";
  const [scheme, token] = value.split(" ");
  if (scheme !== "Bearer" || !token || !adminToken) return false;
  const expected = Buffer.from(adminToken);
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function enforceMutationRateLimit(req) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    if (rateBuckets.size > 10_000) {
      for (const [candidate, value] of rateBuckets) {
        if (now - value.startedAt >= 60_000) rateBuckets.delete(candidate);
      }
    }
    return;
  }
  bucket.count += 1;
  if (bucket.count > mutationRateLimit) throw new HttpError(429, "Too many requests");
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}

function json(res, payload, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...securityHeaders(),
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(distDir, `.${pathname}`);
  const staticRelativePath = relative(distDir, filePath);
  const outsideDist = staticRelativePath.startsWith("..") || isAbsolute(staticRelativePath);
  if (outsideDist || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const indexPath = join(distDir, "index.html");
    if (existsSync(indexPath)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...securityHeaders() });
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
  res.writeHead(200, { "content-type": type, ...securityHeaders() });
  res.end(readFileSync(filePath));
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, { ok: true, lastRefreshAt: memory.lastRefreshAt, topics: memory.topics.length, refreshInFlight });
  }
  if (!isAuthorized(req)) return json(res, { error: "Unauthorized" }, 401);
  enforceMutationRateLimit(req);
  if (req.method === "GET" && url.pathname === "/api/topics") {
    return json(res, { topics: filteredTopics(url.search), stats: memory.stats, lastRefreshAt: memory.lastRefreshAt });
  }
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    const next = await runRefresh({ manual: true });
    if (!next) return json(res, { error: "Refresh already in progress", refreshInFlight: true }, 409);
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
    return json(res, { settings: clientSettings() });
  }
  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    for (const key of ["sources", "sourceConfig", "telegram", "feishu"]) {
      if (body[key] !== undefined && !isRecord(body[key])) throw new HttpError(400, `${key} must be an object`);
    }
    const sourceConfig = body.sourceConfig || {};
    settings = normalizeSettings({
      ...settings,
      ...body,
      sources: { ...settings.sources, ...(body.sources || {}) },
      sourceConfig: {
        ...settings.sourceConfig,
        ...sourceConfig,
        twitter: { ...settings.sourceConfig.twitter, ...(sourceConfig.twitter || {}), ...(sourceConfig.twitter?.bearerToken ? { bearerToken: preserveRedactedSecret(sourceConfig.twitter.bearerToken, settings.sourceConfig.twitter.bearerToken) } : {}) },
        weibo: { ...settings.sourceConfig.weibo, ...(body.sourceConfig?.weibo || {}) },
        github: { ...settings.sourceConfig.github, ...(sourceConfig.github || {}), ...(sourceConfig.github?.token ? { token: preserveRedactedSecret(sourceConfig.github.token, settings.sourceConfig.github.token) } : {}) },
        reddit: { ...settings.sourceConfig.reddit, ...(body.sourceConfig?.reddit || {}) },
        tiktok: { ...settings.sourceConfig.tiktok, ...(body.sourceConfig?.tiktok || {}) },
        instagram: { ...settings.sourceConfig.instagram, ...(body.sourceConfig?.instagram || {}) },
        huggingFace: { ...settings.sourceConfig.huggingFace, ...(body.sourceConfig?.huggingFace || {}) },
        openaiBlog: { ...settings.sourceConfig.openaiBlog, ...(body.sourceConfig?.openaiBlog || {}) },
        deepmind: { ...settings.sourceConfig.deepmind, ...(body.sourceConfig?.deepmind || {}) },
        anthropic: { ...settings.sourceConfig.anthropic, ...(body.sourceConfig?.anthropic || {}) },
        glassnode: { ...settings.sourceConfig.glassnode, ...(sourceConfig.glassnode || {}), ...(sourceConfig.glassnode?.apiKey ? { apiKey: preserveRedactedSecret(sourceConfig.glassnode.apiKey, settings.sourceConfig.glassnode.apiKey) } : {}) },
        coinMarketCap: { ...settings.sourceConfig.coinMarketCap, ...(sourceConfig.coinMarketCap || {}), ...(sourceConfig.coinMarketCap?.apiKey ? { apiKey: preserveRedactedSecret(sourceConfig.coinMarketCap.apiKey, settings.sourceConfig.coinMarketCap.apiKey) } : {}) },
        wikipedia: { ...settings.sourceConfig.wikipedia, ...(body.sourceConfig?.wikipedia || {}) },
        youtube: { ...settings.sourceConfig.youtube, ...(body.sourceConfig?.youtube || {}) },
      },
      telegram: { ...settings.telegram, ...(body.telegram || {}), ...(body.telegram?.botToken ? { botToken: preserveRedactedSecret(body.telegram.botToken, settings.telegram.botToken) } : {}) },
      feishu: {
        ...settings.feishu,
        ...(body.feishu || {}),
        ...(body.feishu?.webhookUrl ? { webhookUrl: preserveRedactedSecret(body.feishu.webhookUrl, settings.feishu.webhookUrl) } : {}),
        ...(body.feishu?.secret ? { secret: preserveRedactedSecret(body.feishu.secret, settings.feishu.secret) } : {}),
      },
    });
    persist();
    scheduleAutoRefresh();
    return json(res, { ok: true, settings: clientSettings() });
  }
  if (req.method === "GET" && url.pathname === "/api/assets") {
    return json(res, { assets });
  }
  if (req.method === "POST" && url.pathname === "/api/assets") {
    const body = await readBody(req);
    const name = boundedString(body.name || "", "name", { min: 1, max: 120 });
    const type = body.type === undefined ? "素材" : boundedString(body.type, "type", { max: 60 });
    const description = body.description === undefined ? "" : boundedString(body.description, "description", { max: 2000 });
    if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 20 || body.tags.some((tag) => typeof tag !== "string" || tag.length > 40))) {
      throw new HttpError(400, "tags must be an array of at most 20 strings");
    }
    const asset = { id: idFor(`${Date.now()}:${name}`), type, name, description, tags: body.tags || [] };
    assets.unshift(asset);
    persist();
    return json(res, { ok: true, asset, assets });
  }
  if (req.method === "POST" && url.pathname === "/api/content/generate") {
    const body = await readBody(req);
    const topic = memory.topics.find((item) => item.id === body.topicId) || memory.topics[0];
    if (!topic) return json(res, { error: "暂无热点，请先刷新抓取" }, 400);
    const mode = body.mode || "快讯版";
    if (!copyModes.includes(mode)) throw new HttpError(400, "Unsupported content mode");
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
    const text = boundedString(body.text || "", "text", { min: 1, max: 4096 });
    const target = body.target || "local";
    if (!["local", "telegram", "feishu"].includes(target)) throw new HttpError(400, "Unsupported push target");
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
    if (String(req.url || "").startsWith("/api/")) return await handleApi(req, res);
    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return json(res, { error: error.message || "Internal error" }, error instanceof HttpError ? error.status : 500);
  }
});

server.listen(port, host, async () => {
  console.log(`AI hot topics API listening on http://${host}:${port}`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`Authentication: ${requireAuth ? "enabled" : "disabled (loopback only)"}`);
  scheduleAutoRefresh();
  if (initialRefresh) {
    runRefresh({ manual: false }).catch((error) => console.error("initial refresh failed", error));
  }
});

function shutdown(signal) {
  if (refreshTimer) clearInterval(refreshTimer);
  server.close(() => {
    console.log(`Received ${signal}, server stopped`);
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
