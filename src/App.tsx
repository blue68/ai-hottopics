import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  Copy,
  Crosshair,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  HelpCircle,
  KeyRound,
  Library,
  LockKeyhole,
  MessageCircle,
  PenSquare,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

type RiskLevel = "低" | "中" | "高";
type ViewKey = "dashboard" | "hotlist" | "radar" | "factory" | "push" | "assets" | "tasks" | "analytics" | "settings";

type Topic = {
  id: string;
  title: string;
  desc: string;
  platform: string;
  source: string;
  category: string;
  region: string;
  heat: number;
  boost: number;
  sentiment: string;
  risk: RiskLevel;
  url: string;
  author: string;
  publishedAt: string;
  crawledAt: string;
  score: number;
  commentsCount: number;
  trend: number[];
  keywords: string[];
  summary: string;
  comments: Array<{ author: string; handle: string; avatar: string; text: string; replies: string; shares: string; likes: string }>;
  publishCopy: Record<string, string>;
};

type Stats = {
  discovered: number;
  hot: number;
  generated: number;
  pushed: number;
  failedSources: number;
  activeSources: number;
};

type Job = {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  message: string;
  sources: Array<{ name: string; status: string; count: number; ms: number; error?: string }>;
};

type SettingsModel = {
  refreshIntervalMinutes: number;
  heatThreshold: number;
  riskThreshold: string;
  sources: Record<string, boolean>;
  sourceConfig: {
    twitter: { bearerToken: string; query: string; lang: string; maxResults: number; queryMaxChars: number };
    weibo: { mode: string; rsshubBaseUrl: string; rssUrl: string };
    github: { token: string };
    reddit: { userAgent: string };
    tiktok: { rssUrl: string; sourceName: string };
    instagram: { rssUrl: string; sourceName: string };
    huggingFace: { rssUrl: string; sourceName: string };
    openaiBlog: { rssUrl: string; sourceName: string };
    deepmind: { rssUrl: string; sourceName: string };
    anthropic: { rssUrl: string; sourceName: string };
    glassnode: { apiKey: string; asset: string; metric: string; interval: string };
    coinMarketCap: { apiKey: string; endpoint: string };
    wikipedia: { language: string; sourceName: string };
    youtube: { rssUrl: string; sourceName: string };
  };
  keywords: string[];
  blockedWords: string[];
  telegram: { enabled: boolean; botToken: string; chatId: string };
  feishu: { enabled: boolean; webhookUrl: string; secret: string };
};

type Asset = { id: string; type: string; name: string; description: string; tags: string[] };
type PushChannel = "local" | "telegram" | "feishu";
type PushLogEntry = { id: string; text: string; createdAt: string; status: string; target: string; error?: string };
type PushChannels = Record<PushChannel, boolean>;
type KeywordRow = { keyword: string; count: number; heat: number; risk: number; topics: string[] };
type AnalyticsModel = {
  byCategory: Array<{ name: string; value: number }>;
  byPlatform: Array<{ name: string; value: number }>;
  byRisk: Array<{ name: string; value: number }>;
  timeline: Array<{ label: string; heat: number; count: number }>;
};

const copyModes = ["快讯版", "锐评版", "Thread版", "Meme版", "带节奏版"];
const categories = ["全部", "AI", "Crypto", "地缘政治", "猎奇", "整活/Meme", "生活百科"];
const regions = ["全球", "中国", "美国", "日本", "韩国"];
const sourcePlatformLabels: Record<string, string> = {
  twitter: "X",
  weibo: "微博",
  hackerNews: "Hacker News",
  arxiv: "arXiv",
  googleNews: "Google News",
  github: "GitHub",
  reddit: "Reddit",
  coingecko: "CoinGecko",
  tiktok: "TikTok",
  instagram: "Instagram",
  huggingFace: "Hugging Face",
  openaiBlog: "OpenAI 官方博客",
  deepmind: "Google DeepMind",
  anthropic: "Anthropic",
  glassnode: "Glassnode",
  coinMarketCap: "CoinMarketCap",
  wikipedia: "Wikipedia",
  youtube: "YouTube",
};
const configurableSources = new Set([
  "twitter",
  "weibo",
  "github",
  "reddit",
  "tiktok",
  "instagram",
  "huggingFace",
  "openaiBlog",
  "deepmind",
  "anthropic",
  "glassnode",
  "coinMarketCap",
  "wikipedia",
  "youtube",
]);
const pushChannelLabels: Record<PushChannel, string> = {
  local: "本地记录（仅日志）",
  telegram: "Telegram",
  feishu: "飞书机器人",
};

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Gauge; badge?: string }> = [
  { key: "dashboard", label: "Dashboard", icon: Gauge },
  { key: "hotlist", label: "热点榜", icon: Flame, badge: "HOT" },
  { key: "radar", label: "关键词雷达", icon: Crosshair },
  { key: "factory", label: "内容工厂", icon: PenSquare },
  { key: "push", label: "推送中心", icon: Send },
  { key: "assets", label: "账号素材库", icon: LockKeyhole },
  { key: "tasks", label: "任务 & 监控", icon: Activity },
  { key: "analytics", label: "数据分析", icon: BarChart3 },
  { key: "settings", label: "设置中心", icon: Settings },
];

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) throw new Error((await response.json()).error || response.statusText);
  return response.json();
}

