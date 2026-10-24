import { lazy, Suspense, useEffect, useState } from "react";
import { BadgeCheck, BarChart3, ChevronLeft, ChevronRight, ExternalLink, Eye, FileText, FlaskConical, RefreshCw, Settings2, TrendingUp, UsersRound } from "lucide-react";
import "./twitter-rankings.css";

export type RankingScope = "chinese" | "aicrypto" | "global";
export type TwitterRankingConfig = {
  enabled: boolean;
  accountsEnabled: boolean;
  topicsEnabled: boolean;
  maxPages: number;
  maxResults: number;
  woeid: number;
  queries: Record<RankingScope, string>;
};

const scopes: Array<{ key: RankingScope; label: string }> = [
  { key: "chinese", label: "中文圈" },
  { key: "aicrypto", label: "AI / Crypto 圈" },
  { key: "global", label: "全球 · 不限领域" },
];

type Account = {
  id: string; name: string; username: string; impressions: number | null; missingImpressions: number;
  engagements: number; postCount: number; topPost: { text: string; url: string };
};
type RankedTopic = { name: string; postCount: number; authorCount: number; impressions: number | null; missingImpressions: number; url: string };
type OfficialTrend = { name: string; tweetCount: number | null; rank: number; url: string };
type RankingData = {
  mode: "demo" | "live"; date: string; scope: RankingScope; enabled: boolean; configured: boolean; queryConfigured: boolean;
  accounts: Account[]; topics: RankedTopic[]; officialTrends: OfficialTrend[];
  sampledPosts: number; sampledAuthors: number; searchAt: string | null; trendsAt: string | null;
  query: string; woeid: number | null; truncated: boolean; errors: Array<{ source: string; message: string }>;
};
type ApiClient = <T>(path: string, options?: RequestInit) => Promise<T>;
const RankingCharts = lazy(() => import("./DashboardCharts").then((module) => ({ default: module.RankingCharts })));

