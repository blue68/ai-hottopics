import { useState } from "react";
import { BarChart3, ChartNoAxesCombined, CircleDot, Hash } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./charts.css";

const palette = ["#49c9d0", "#639fff", "#edba62", "#f39383", "#ac95e2", "#58b5df", "#b1c87b", "#9caec9"];
const axis = { fill: "var(--muted)", fontSize: 11 };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)", fontSize: 12, boxShadow: "0 6px 20px #0003" };
const format = (value: number) => new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const shortName = (value: string) => value.length > 12 ? `${value.slice(0, 11)}…` : value;

type ChartAccount = { id: string; name: string; username: string; impressions: number | null; engagements: number; missingImpressions: number };
type ChartTopic = { name: string; postCount: number; authorCount: number };
type ChartTrend = { name: string; tweetCount: number | null };

function EmptyChart({ text = "暂无可绘制的数据" }: { text?: string }) {
  return <div className="chart-empty"><ChartNoAxesCombined size={26} strokeWidth={1.3} /><span>{text}</span></div>;
}

function HorizontalChart({ rows, label, color = palette[0] }: { rows: Array<{ name: string; value: number }>; label: string; color?: string }) {
  return rows.length ? <div className="chart-plot" role="group" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 20, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" tick={axis} tickFormatter={format} axisLine={false} tickLine={false} minTickGap={25} />
        <YAxis type="category" dataKey="name" width={108} tick={axis} tickFormatter={shortName} axisLine={false} tickLine={false} interval={0} />
        <Tooltip cursor={{ fill: "#8bbaff0b" }} contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} formatter={(value) => [format(Number(value)), label]} />
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div> : <EmptyChart />;
}

