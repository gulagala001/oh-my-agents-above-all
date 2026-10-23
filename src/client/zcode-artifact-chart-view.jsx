// Derived from pinned Apache-2.0 ArtifactChartView; see THIRD_PARTY_NOTICES.md.
// Source SHA-256 13e8da1a2d359fff9b252434c7eb29cb414b30b5b2b85cd5f671adef229c47c6; byte-identical at ZCode 3.15.1 aac4755666d09fdcd70272fcf063c077a639015f.
// Native port: optional nativeModel; all original plot/legend/tooltip and fallback fold preserved.
import { memo, useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis
} from "recharts";
import {
  applyArtifactItems
} from "@/app-shell/workflow-artifacts/presets/apply.js";
import {
  artifactSeriesColorVar,
  artifactSeriesDash,
  artifactSeriesSymbol,
  ARTIFACT_CHART_MAX_SERIES
} from "@/app-shell/workflow-artifacts/presets/palette.js";
import {
  fieldHeading,
  PresetEmpty,
  PresetHeading,
  REVEAL_ANIMATION_CLASS
} from "@/app-shell/workflow-artifacts/presets/parts.js";
import { cn } from "@/components/lib/utils.js";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart.js";
const MAX_VISIBLE_DOTS = 60;
const FULL_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };
const COMPACT_MARGIN = { top: 4, right: 4, bottom: 4, left: 4 };
function renderRevealDot(props) {
  const { cx, cy, payload, stroke, index } = props;
  if (typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }
  const sequence = payload && typeof payload === "object" && typeof payload.sequence === "number" ? payload.sequence : index;
  return <circle
    className={REVEAL_ANIMATION_CLASS}
    cx={cx}
    cy={cy}
    fill={stroke}
    key={`reveal-${sequence}`}
    r={4}
  />;
}
function buildChartConfig(model) {
  return model.series.reduce((config, series) => {
    config[series.key] = {
      label: series.label,
      color: artifactSeriesColorVar(series.colorIndex)
    };
    return config;
  }, {});
}
function seriesMarks(model, showDots) {
  return model.series.map((series) => {
    const color = `var(--color-${series.key})`;
    if (model.type === "bar") {
      return <Bar dataKey={series.key} fill={color} key={series.key} isAnimationActive={false} />;
    }
    if (model.type === "scatter") {
      return <Scatter
        dataKey={series.key}
        fill={color}
        isAnimationActive={false}
        key={series.key}
        shape={artifactSeriesSymbol(series.colorIndex)}
      />;
    }
    return <Line
      connectNulls={false}
      dataKey={series.key}
      dot={showDots ? renderRevealDot : false}
      isAnimationActive={false}
      key={series.key}
      stroke={color}
      strokeDasharray={artifactSeriesDash(series.colorIndex)}
      strokeWidth={2}
      type="monotone"
    />;
  });
}
function chartPlotPropsEqual(previous, next) {
  if (previous.compact !== next.compact) {
    return false;
  }
  const a = previous.model;
  const b = next.model;
  if (a.type !== b.type || a.scale !== b.scale || a.x.numeric !== b.x.numeric) {
    return false;
  }
  if (a.series.length !== b.series.length) {
    return false;
  }
  if (a.series.some((series, index) => series.label !== b.series[index]?.label)) {
    return false;
  }
  if (a.points.length !== b.points.length) {
    return false;
  }
  if (a.points[0]?.sequence !== b.points[0]?.sequence) {
    return false;
  }
  if (a.points.at(-1)?.sequence !== b.points.at(-1)?.sequence) {
    return false;
  }
  if (a.baseline?.value !== b.baseline?.value) {
    return false;
  }
  return a.domain?.xMin === b.domain?.xMin && a.domain?.xMax === b.domain?.xMax && a.domain?.yMin === b.domain?.yMin && a.domain?.yMax === b.domain?.yMax;
}
const ArtifactChartPlot = memo(function ArtifactChartPlot2({ model, compact }) {
  const config = useMemo(() => buildChartConfig(model), [model]);
  const showDots = model.points.length <= MAX_VISIBLE_DOTS;
  const categoricalX = model.type === "bar" || !model.x.numeric;
  const logDomain = model.scale === "log" && model.domain ? [model.domain.yMin, model.domain.yMax] : void 0;
  if (compact) {
    return <ChartContainer className="h-14 w-full" config={config}>
        <ComposedChart data={model.points} margin={COMPACT_MARGIN}>
          <XAxis
      dataKey={categoricalX ? "xLabel" : "x"}
      hide
      type={categoricalX ? "category" : "number"}
    />
          <YAxis hide {...logDomain ? { domain: logDomain, scale: "log" } : {}} />
          {seriesMarks(model, showDots && model.points.length <= 24)}
        </ComposedChart>
      </ChartContainer>;
  }
  return <ChartContainer className="h-56 w-full" config={config}>
      <ComposedChart data={model.points} margin={FULL_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
    axisLine={false}
    dataKey={categoricalX ? "xLabel" : "x"}
    minTickGap={16}
    tickLine={false}
    tickMargin={8}
    type={categoricalX ? "category" : "number"}
    {...categoricalX ? {} : { domain: ["dataMin", "dataMax"] }}
  />
        <YAxis
    axisLine={false}
    tickLine={false}
    tickMargin={4}
    width={44}
    {...logDomain ? { domain: logDomain, scale: "log" } : {}}
  />
        {model.baseline ? <ReferenceLine
    label={{
      fill: "var(--color-foreground-subtle)",
      fontSize: 10,
      position: "insideTopRight",
      value: model.baseline.label
    }}
    stroke="var(--color-foreground-subtlest)"
    strokeDasharray="4 4"
    y={model.baseline.value}
  /> : null}
        <ChartTooltip
    content={<ChartTooltipContent
      labelFormatter={(_label, payload) => {
        const point = payload?.[0]?.payload;
        return fieldHeading(point?.xLabel ?? "", model.x.unit);
      }}
    />}
    cursor={false}
  />
        {seriesMarks(model, showDots)}
      </ComposedChart>
    </ChartContainer>;
}, chartPlotPropsEqual);
function ChartLegendRow({ model }) {
  const latest = model.points.at(-1);
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="list">
      {model.series.map((series) => {
    const value = latest?.[series.key];
    return <span
      className="flex min-w-0 items-center gap-1.5 text-ui-sm"
      data-testid="artifact-chart-legend-item"
      key={series.key}
      role="listitem"
    >
            <svg aria-hidden="true" className="shrink-0" height={8} width={16}>
              <line
      stroke={artifactSeriesColorVar(series.colorIndex)}
      strokeDasharray={artifactSeriesDash(series.colorIndex)}
      strokeWidth={2}
      x1={0}
      x2={16}
      y1={4}
      y2={4}
    />
            </svg>
            <span className="truncate text-foreground-subtle">{series.label}</span>
            {typeof value === "number" ? (
      // 直接标注最新值：图例不只是一块色块 + 名字，它同时是这条序列此刻的读数。
      <span className="shrink-0 font-mono text-ui-xs text-foreground tabular-nums">
                {series.unit ? `${value} ${series.unit}` : String(value)}
              </span>
    ) : null}
          </span>;
  })}
    </div>;
}
function CompactLatestValue({ model }) {
  const series = model.series[0];
  const latest = model.points.at(-1);
  const value = series && latest ? latest[series.key] : void 0;
  if (typeof value !== "number") {
    return null;
  }
  return <span className="flex shrink-0 items-baseline gap-1" data-testid="artifact-chart-latest">
      <span
    className={cn(
      "font-mono text-ui-base font-medium text-foreground tabular-nums",
      REVEAL_ANIMATION_CLASS
    )}
    key={`latest-${latest?.sequence ?? "none"}`}
  >
        {value}
      </span>
      {series?.unit ? <span className="text-ui-xs text-foreground-subtle">{series.unit}</span> : null}
    </span>;
}
function ArtifactChartView({
  spec,
  items,
  nativeModel,
  compact = false,
  labels,
  className
}) {
  const model = useMemo(() => {
    const built = nativeModel ?? applyArtifactItems("chart", spec, items);
    return built.series.length > ARTIFACT_CHART_MAX_SERIES ? { ...built, series: built.series.slice(0, ARTIFACT_CHART_MAX_SERIES) } : built;
  }, [spec, items, nativeModel]);
  if (model.points.length === 0) {
    return <div className={className}>
        {compact ? null : <PresetHeading className="mb-3" description={spec.description} title={spec.title} />}
        <PresetEmpty compact={compact} label={labels.empty} />
      </div>;
  }
  if (compact) {
    return <div
      className={cn("flex min-w-0 items-center gap-2", className)}
      data-testid="artifact-chart-compact"
    >
        <div className="min-w-0 flex-1">
          <ArtifactChartPlot compact model={model} />
        </div>
        <CompactLatestValue model={model} />
      </div>;
  }
  return <div className={cn("min-w-0", className)} data-testid="artifact-chart">
      <PresetHeading className="mb-2" description={spec.description} title={spec.title} />
      <div className="mb-2">
        <ChartLegendRow model={model} />
      </div>
      <ArtifactChartPlot compact={false} model={model} />
      <div className="mt-1 text-center text-ui-xs text-foreground-subtlest">
        {fieldHeading(model.x.label, model.x.unit)}
      </div>
    </div>;
}
var stdin_default = ArtifactChartView;
export {
  ArtifactChartView,
  chartPlotPropsEqual,
  stdin_default as default
};
