'use client';

import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_INK, SERIES } from './utils';

/* Shared Recharts building blocks following the dataviz spec:
   thin bars (≤24px) with 4px rounded data-ends, 2px lines, hairline recessive grid,
   one y-axis, tooltips on every chart, legends only for ≥2 series, text in ink tokens. */

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

interface TipPayload {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: TipPayload[]; label?: string | number; fmt: (v: number) => string; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-mist-200 bg-white px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-semibold text-navy-900">{labelFmt ? labelFmt(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-navy-900">{fmt(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = { tick: { fill: CHART_INK.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: CHART_INK.grid } } as const;

function LegendRow({ series }: { series: SeriesDef[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color ?? SERIES[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Vertical columns over a category/time axis; ≥2 series stack with a 2px surface gap. */
export function ColumnChart({ data, x, series, fmt, xFmt, height = 260, stacked }: { data: Record<string, unknown>[]; x: string; series: SeriesDef[]; fmt: (v: number) => string; xFmt?: (v: string) => string; height?: number; stacked?: boolean }) {
  return (
    <div>
      {series.length > 1 && <LegendRow series={series} />}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis dataKey={x} {...axisProps} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={(v: number) => fmt(v)} allowDecimals={false} />
          <Tooltip cursor={{ fill: '#f1f3f6' }} content={(p) => <ChartTooltip {...(p as object)} fmt={fmt} labelFmt={xFmt} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? SERIES[i]}
              maxBarSize={24}
              stackId={stacked ? 'a' : undefined}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              stroke="#ffffff"
              strokeWidth={stacked ? 1 : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for ranked categories (long labels read left-to-right). */
export function RankBarChart({ data, y, series, fmt, height, stacked, labelWidth = 120 }: { data: Record<string, unknown>[]; y: string; series: SeriesDef[]; fmt: (v: number) => string; height?: number; stacked?: boolean; labelWidth?: number }) {
  const h = height ?? Math.max(160, data.length * 34 + 40);
  return (
    <div>
      {series.length > 1 && <LegendRow series={series} />}
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
          <XAxis type="number" {...axisProps} tickFormatter={(v: number) => fmt(v)} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey={y}
            {...axisProps}
            axisLine={false}
            width={labelWidth}
            tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
          />
          <Tooltip cursor={{ fill: '#f1f3f6' }} content={(p) => <ChartTooltip {...(p as object)} fmt={fmt} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? SERIES[i]}
              maxBarSize={20}
              stackId={stacked ? 'a' : undefined}
              radius={!stacked || i === series.length - 1 ? [0, 4, 4, 0] : 0}
              stroke="#ffffff"
              strokeWidth={stacked ? 1 : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series trend: 2px line over a 10% wash. */
export function TrendChart({ data, x, y, label, fmt, xFmt, height = 260, color = SERIES[0] }: { data: Record<string, unknown>[]; x: string; y: string; label: string; fmt: (v: number) => string; xFmt?: (v: string) => string; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
        <XAxis dataKey={x} {...axisProps} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => fmt(v)} />
        <Tooltip cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }} content={(p) => <ChartTooltip {...(p as object)} fmt={fmt} labelFmt={xFmt} />} />
        <Area type="monotone" dataKey={y} name={label} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: '#ffffff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Card wrapper for a chart with an accessible table toggle. */
export function ChartCard({ title, subtitle, children, empty, action }: { title: string; subtitle?: string; children: ReactNode; empty?: boolean; action?: ReactNode }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {empty ? <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400">No data yet</div> : children}
    </div>
  );
}