function ShareChart({ rows, centerLabel }: { rows: Array<{ name: string; value: number }>; centerLabel: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const shares = rows.length > 4 ? [...rows.slice(0, 3), { name: "其余上榜账号", value: rows.slice(3).reduce((sum, row) => sum + row.value, 0) }] : rows;
  return total > 0 ? <div className="share-chart">
    <div className="share-donut" role="group" aria-label={centerLabel}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart accessibilityLayer>
          <Pie data={shares} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={76} paddingAngle={3} stroke="none" isAnimationActive={false}>
            {shares.map((row, index) => <Cell key={row.name} fill={palette[index % palette.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--text)" }} formatter={(value) => [format(Number(value)), "浏览量"]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="share-center"><strong>{format(total)}</strong><span>{centerLabel}</span></div>
    </div>
    <div className="share-legend">
      {shares.map((row, index) => <div key={row.name} title={`${row.name}：${row.value.toLocaleString("zh-CN")}`}><i style={{ background: palette[index % palette.length] }} /><span>{row.name}</span><b>{(row.value / total * 100).toFixed(1)}%</b></div>)}
    </div>
  </div> : <EmptyChart text={rows.length ? "当前浏览量为 0" : "暂无可用的浏览量"} />;
}

export function RankingCharts({ accounts, topics, officialTrends, official, accountsEnabled, topicsEnabled }: {
  accounts: ChartAccount[]; topics: ChartTopic[]; officialTrends: ChartTrend[]; official: boolean; accountsEnabled: boolean; topicsEnabled: boolean;
}) {
  const [metric, setMetric] = useState<"impressions" | "engagements">("impressions");
  const accountRows = accounts.filter((row) => row[metric] !== null).map((row) => ({ name: row.name, value: row[metric] as number })).sort((a, b) => b.value - a.value).slice(0, 6);
  const shareRows = accounts.filter((row) => row.impressions !== null).map((row) => ({ name: row.name, value: row.impressions as number }));
  const partial = accounts.some((row) => row.missingImpressions > 0);
  const trendRows = officialTrends.filter((row) => row.tweetCount !== null).slice(0, 6).map((row) => ({ name: row.name, value: row.tweetCount as number }));
  return <div className={`ranking-charts ${!accountsEnabled ? "topics-only" : !topicsEnabled ? "accounts-only" : ""}`}>
    {accountsEnabled && <>
      <section className="chart-section" aria-label="账号表现图表">
        <div className="chart-heading"><h3><BarChart3 size={16} />账号表现</h3><div className="chart-metric-switch" role="group" aria-label="账号图表指标"><button aria-pressed={metric === "impressions"} onClick={() => setMetric("impressions")}>浏览量</button><button aria-pressed={metric === "engagements"} onClick={() => setMetric("engagements")}>互动量</button></div></div>
        <HorizontalChart rows={accountRows} label={metric === "impressions" ? "累计浏览量" : "互动量"} />
        <div className="chart-caption">TOP {accountRows.length} 账号{partial && metric === "impressions" ? " · 仅含已知浏览量" : " · 当前日期样本"}</div>
      </section>
      <section className="chart-section" aria-label="流量占比图表">
        <div className="chart-heading"><h3><CircleDot size={16} />榜内流量占比</h3><span>累计浏览量</span></div>
        <ShareChart rows={shareRows} centerLabel="上榜账号浏览量" />
        <div className="chart-caption">{partial ? "部分浏览量缺失 · 按已知数据计算" : "仅统计上榜账号 · 非全站流量占比"}</div>
      </section>
    </>}
    {topicsEnabled && <section className="chart-section" aria-label="话题参与度图表">
      <div className="chart-heading"><h3><Hash size={16} />{official ? "官方热榜热度" : "话题参与度"}</h3><span>TOP {Math.min(6, official ? trendRows.length : topics.length)}</span></div>
      {official ? <HorizontalChart rows={trendRows} label="接口返回帖子量" color={palette[2]} /> : topics.length ? <div className="chart-plot" role="group" aria-label="话题帖子数与参与账号">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={topics.slice(0, 6)} margin={{ top: 15, right: 8, left: -20, bottom: 5 }} accessibilityLayer>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="name" tick={{ ...axis, fontSize: 10 }} tickFormatter={(name: string) => name.length > 7 ? `${name.slice(0, 6)}…` : name} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={axis} tickFormatter={format} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "#8bbaff0b" }} contentStyle={tooltipStyle} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} formatter={(value, name) => [format(Number(value)), name]} />
            <Bar dataKey="postCount" name="帖子数" fill={palette[1]} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            <Bar dataKey="authorCount" name="参与账号" fill={palette[2]} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div> : <EmptyChart />}
      <div className="chart-caption chart-inline-legend">{official ? "地区热榜快照 · 非当日新增讨论量" : <><span><i style={{ background: palette[1] }} />帖子数</span><span><i style={{ background: palette[2] }} />参与账号</span></>}</div>
    </section>}
  </div>;
}

export function OverviewCharts({ topics }: { topics: Array<{ platform: string; category: string; heat: number }> }) {
  const platforms = new Map<string, number>();
  const categories = new Map<string, { total: number; count: number }>();
  for (const topic of topics) {
    platforms.set(topic.platform, (platforms.get(topic.platform) || 0) + 1);
    const category = categories.get(topic.category) || { total: 0, count: 0 };
    category.total += topic.heat;
    category.count += 1;
    categories.set(topic.category, category);
  }
  const platformRows = [...platforms].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);
  const categoryRows = [...categories].map(([name, row]) => ({ name, value: Math.round(row.total / row.count * 10) / 10 })).sort((a, b) => b.value - a.value).slice(0, 7);
  return <div className="overview-charts">
    <section className="chart-section" aria-label="平台热点分布图表"><div className="chart-heading"><h3><BarChart3 size={16} />平台热点分布</h3><span>{topics.length} 条筛选结果</span></div><HorizontalChart rows={platformRows} label="热点数量" /><div className="chart-caption">当前筛选范围 · 按热点数量排序</div></section>
    <section className="chart-section" aria-label="类目热度图表"><div className="chart-heading"><h3><ChartNoAxesCombined size={16} />类目热度</h3><span>平均热度</span></div><HorizontalChart rows={categoryRows} label="平均热度" color={palette[1]} /><div className="chart-caption">当前筛选范围 · 热度值 0–100</div></section>
  </div>;
}