function today() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
function number(value: number | null) {
  return value === null ? "--" : new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
function stamp(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "尚无采集记录";
}
function ItemLink({ url, children }: { url: string; children: React.ReactNode }) {
  return url ? <a href={url} target="_blank" rel="noreferrer">{children}<ExternalLink size={13} /></a> : <span>{children}</span>;
}

export function TwitterRankings({ api, config, openSettings }: { api: ApiClient; config?: TwitterRankingConfig; openSettings: () => void }) {
  const [scope, setScope] = useState<RankingScope>("chinese");
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [topicMode, setTopicMode] = useState("scope");
  const [data, setData] = useState<RankingData>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(undefined);
    setError("");
    const params = new URLSearchParams({ scope, date, mode });
    api<RankingData>(`/api/twitter/rankings?${params}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "榜单加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, date, mode, config]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const result = await api<RankingData>("/api/twitter/rankings/refresh", { method: "POST", body: JSON.stringify({ scope, date }) });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "抓取失败");
    } finally {
      setBusy(false);
    }
  }
  const recent = new Date(`${date}T00:00:00+08:00`).getTime() >= Date.now() - 7 * 86400_000;
  const ready = data?.enabled && data.configured && data.queryConfigured;
  const accountsEnabled = config?.accountsEnabled ?? true;
  const topicsEnabled = config?.topicsEnabled ?? true;
  const disabled = busy || loading;
  const adjacentDay = (offset: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + offset * 86400_000).toISOString().slice(0, 10);
  const knownAccounts = data?.accounts.filter((account) => account.impressions !== null) || [];
  const totalViews = knownAccounts.length ? knownAccounts.reduce((sum, account) => sum + (account.impressions || 0), 0) : null;
  const maxViews = Math.max(1, ...knownAccounts.map((account) => account.impressions || 0));

  return (
    <section className="x-rankings" aria-label="X 日榜">
      <div className="x-heading">
        <div><div className="x-page-title"><span className="page-eyebrow">X / DAILY RANKINGS</span><h2>X 日榜<span className="x-heading-date">{date.replace(/-/g, ".")}</span></h2></div></div>
        <div className="x-heading-actions"><span className={`x-data-badge ${mode}`}><i />{mode === "demo" ? "示例数据 · 非真实排名" : "实际数据 · 采样排名"}</span><button className="x-command" onClick={openSettings}><Settings2 size={16} />接口配置</button></div>
      </div>
      <div className="x-toolbar">
        <div className="x-segments" role="group" aria-label="榜单范围">
          {scopes.map((item) => <button key={item.key} aria-pressed={scope === item.key} disabled={disabled} onClick={() => setScope(item.key)}>{item.label}</button>)}
        </div>
        <div className="x-date">
          <button className="x-command x-date-arrow" aria-label="前一天" title="前一天" disabled={disabled} onClick={() => setDate(adjacentDay(-1))}><ChevronLeft size={16} /></button>
          <label>发文日期<input aria-label="发文日期" type="date" max={today()} value={date} disabled={disabled} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
          <button className="x-command x-date-arrow" aria-label="后一天" title="后一天" disabled={disabled || date >= today()} onClick={() => setDate(adjacentDay(1))}><ChevronRight size={16} /></button>
        </div>
        <div className="x-segments" role="group" aria-label="数据模式">
          <button aria-pressed={mode === "demo"} disabled={disabled} onClick={() => setMode("demo")}><FlaskConical size={14} />示例预览</button>
          <button aria-pressed={mode === "live"} disabled={disabled} onClick={() => setMode("live")}><BarChart3 size={14} />实际数据</button>
        </div>
        {mode === "live" && <button className="x-command" disabled={disabled || !ready || !recent || (!accountsEnabled && !topicsEnabled)} onClick={refresh} title="手动调用 X 官方 API，可能消耗使用者的 API 额度"><RefreshCw size={15} className={busy ? "spin" : ""} />{busy ? "抓取中" : "抓取该日数据"}</button>}
      </div>
      {error && <div className="x-message error" role="alert">{error}</div>}
      {mode === "live" && data && !ready && <div className="x-message">{!data.enabled ? "X 榜单接口未启用" : !data.configured ? "尚未配置 Bearer Token" : "当前范围尚未配置搜索查询"}<button onClick={openSettings}>前往设置<ExternalLink size={13} /></button></div>}
      {mode === "live" && !recent && <div className="x-message">当前日期仅展示已保存结果，超出 Recent Search 最近 7 天的抓取范围。</div>}
      {data?.errors.map((item) => <div className="x-message error" role="alert" key={item.source}>{item.source === "search" ? "搜索采集" : "官方地区热榜"}：{item.message}</div>)}
      <div className="x-metrics">
        <div><span><UsersRound size={15} />覆盖账号</span><strong>{data ? number(data.sampledAuthors) : "--"}<small>个</small></strong><em>当前范围独立作者</em></div>
        <div><span><FileText size={15} />采样帖子</span><strong>{data ? number(data.sampledPosts) : "--"}<small>条</small></strong><em>所选日期发布内容</em></div>
        <div><span><BadgeCheck size={15} />上榜蓝 V</span><strong>{data ? number(data.accounts.length) : "--"}<small>个</small></strong><em>仅 blue 认证账号</em></div>
        <div><span><Eye size={15} />榜内浏览量</span><strong>{number(totalViews)}</strong><em>{data?.accounts.some((account) => account.missingImpressions > 0) ? "部分缺失 · 已知浏览量之和" : "上榜账号采样帖累计值"}</em></div>
      </div>
      <Suspense fallback={<div className="charts-loading" role="status">图表加载中</div>}><RankingCharts accounts={data?.accounts || []} topics={data?.topics || []} officialTrends={data?.officialTrends || []} official={topicMode === "official"} accountsEnabled={accountsEnabled} topicsEnabled={topicsEnabled} /></Suspense>
      <div className={`x-boards ${!accountsEnabled || !topicsEnabled ? "single" : ""}`}>
        {accountsEnabled && <section className="x-board" aria-label="蓝 V 流量榜">
          <div className="x-board-heading"><h3><BadgeCheck size={18} />蓝 V 流量榜 <span className="section-count">{data?.accounts.length || 0}</span></h3><span>发文日累计浏览量</span></div>
          <div className="x-table-wrap"><table><thead><tr><th>#</th><th>账号 / 代表帖子</th><th>浏览量</th><th>互动</th><th>帖子</th></tr></thead><tbody>
            {data?.accounts.map((account, index) => <tr key={account.id}>
              <td className="x-rank">{index + 1}</td>
              <td className="x-identity"><div className="x-account"><span className={`x-avatar tone-${index % 4}`} aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span><div><strong>{account.name}<BadgeCheck size={14} /></strong><small>@{account.username}</small></div></div><div className="x-post"><ItemLink url={account.topPost.url}>{account.topPost.text}</ItemLink></div></td>
              <td className="x-view-value" title={account.missingImpressions ? `${account.missingImpressions} 条帖子缺少浏览量，当前为已知数据之和` : "所选日期发布帖子的累计浏览量，非去重访客数"}>{number(account.impressions)}{account.impressions !== null && <span className="x-value-meter"><i style={{ width: `${account.impressions / maxViews * 100}%` }} /></span>}{account.missingImpressions > 0 && account.impressions !== null && <small>部分缺失</small>}</td>
              <td>{number(account.engagements)}</td><td>{account.postCount}</td>
            </tr>)}
          </tbody></table></div>
          {!data?.accounts.length && <div className="x-empty">{loading ? "加载中…" : "暂无蓝 V 排名"}</div>}
          <footer>仅含认证类型为 blue 的已采集账号 · 不代表全站排名</footer>
        </section>}
        {topicsEnabled && <section className="x-board" aria-label="热门话题榜">
          <div className="x-board-heading"><h3><TrendingUp size={18} />热门话题榜 <span className="section-count">{(topicMode === "scope" ? data?.topics.length : data?.officialTrends.length) || 0}</span></h3><select aria-label="话题榜来源" value={topicMode} onChange={(event) => setTopicMode(event.target.value)}><option value="scope">圈层采样话题</option><option value="official">官方地区热榜</option></select></div>
          {topicMode === "scope" ? <>
            <div className="x-table-wrap"><table><thead><tr><th>#</th><th>话题</th><th>帖子</th><th>参与账号</th><th>浏览量</th></tr></thead><tbody>
              {data?.topics.map((topic, index) => <tr key={topic.name}><td className="x-rank">{index + 1}</td><td className="x-topic"><ItemLink url={topic.url}>{topic.name}</ItemLink></td><td>{topic.postCount}</td><td>{topic.authorCount}</td><td title={topic.missingImpressions ? "部分帖子缺少浏览量" : undefined}>{number(topic.impressions)}{topic.missingImpressions > 0 && topic.impressions !== null && <small>部分缺失</small>}</td></tr>)}
            </tbody></table></div>
            {!data?.topics.length && <div className="x-empty">{loading ? "加载中…" : "暂无带话题标签的帖子"}</div>}
            <footer>按采样帖子数排序 · 标签不区分大小写 · 同一帖子可参与多个话题</footer>
          </> : <>
            <div className="x-table-wrap"><table><thead><tr><th>#</th><th>官方话题</th><th>接口返回帖子量</th></tr></thead><tbody>
              {data?.officialTrends.map((topic) => <tr key={topic.name}><td className="x-rank">{topic.rank}</td><td className="x-topic"><ItemLink url={topic.url}>{topic.name}</ItemLink></td><td>{number(topic.tweetCount)}</td></tr>)}
            </tbody></table></div>
            {!data?.officialTrends.length && <div className="x-empty">{loading ? "加载中…" : "该日期暂无官方热榜快照"}</div>}
            <footer>WOEID {data?.woeid ?? config?.woeid ?? 1} · 地区热榜不按圈层筛选 · 当日最后一次保存的快照，非日讨论量</footer>
          </>}
        </section>}
      </div>
      {!accountsEnabled && !topicsEnabled && <div className="x-empty">两个榜单均已关闭<button className="x-command" onClick={openSettings}><Settings2 size={15} />接口配置</button></div>}
      <div className="x-footnote">
        <span>统计时区：北京时间（UTC+8）</span>
        {mode === "live" && <><span>搜索更新：{stamp(data?.searchAt || null)}</span><span>地区热榜更新：{stamp(data?.trendsAt || null)}</span></>}
        {data?.truncated && <span className="x-warning">已达采样上限，结果未覆盖全部匹配帖子</span>}
        {mode === "live" && data?.query && <span className="x-query">采样查询：{data.query}</span>}
      </div>
    </section>
  );
}

export function TwitterRankingSettings({ config, onChange }: { config: TwitterRankingConfig; onChange: (value: TwitterRankingConfig) => void }) {
  const update = (patch: Partial<TwitterRankingConfig>) => onChange({ ...config, ...patch });
  return <div className="settings-block x-settings">
    <strong>X 日榜接口</strong>
    <label className="toggle-row"><span>启用官方接口</span><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label>
    <label className="toggle-row"><span>蓝 V 流量榜</span><input type="checkbox" checked={config.accountsEnabled} onChange={(event) => update({ accountsEnabled: event.target.checked })} /></label>
    <label className="toggle-row"><span>热门话题榜</span><input type="checkbox" checked={config.topicsEnabled} onChange={(event) => update({ topicsEnabled: event.target.checked })} /></label>
    {scopes.map((scope) => <label key={scope.key}>{scope.label} · 搜索查询<input value={config.queries[scope.key]} placeholder={scope.key === "aicrypto" ? "AI OR Bitcoin OR crypto" : "关键词 OR #话题 OR from:账号"} onChange={(event) => update({ queries: { ...config.queries, [scope.key]: event.target.value } })} /></label>)}
    <div className="compact-field-grid two-col">
      <label>每页帖子数<input type="number" min={10} max={100} value={config.maxResults} onChange={(event) => update({ maxResults: Number(event.target.value) })} /></label>
      <label>单次最多页数<input type="number" min={1} max={10} value={config.maxPages} onChange={(event) => update({ maxPages: Number(event.target.value) })} /></label>
    </div>
    <label>地区热榜 WOEID<input type="number" min={1} max={2147483647} value={config.woeid} onChange={(event) => update({ woeid: Number(event.target.value) })} /></label>
    <p className="settings-hint">共用 X / Twitter 的 Bearer Token；中文圈限定帖子语言为中文，全球范围不附加语言或领域限制。榜单基于配置查询的采样结果。</p>
    <p className="settings-hint">仅手动抓取，可能消耗 API 额度；未配置 Token 仍可查看示例。</p>
    <a className="x-doc-link" href="https://docs.x.com/x-api/posts/search/introduction" target="_blank" rel="noreferrer">X 官方 API 文档<ExternalLink size={14} /></a>
  </div>;
}