function classNames(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

function preferredPushTarget(channels: PushChannels): PushChannel {
  if (channels.feishu) return "feishu";
  if (channels.telegram) return "telegram";
  return "local";
}

async function copyText(value: string) {
  if (!value) return;
  await navigator.clipboard?.writeText(value);
}

function timeAgo(value?: string | null) {
  if (!value) return "从未";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
}

function riskClass(risk: string) {
  return risk === "高" ? "high" : risk === "中" ? "medium" : "low";
}

function Sparkline({ values, color = "#38bdf8" }: { values: number[]; color?: string }) {
  const width = 96;
  const height = 34;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / Math.max(max - min, 1)) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="趋势">
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniBars({ rows }: { rows: Array<{ name: string; value: number }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="mini-bars">
      {rows.map((row) => (
        <div key={row.name}>
          <span>{row.name}</span>
          <i style={{ width: `${(row.value / max) * 100}%` }} />
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  );
}

function groupTopicCounts(topics: Topic[], field: keyof Topic) {
  const counts = new Map<string, number>();
  for (const topic of topics) {
    const value = String(topic[field] || "");
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function Sidebar({
  activeView,
  setActiveView,
  stats,
}: {
  activeView: ViewKey;
  setActiveView: (view: ViewKey) => void;
  stats: Stats;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Target size={22} />
        </div>
        <div>
          <strong>热点狙击系统</strong>
          <span>抓取、分析、生成、推送闭环</span>
        </div>
      </div>
      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button className={classNames("nav-item", activeView === item.key && "active")} key={item.key} onClick={() => setActiveView(item.key)}>
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge && <em>{item.badge}</em>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-card push-card">
        <button className="ghost-icon" aria-label="关闭推送提示">
          <X size={16} />
        </button>
        <strong>追踪任务运行中</strong>
        <span>
          <i />
          {stats.activeSources} 个数据源可用
        </span>
        <button onClick={() => setActiveView("tasks")}>查看任务</button>
      </div>
      <div className="sidebar-card stats-card">
        <strong>今日数据概览</strong>
        <div>
          <span>发现热点</span>
          <b>{stats.discovered}</b>
        </div>
        <div>
          <span>高热热点</span>
          <b>{stats.hot}</b>
        </div>
        <div>
          <span>推文生成</span>
          <b>{stats.generated}</b>
        </div>
        <div>
          <span>推送成功</span>
          <b>{stats.pushed}</b>
        </div>
      </div>
      <div className="profile">
        <div className="avatar">AI</div>
        <div>
          <strong>HotTopics Agent</strong>
          <span>local crawler</span>
        </div>
        <em>SYS</em>
      </div>
    </aside>
  );
}

function Header({
  query,
  setQuery,
  refresh,
  refreshing,
  lastRefreshAt,
  alertCount,
  openTasks,
  openHelp,
}: {
  query: string;
  setQuery: (value: string) => void;
  refresh: () => void;
  refreshing: boolean;
  lastRefreshAt: string | null;
  alertCount: number;
  openTasks: () => void;
  openHelp: () => void;
}) {
  const badgeLabel = alertCount > 99 ? "99+" : String(alertCount);
  return (
    <header className="topbar">
      <label className="searchbox">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索关键词 / 话题 / 来源" />
        <kbd>/</kbd>
      </label>
      <div className="system-status">
        <span>最近抓取：{timeAgo(lastRefreshAt)}</span>
        <button onClick={refresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          {refreshing ? "抓取中" : "立即抓取"}
        </button>
      </div>
      <div className="top-actions">
        <button aria-label={`通知${alertCount ? `，${alertCount} 条告警` : ""}`} className="icon-button" onClick={openTasks} title="查看任务与告警">
          <Bell size={19} />
          {alertCount > 0 && <span className="notification-badge">{badgeLabel}</span>}
        </button>
        <button aria-label="帮助" className="icon-button" onClick={openHelp} title="查看配置帮助">
          <HelpCircle size={19} />
        </button>
      </div>
    </header>
  );
}

function FilterBar({
  platform,
  setPlatform,
  category,
  setCategory,
  region,
  setRegion,
  platforms,
}: {
  platform: string;
  setPlatform: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  region: string;
  setRegion: (value: string) => void;
  platforms: string[];
}) {
  return (
    <section className="filters">
      <div className="filter-group">
        <span>平台</span>
        <div className="chip-row">
          {["全部", ...platforms].map((item) => (
            <button className={platform === item ? "active" : ""} key={item} onClick={() => setPlatform(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span>分类</span>
        <div className="chip-row">
          {categories.map((item) => (
            <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span>时间窗口</span>
        <div className="chip-row">
          {["15分钟", "1小时", "6小时", "24小时", "7天"].map((item) => (
            <button className={item === "24小时" ? "active subtle-active" : ""} key={item}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group region-filter">
        <span>地区</span>
        <div className="chip-row">
          {regions.map((item) => (
            <button className={region === item ? "active" : ""} key={item} onClick={() => setRegion(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function TopicTable({ topics, selectedId, setSelectedId }: { topics: Topic[]; selectedId?: string; setSelectedId: (id: string) => void }) {
  return (
    <section className="panel hot-list">
      <div className="panel-title-row">
        <div className="panel-title">实时热点榜</div>
        <span className="updated">公开源实时抓取与归并排序</span>
      </div>
      <div className="table-head">
        <span>#</span>
        <span>话题 / 内容</span>
        <span>平台</span>
        <span>热度值</span>
        <span>增速</span>
        <span>趋势</span>
      </div>
      <div className="topic-list">
        {topics.slice(0, 30).map((topic, index) => {
          const color = index < 3 ? ["#ff385c", "#ff8c1a", "#ffca3a"][index] : "#7c8baa";
          return (
            <button className={classNames("topic-row", selectedId === topic.id && "selected")} key={topic.id} onClick={() => setSelectedId(topic.id)}>
              <span className="rank" style={{ background: color }}>
                {index + 1}
              </span>
              <span className="topic-main">
                <strong>{topic.title}</strong>
                <em>{topic.desc}</em>
              </span>
              <span className="platform-text">{topic.platform}</span>
              <span className="heat-cell">
                <b>{topic.heat.toFixed(1)}</b>
                <i style={{ width: `${topic.heat}%` }} />
              </span>
              <span className="boost">+{topic.boost}%</span>
              <Sparkline values={topic.trend} color={index % 2 ? "#ff9f43" : "#3bd671"} />
            </button>
          );
        })}
      </div>
      {!topics.length && <div className="empty-state">暂无热点数据，点击右上角“立即抓取”。</div>}
    </section>
  );
}

function TopicDetail({ topic, onFactory }: { topic?: Topic; onFactory: () => void }) {
  const [mode, setMode] = useState(copyModes[0]);
  if (!topic) {
    return (
      <section className="panel detail-empty">
        <Database size={34} />
        <strong>等待热点数据</strong>
        <span>完成一次抓取后，这里会展示 AI 摘要、风险和生成文案。</span>
      </section>
    );
  }
  return (
    <section className="detail-grid">
      <div className="panel topic-detail">
        <div className="panel-title-row">
          <div className="panel-title">
            热点详情
            <span className={`tag risk-${riskClass(topic.risk)}`}>风险 {topic.risk}</span>
            <span className="tag ai-tag">{topic.category}</span>
          </div>
          <span className="topic-id">{topic.source}</span>
        </div>
        <article className="source-card">
          <h2>{topic.title}</h2>
          <div className="source-meta">
            <span>{topic.platform}</span>
            <span>@{topic.author || topic.source}</span>
            <span>{timeAgo(topic.publishedAt)}</span>
            <a href={topic.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> 原始链接
            </a>
          </div>
          <div className="summary-block detail-summary">
            <strong>AI 摘要</strong>
            <p>{topic.summary}</p>
          </div>
          <div className="keyword-tags">
            <strong>关键词</strong>
            <div>
              {topic.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </div>
          <div className="engagements">
            <span>
              <MessageCircle size={16} /> {topic.commentsCount}
            </span>
            <span>
              <TrendingUp size={16} /> {topic.score}
            </span>
            <span>
              <ShieldAlert size={16} /> {topic.risk}
            </span>
            <button onClick={onFactory}>
              <PenSquare size={15} /> 进入内容工厂
            </button>
          </div>
        </article>
      </div>
      <div className="panel ai-summary">
        <div className="summary-block">
          <strong>生成预览</strong>
          <p>{topic.publishCopy[mode]}</p>
        </div>
        <div className="copy-tabs vertical-tabs">
          {copyModes.map((item) => (
            <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="panel comments-panel">
        <div className="panel-title">观点提炼</div>
        <div className="comments-list">
          {topic.comments.map((comment) => (
            <div className="comment" key={`${comment.author}-${comment.text}`}>
              <div className="small-avatar">{comment.avatar}</div>
              <div>
                <strong>
                  {comment.author}
                  <span>{comment.handle}</span>
                </strong>
                <p>{comment.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel risk-panel">
        <div className="panel-title">风险评估</div>
        <dl>
          <div>
            <dt>敏感性</dt>
            <dd className={riskClass(topic.risk)}>{topic.risk}</dd>
          </div>
          <div>
            <dt>情绪倾向</dt>
            <dd className={riskClass(topic.sentiment === "警惕" ? "高" : "低")}>{topic.sentiment}</dd>
          </div>
          <div>
            <dt>谣言概率</dt>
            <dd className={riskClass(topic.risk === "高" ? "中" : "低")}>{topic.risk === "高" ? "中" : "低"}</dd>
          </div>
          <div>
            <dt>适合发布</dt>
            <dd className={riskClass(topic.risk === "高" ? "中" : "低")}>{topic.risk === "高" ? "谨慎" : "适合"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function DashboardPage({
  topics,
  stats,
  selected,
  setSelectedId,
  setActiveView,
  analytics,
  heatThreshold = 72,
}: {
  topics: Topic[];
  stats: Stats;
  selected?: Topic;
  setSelectedId: (id: string) => void;
  setActiveView: (view: ViewKey) => void;
  analytics?: AnalyticsModel;
  heatThreshold?: number;
}) {
  const dashboardStats = {
    ...stats,
    discovered: topics.length,
    hot: topics.filter((topic) => topic.heat >= heatThreshold).length,
  };
  const platformRows = groupTopicCounts(topics, "platform");

  return (
    <div className="main-grid">
      <TopicTable topics={topics} selectedId={selected?.id} setSelectedId={setSelectedId} />
      <TopicDetail topic={selected} onFactory={() => setActiveView("factory")} />
      <section className="panel trend-panel">
        <div className="panel-title-row">
          <div className="panel-title">趋势概览</div>
        </div>
        <div className="metric-grid">
          <Metric label="发现热点" value={dashboardStats.discovered} icon={<Flame size={20} />} />
          <Metric label="高热热点" value={dashboardStats.hot} icon={<Zap size={20} />} />
          <Metric label="可用数据源" value={stats.activeSources} icon={<Database size={20} />} />
          <Metric label="失败数据源" value={stats.failedSources} icon={<ShieldAlert size={20} />} />
        </div>
        <div className="chart-legend">
          {topics.slice(0, 5).map((topic) => (
            <span key={topic.id}>
              <i style={{ background: topic.risk === "高" ? "#ff5f76" : "#2ee6a6" }} />
              {topic.keywords[0] || topic.category}
            </span>
          ))}
        </div>
        <div className="trend-stack">
          {topics.slice(0, 6).map((topic) => (
            <div key={topic.id}>
              <span>{topic.title}</span>
              <Sparkline values={topic.trend} />
            </div>
          ))}
        </div>
      </section>
      <section className="panel word-panel">
        <div className="panel-title">关键词词云</div>
        <div className="word-cloud">
          {topics
            .flatMap((topic) => topic.keywords)
            .slice(0, 22)
            .map((word, index) => (
              <span className={`word-${(index % 5) + 1}`} key={`${word}-${index}`}>
                {word}
              </span>
            ))}
        </div>
      </section>
      <section className="panel distribution-panel">
        <div className="panel-title">热点分布</div>
        <MiniBars rows={platformRows.length ? platformRows : analytics?.byPlatform || []} />
      </section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="metric-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RadarPage({ keywords, setQuery }: { keywords: KeywordRow[]; setQuery: (value: string) => void }) {
  return (
    <section className="panel full-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <Crosshair size={18} />
          关键词雷达
        </div>
      </div>
      <div className="radar-grid">
        {keywords.map((row) => (
          <button className="keyword-card" key={row.keyword} onClick={() => setQuery(row.keyword)}>
            <strong>{row.keyword}</strong>
            <span>出现 {row.count} 次 · 均热 {row.heat}</span>
            <i style={{ width: `${row.heat}%` }} />
            <em>关联：{row.topics.join(" / ")}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function ContentFactoryPage({
  topics,
  selected,
  assets,
  selectedAssetId,
  setSelectedAssetId,
  pushTarget,
  setPushTarget,
  pushChannels,
  onGenerated,
}: {
  topics: Topic[];
  selected?: Topic;
  assets: Asset[];
  selectedAssetId: string;
  setSelectedAssetId: (id: string) => void;
  pushTarget: PushChannel;
  setPushTarget: (channel: PushChannel) => void;
  pushChannels: PushChannels;
  onGenerated: () => void;
}) {
  const [topicId, setTopicId] = useState(selected?.id || "");
  const [mode, setMode] = useState(copyModes[0]);
  const [text, setText] = useState("");
  const topic = topics.find((item) => item.id === topicId) || selected || topics[0];
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const draftText = text || topic?.publishCopy[mode] || "";

  useEffect(() => {
    if (topic && !topicId) setTopicId(topic.id);
  }, [topic, topicId]);

  async function generate() {
    if (!topic) return;
    const data = await api<{ text: string }>("/api/content/generate", {
      method: "POST",
      body: JSON.stringify({ topicId: topic.id, mode, assetId: selectedAssetId || undefined }),
    });
    setText(data.text);
    onGenerated();
  }

  async function push() {
    await api("/api/push/send", { method: "POST", body: JSON.stringify({ text: draftText, target: pushTarget }) });
    onGenerated();
  }

  return (
    <section className="panel factory-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <PenSquare size={18} />
          内容工厂
        </div>
        <button onClick={generate}>
          <Rocket size={16} /> 生成
        </button>
      </div>
      <div className="factory-grid">
        <div className="control-column">
          <label>
            热点
            <select value={topic?.id || ""} onChange={(event) => setTopicId(event.target.value)}>
              {topics.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <div className="copy-tabs factory-tabs">
            {copyModes.map((item) => (
              <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>
                {item}
              </button>
            ))}
          </div>
          <label>
            账号素材
            <select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)}>
              <option value="">不使用素材</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.type} · {asset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            推送渠道
            <select value={pushTarget} onChange={(event) => setPushTarget(event.target.value as PushChannel)}>
              {(Object.keys(pushChannelLabels) as PushChannel[]).map((channel) => (
                <option key={channel} value={channel}>
                  {pushChannelLabels[channel]}{pushChannels[channel] ? "" : "（未配置）"}
                </option>
              ))}
            </select>
          </label>
          {selectedAsset && (
            <div className="source-insight">
              <strong>{selectedAsset.name}</strong>
              <span>{selectedAsset.description}</span>
            </div>
          )}
          {topic && (
            <div className="source-insight">
              <strong>{topic.title}</strong>
              <span>{topic.summary}</span>
            </div>
          )}
        </div>
        <div className="composer large-composer">
          <textarea value={draftText} onChange={(event) => setText(event.target.value)} />
          <div className="composer-footer">
            <span>{draftText.length} / 280</span>
            <button onClick={() => copyText(draftText)}>
              <Copy size={16} /> 复制
            </button>
            <button className="publish-button" onClick={push} disabled={!draftText}>
              <Send size={16} /> 推送至{pushChannelLabels[pushTarget]}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PushCenterPage({
  pushLog,
  settings,
  setSettings,
  saveSettings,
  pushTarget,
  setPushTarget,
  pushChannels,
  reload,
}: {
  pushLog: PushLogEntry[];
  settings?: SettingsModel;
  setSettings: (value: SettingsModel) => void;
  saveSettings: () => Promise<void>;
  pushTarget: PushChannel;
  setPushTarget: (channel: PushChannel) => void;
  pushChannels: PushChannels;
  reload: () => void;
}) {
  const [text, setText] = useState("热点系统测试推送：本地链路正常。");
  async function send() {
    await api("/api/push/send", { method: "POST", body: JSON.stringify({ text, target: pushTarget }) });
    reload();
  }
  const updateFeishu = (patch: Partial<SettingsModel["feishu"]>) => {
    if (!settings) return;
    setSettings({ ...settings, feishu: { ...settings.feishu, ...patch } });
  };
  return (
    <section className="panel full-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <Send size={18} />
          推送中心
        </div>
        <div className="panel-actions">
          <button onClick={() => copyText(text)}>
            <Copy size={16} /> 复制
          </button>
          <button onClick={send}>
            <Send size={16} /> 发送到{pushChannelLabels[pushTarget]}
          </button>
        </div>
      </div>
      <div className="push-grid">
        <div className="composer large-composer">
          <label>
            推送渠道
            <select value={pushTarget} onChange={(event) => setPushTarget(event.target.value as PushChannel)}>
              {(Object.keys(pushChannelLabels) as PushChannel[]).map((channel) => (
                <option key={channel} value={channel}>
                  {pushChannelLabels[channel]}{pushChannels[channel] ? "" : "（未配置）"}
                </option>
              ))}
            </select>
          </label>
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
          {settings && (
            <div className="source-config-panel push-config-panel">
              <b>飞书机器人</b>
              <label className="toggle-row">
                <span>启用飞书推送</span>
                <input type="checkbox" checked={settings.feishu.enabled} onChange={(event) => updateFeishu({ enabled: event.target.checked })} />
              </label>
              <label>
                Webhook URL
                <input value={settings.feishu.webhookUrl} onChange={(event) => updateFeishu({ webhookUrl: event.target.value })} />
              </label>
              <label>
                签名密钥
                <input type="password" value={settings.feishu.secret} onChange={(event) => updateFeishu({ secret: event.target.value })} />
              </label>
              <button onClick={saveSettings}>保存飞书配置</button>
            </div>
          )}
        </div>
        <div className="log-list">
          {pushLog.map((item) => (
            <div className="log-item" key={item.id}>
              <CheckCircle2 size={16} />
              <strong>{item.status}</strong>
              <span>{item.target} · {timeAgo(item.createdAt)}</span>
              <p>{item.text}</p>
              {item.error && <em>{item.error}</em>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AssetsPage({
  assets,
  useAsset,
  reload,
}: {
  assets: Asset[];
  useAsset: (assetId: string) => void;
  reload: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  async function addAsset() {
    if (!name.trim()) return;
    await api("/api/assets", { method: "POST", body: JSON.stringify({ name, description, type: "素材", tags: ["自定义"] }) });
    setName("");
    setDescription("");
    reload();
  }
  return (
    <section className="panel full-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <Library size={18} />
          账号素材库
        </div>
        <button onClick={addAsset}>新增素材</button>
      </div>
      <div className="asset-editor">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="素材名称 / 人设 / 模板" />
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="用途说明" />
      </div>
      <div className="asset-grid">
        {assets.map((asset) => (
          <article className="asset-card" key={asset.id}>
            <span>{asset.type}</span>
            <strong>{asset.name}</strong>
            <p>{asset.description}</p>
            <div>{asset.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
            <button onClick={() => useAsset(asset.id)}>
              <PenSquare size={15} /> 用于内容工厂
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function TasksPage({ jobs, refresh, refreshing }: { jobs: Job[]; refresh: () => void; refreshing: boolean }) {
  return (
    <section className="panel full-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <Activity size={18} />
          任务 & 监控
        </div>
        <button onClick={refresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "spin" : ""} /> 立即执行
        </button>
      </div>
      <div className="job-list">
        {jobs.map((job) => (
          <article className="job-card" key={job.id}>
            <header>
              <strong>{job.type}</strong>
              <span className={job.status}>{job.status}</span>
              <em>{timeAgo(job.startedAt)}</em>
            </header>
            <p>{job.message}</p>
            <div className="source-status-grid">
              {job.sources.map((source) => (
                <div className={source.status} key={`${job.id}-${source.name}`}>
                  <b>{source.name}</b>
                  <span>{source.count} 条 · {source.ms}ms</span>
                  {source.error && <em>{source.error}</em>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalyticsPage({ stats, analytics }: { stats: Stats; analytics?: AnalyticsModel }) {
  return (
    <section className="panel full-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <BarChart3 size={18} />
          数据分析
        </div>
      </div>
      <div className="metric-grid analytics-metrics">
        <Metric label="热点总量" value={stats.discovered} icon={<Flame size={20} />} />
        <Metric label="高热占比" value={`${stats.discovered ? Math.round((stats.hot / stats.discovered) * 100) : 0}%`} icon={<TrendingUp size={20} />} />
        <Metric label="生成次数" value={stats.generated} icon={<PenSquare size={20} />} />
        <Metric label="推送次数" value={stats.pushed} icon={<Send size={20} />} />
      </div>
      <div className="analytics-grid">
        <div>
          <strong>分类分布</strong>
          <MiniBars rows={analytics?.byCategory || []} />
        </div>
        <div>
          <strong>平台分布</strong>
          <MiniBars rows={analytics?.byPlatform || []} />
        </div>
        <div>
          <strong>风险分布</strong>
          <MiniBars rows={analytics?.byRisk || []} />
        </div>
      </div>
    </section>
  );
}

function RssSourceConfig({
  title,
  source,
  config,
  updateSourceConfig,
}: {
  title: string;
  source: keyof Pick<SettingsModel["sourceConfig"], "huggingFace" | "openaiBlog" | "deepmind" | "anthropic" | "youtube">;
  config: { rssUrl: string; sourceName: string };
  updateSourceConfig: <K extends keyof SettingsModel["sourceConfig"]>(source: K, patch: Partial<SettingsModel["sourceConfig"][K]>) => void;
}) {
  return (
    <div className="source-config-panel">
      <b>{title}</b>
      <label>
        RSS/RSSHub 路由
        <input
          value={config.rssUrl}
          onChange={(event) => updateSourceConfig(source, { rssUrl: event.target.value } as Partial<SettingsModel["sourceConfig"][typeof source]>)}
        />
      </label>
      <label>
        来源名称
        <input
          value={config.sourceName}
          onChange={(event) => updateSourceConfig(source, { sourceName: event.target.value } as Partial<SettingsModel["sourceConfig"][typeof source]>)}
        />
      </label>
    </div>
  );
}

function SettingsPage({ settings, setSettings, save }: { settings?: SettingsModel; setSettings: (value: SettingsModel) => void; save: () => void }) {
  if (!settings) return null;
  const updateSource = (key: string, checked: boolean) => setSettings({ ...settings, sources: { ...settings.sources, [key]: checked } });
  const updateSourceConfig = <K extends keyof SettingsModel["sourceConfig"]>(
    source: K,
    patch: Partial<SettingsModel["sourceConfig"][K]>,
  ) => setSettings({
    ...settings,
    sourceConfig: {
      ...settings.sourceConfig,
      [source]: { ...settings.sourceConfig[source], ...patch },
    },
  });

  return (
    <section className="panel full-panel">
      <div className="panel-title-row">
        <div className="panel-title">
          <Settings size={18} />
          设置中心
        </div>
        <button onClick={save}>保存设置</button>
      </div>
      <div className="settings-grid">
        <div className="settings-block">
          <strong>数据源</strong>
          {Object.entries(settings.sources).map(([key, value]) => (
            <label className="toggle-row" key={key}>
              <span>
                {sourcePlatformLabels[key] || key}
                {configurableSources.has(key) && <em>需配置</em>}
              </span>
              <input type="checkbox" checked={value} onChange={(event) => updateSource(key, event.target.checked)} />
            </label>
          ))}
        </div>
        <div className="settings-block source-config-block">
          <strong>数据源参数</strong>
          {settings.sources.twitter && (
            <div className="source-config-panel">
              <b>X / Twitter</b>
              <label>
                Bearer Token
                <input
                  type="password"
                  value={settings.sourceConfig.twitter.bearerToken}
                  onChange={(event) => updateSourceConfig("twitter", { bearerToken: event.target.value })}
                  placeholder="必填，用于 X API v2 Recent Search"
                />
              </label>
              <label>
                自定义查询
                <input
                  value={settings.sourceConfig.twitter.query}
                  onChange={(event) => updateSourceConfig("twitter", { query: event.target.value })}
                  placeholder='留空时使用关键词组合，例如 (OpenAI OR agent) -is:retweet'
                />
              </label>
              <div className="compact-field-grid">
                <label>
                  语言
                  <input
                    value={settings.sourceConfig.twitter.lang}
                    onChange={(event) => updateSourceConfig("twitter", { lang: event.target.value })}
                    placeholder="en / zh"
                  />
                </label>
                <label>
                  数量
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={settings.sourceConfig.twitter.maxResults}
                    onChange={(event) => updateSourceConfig("twitter", { maxResults: Number(event.target.value) })}
                  />
                </label>
                <label>
                  查询长度
                  <input
                    type="number"
                    min={1}
                    max={4096}
                    value={settings.sourceConfig.twitter.queryMaxChars}
                    onChange={(event) => updateSourceConfig("twitter", { queryMaxChars: Number(event.target.value) })}
                  />
                </label>
              </div>
            </div>
          )}
          {settings.sources.weibo && (
            <div className="source-config-panel">
              <b>微博热搜</b>
              <label>
                抓取模式
                <select value={settings.sourceConfig.weibo.mode} onChange={(event) => updateSourceConfig("weibo", { mode: event.target.value })}>
                  <option value="auto">auto</option>
                  <option value="rsshub">rsshub</option>
                  <option value="direct">direct</option>
                </select>
              </label>
              <label>
                RSSHub 地址
                <input
                  value={settings.sourceConfig.weibo.rsshubBaseUrl}
                  onChange={(event) => updateSourceConfig("weibo", { rsshubBaseUrl: event.target.value })}
                  placeholder="https://rsshub.app"
                />
              </label>
              <label>
                自定义 RSS 路由
                <input
                  value={settings.sourceConfig.weibo.rssUrl}
                  onChange={(event) => updateSourceConfig("weibo", { rssUrl: event.target.value })}
                  placeholder="https://your-rsshub.example.com/weibo/search/hot"
                />
              </label>
            </div>
          )}
          {settings.sources.github && (
            <div className="source-config-panel">
              <b>GitHub Search</b>
              <label>
                GitHub Token
                <input
                  type="password"
                  value={settings.sourceConfig.github.token}
                  onChange={(event) => updateSourceConfig("github", { token: event.target.value })}
                  placeholder="可选，用于提升 API 限流额度"
                />
              </label>
            </div>
          )}
          {settings.sources.reddit && (
            <div className="source-config-panel">
              <b>Reddit JSON</b>
              <label>
                User-Agent
                <input
                  value={settings.sourceConfig.reddit.userAgent}
                  onChange={(event) => updateSourceConfig("reddit", { userAgent: event.target.value })}
                  placeholder="ai-hottopics/0.1 (+local research dashboard)"
                />
              </label>
            </div>
          )}
          {settings.sources.tiktok && (
            <div className="source-config-panel">
              <b>TikTok</b>
              <label>
                RSS/RSSHub 路由
                <input
                  value={settings.sourceConfig.tiktok.rssUrl}
                  onChange={(event) => updateSourceConfig("tiktok", { rssUrl: event.target.value })}
                  placeholder="https://your-rsshub.example.com/tiktok/user/:id"
                />
              </label>
              <label>
                来源名称
                <input
                  value={settings.sourceConfig.tiktok.sourceName}
                  onChange={(event) => updateSourceConfig("tiktok", { sourceName: event.target.value })}
                  placeholder="TikTok RSS"
                />
              </label>
            </div>
          )}
          {settings.sources.instagram && (
            <div className="source-config-panel">
              <b>Instagram</b>
              <label>
                RSS/RSSHub 路由
                <input
                  value={settings.sourceConfig.instagram.rssUrl}
                  onChange={(event) => updateSourceConfig("instagram", { rssUrl: event.target.value })}
                  placeholder="https://your-rsshub.example.com/instagram/user/:id"
                />
              </label>
              <label>
                来源名称
                <input
                  value={settings.sourceConfig.instagram.sourceName}
                  onChange={(event) => updateSourceConfig("instagram", { sourceName: event.target.value })}
                  placeholder="Instagram RSS"
                />
              </label>
            </div>
          )}
          {settings.sources.huggingFace && (
            <RssSourceConfig title="Hugging Face" source="huggingFace" config={settings.sourceConfig.huggingFace} updateSourceConfig={updateSourceConfig} />
          )}
          {settings.sources.openaiBlog && (
            <RssSourceConfig title="OpenAI 官方博客" source="openaiBlog" config={settings.sourceConfig.openaiBlog} updateSourceConfig={updateSourceConfig} />
          )}
          {settings.sources.deepmind && (
            <RssSourceConfig title="Google DeepMind" source="deepmind" config={settings.sourceConfig.deepmind} updateSourceConfig={updateSourceConfig} />
          )}
          {settings.sources.anthropic && (
            <RssSourceConfig title="Anthropic" source="anthropic" config={settings.sourceConfig.anthropic} updateSourceConfig={updateSourceConfig} />
          )}
          {settings.sources.glassnode && (
            <div className="source-config-panel">
              <b>Glassnode</b>
              <label>
                API Key
                <input
                  type="password"
                  value={settings.sourceConfig.glassnode.apiKey}
                  onChange={(event) => updateSourceConfig("glassnode", { apiKey: event.target.value })}
                  placeholder="Glassnode API Key"
                />
              </label>
              <div className="compact-field-grid">
                <label>
                  资产
                  <input value={settings.sourceConfig.glassnode.asset} onChange={(event) => updateSourceConfig("glassnode", { asset: event.target.value })} />
                </label>
                <label>
                  指标
                  <input value={settings.sourceConfig.glassnode.metric} onChange={(event) => updateSourceConfig("glassnode", { metric: event.target.value })} />
                </label>
                <label>
                  周期
                  <input value={settings.sourceConfig.glassnode.interval} onChange={(event) => updateSourceConfig("glassnode", { interval: event.target.value })} />
                </label>
              </div>
            </div>
          )}
          {settings.sources.coinMarketCap && (
            <div className="source-config-panel">
              <b>CoinMarketCap</b>
              <label>
                API Key
                <input
                  type="password"
                  value={settings.sourceConfig.coinMarketCap.apiKey}
                  onChange={(event) => updateSourceConfig("coinMarketCap", { apiKey: event.target.value })}
                  placeholder="CoinMarketCap Pro API Key"
                />
              </label>
              <label>
                Endpoint
                <input
                  value={settings.sourceConfig.coinMarketCap.endpoint}
                  onChange={(event) => updateSourceConfig("coinMarketCap", { endpoint: event.target.value })}
                />
              </label>
            </div>
          )}
          {settings.sources.wikipedia && (
            <div className="source-config-panel">
              <b>Wikipedia</b>
              <div className="compact-field-grid two-col">
                <label>
                  语言
                  <input value={settings.sourceConfig.wikipedia.language} onChange={(event) => updateSourceConfig("wikipedia", { language: event.target.value })} />
                </label>
                <label>
                  来源名称
                  <input value={settings.sourceConfig.wikipedia.sourceName} onChange={(event) => updateSourceConfig("wikipedia", { sourceName: event.target.value })} />
                </label>
              </div>
            </div>
          )}
          {settings.sources.youtube && (
            <RssSourceConfig title="YouTube" source="youtube" config={settings.sourceConfig.youtube} updateSourceConfig={updateSourceConfig} />
          )}
          {!Object.entries(settings.sources).some(([key, enabled]) => enabled && configurableSources.has(key)) && (
            <p className="settings-hint">勾选需要参数的数据源后，这里会出现对应抓取参数。</p>
          )}
        </div>
        <div className="settings-block">
          <strong>阈值与词库</strong>
          <label>
            热点阈值
            <input
              type="number"
              value={settings.heatThreshold}
              onChange={(event) => setSettings({ ...settings, heatThreshold: Number(event.target.value) })}
            />
          </label>
          <label>
            追踪关键词
            <textarea
              value={settings.keywords.join(",")}
              onChange={(event) => setSettings({ ...settings, keywords: event.target.value.split(",").map((word) => word.trim()).filter(Boolean) })}
            />
          </label>
          <label>
            屏蔽词
            <textarea
              value={settings.blockedWords.join(",")}
              onChange={(event) => setSettings({ ...settings, blockedWords: event.target.value.split(",").map((word) => word.trim()).filter(Boolean) })}
            />
          </label>
        </div>
        <div className="settings-block">
          <strong>Telegram 推送</strong>
          <label className="toggle-row">
            <span>启用真实推送</span>
            <input
              type="checkbox"
              checked={settings.telegram.enabled}
              onChange={(event) => setSettings({ ...settings, telegram: { ...settings.telegram, enabled: event.target.checked } })}
            />
          </label>
          <label>
            Bot Token
            <input
              type="password"
              value={settings.telegram.botToken}
              onChange={(event) => setSettings({ ...settings, telegram: { ...settings.telegram, botToken: event.target.value } })}
            />
          </label>
          <label>
            Chat ID
            <input
              value={settings.telegram.chatId}
              onChange={(event) => setSettings({ ...settings, telegram: { ...settings.telegram, chatId: event.target.value } })}
            />
          </label>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [stats, setStats] = useState<Stats>({ discovered: 0, hot: 0, generated: 0, pushed: 0, failedSources: 0, activeSources: 0 });
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("全部");
  const [category, setCategory] = useState("全部");
  const [region, setRegion] = useState("全球");
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<SettingsModel>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [pushTarget, setPushTarget] = useState<PushChannel>("local");
  const [pushChannels, setPushChannels] = useState<PushChannels>({ local: true, telegram: false, feishu: false });
  const [pushLog, setPushLog] = useState<PushLogEntry[]>([]);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsModel>();
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const loadAll = async () => {
    try {
      const params = new URLSearchParams({ platform, category, region, q: query });
      const [topicData, jobData, settingsData, assetsData, pushData, radarData, analyticsData] = await Promise.all([
        api<{ topics: Topic[]; stats: Stats; lastRefreshAt: string | null }>(`/api/topics?${params}`),
        api<{ jobs: Job[] }>("/api/jobs"),
        api<{ settings: SettingsModel }>("/api/settings"),
        api<{ assets: Asset[] }>("/api/assets"),
        api<{ pushLog: PushLogEntry[]; channels: PushChannels }>("/api/push/log"),
        api<{ keywords: KeywordRow[] }>("/api/radar"),
        api<{ analytics: AnalyticsModel; stats: Stats }>("/api/analytics"),
      ]);
      setTopics(topicData.topics);
      setStats(topicData.stats);
      setLastRefreshAt(topicData.lastRefreshAt);
      setJobs(jobData.jobs);
      setSettings(settingsData.settings);
      setAssets(assetsData.assets);
      setPushLog(pushData.pushLog);
      const nextPushChannels = { local: true, telegram: Boolean(pushData.channels?.telegram), feishu: Boolean(pushData.channels?.feishu) };
      setPushChannels(nextPushChannels);
      if (pushTarget === "local" && (nextPushChannels.feishu || nextPushChannels.telegram)) {
        setPushTarget(preferredPushTarget(nextPushChannels));
      }
      setKeywords(radarData.keywords);
      setAnalytics(analyticsData.analytics);
      if (!selectedId && topicData.topics[0]) setSelectedId(topicData.topics[0].id);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  };

  useEffect(() => {
    loadAll();
    const timer = window.setInterval(loadAll, 30000);
    return () => window.clearInterval(timer);
  }, [platform, category, region, query]);

  async function refresh() {
    setRefreshing(true);
    try {
      await api("/api/refresh", { method: "POST" });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "抓取失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    await api("/api/settings", { method: "POST", body: JSON.stringify(settings) });
    await loadAll();
  }

  const selected = useMemo(() => topics.find((topic) => topic.id === selectedId) || topics[0], [topics, selectedId]);
  const platforms = useMemo(() => {
    const names = new Set<string>();
    const sourceEntries = Object.entries(settings?.sources || {});
    for (const [key, enabled] of sourceEntries) {
      if (enabled) names.add(sourcePlatformLabels[key] || key);
    }
    if (!sourceEntries.length) {
      for (const row of analytics?.byPlatform || []) names.add(row.name);
      for (const topic of topics) names.add(topic.platform);
    }
    return [...names].filter(Boolean);
  }, [settings?.sources, analytics?.byPlatform, topics]);
  const notificationCount = useMemo(() => {
    const latestJob = jobs[0];
    if (!latestJob) return stats.failedSources || 0;
    return latestJob.sources.filter((source) => source.status === "failed").length;
  }, [jobs, stats.failedSources]);

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} stats={stats} />
      <main className="workspace">
        <Header
          query={query}
          setQuery={setQuery}
          refresh={refresh}
          refreshing={refreshing}
          lastRefreshAt={lastRefreshAt}
          alertCount={notificationCount}
          openTasks={() => setActiveView("tasks")}
          openHelp={() => setShowHelp((value) => !value)}
        />
        {error && <div className="error-banner">{error}</div>}
        {showHelp && (
          <section className="panel top-help-panel">
            <button aria-label="关闭帮助" className="ghost-icon" onClick={() => setShowHelp(false)}>
              <X size={16} />
            </button>
            <strong>快速入口</strong>
            <p>喇叭会打开任务与数据源告警；内容工厂可以选择账号素材和推送渠道；飞书机器人在推送中心配置。</p>
            <div>
              <button onClick={() => { setActiveView("assets"); setShowHelp(false); }}>账号素材库</button>
              <button onClick={() => { setActiveView("push"); setShowHelp(false); }}>推送中心</button>
              <button onClick={() => { setActiveView("settings"); setShowHelp(false); }}>设置中心</button>
            </div>
          </section>
        )}
        {(activeView === "dashboard" || activeView === "hotlist") && (
          <FilterBar
            platform={platform}
            setPlatform={setPlatform}
            category={category}
            setCategory={setCategory}
            region={region}
            setRegion={setRegion}
            platforms={platforms}
          />
        )}
        {activeView === "dashboard" && (
          <DashboardPage
            topics={topics}
            stats={stats}
            selected={selected}
            setSelectedId={setSelectedId}
            setActiveView={setActiveView}
            analytics={analytics}
            heatThreshold={settings?.heatThreshold}
          />
        )}
        {activeView === "hotlist" && (
          <div className="main-grid single-focus">
            <TopicTable topics={topics} selectedId={selected?.id} setSelectedId={setSelectedId} />
            <TopicDetail topic={selected} onFactory={() => setActiveView("factory")} />
          </div>
        )}
        {activeView === "radar" && <RadarPage keywords={keywords} setQuery={(value) => { setQuery(value); setActiveView("hotlist"); }} />}
        {activeView === "factory" && (
          <ContentFactoryPage
            topics={topics}
            selected={selected}
            assets={assets}
            selectedAssetId={selectedAssetId}
            setSelectedAssetId={setSelectedAssetId}
            pushTarget={pushTarget}
            setPushTarget={setPushTarget}
            pushChannels={pushChannels}
            onGenerated={loadAll}
          />
        )}
        {activeView === "push" && (
          <PushCenterPage
            pushLog={pushLog}
            settings={settings}
            setSettings={setSettings}
            saveSettings={saveSettings}
            pushTarget={pushTarget}
            setPushTarget={setPushTarget}
            pushChannels={pushChannels}
            reload={loadAll}
          />
        )}
        {activeView === "assets" && <AssetsPage assets={assets} useAsset={(assetId) => { setSelectedAssetId(assetId); setActiveView("factory"); }} reload={loadAll} />}
        {activeView === "tasks" && <TasksPage jobs={jobs} refresh={refresh} refreshing={refreshing} />}
        {activeView === "analytics" && <AnalyticsPage stats={stats} analytics={analytics} />}
        {activeView === "settings" && settings && <SettingsPage settings={settings} setSettings={setSettings} save={saveSettings} />}
      </main>
    </div>
  );
}
