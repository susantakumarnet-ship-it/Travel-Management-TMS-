'use client';

import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { inr, istToday } from '@/lib/format';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { CHART_INK, SERIES, compactInr, reportError } from '@/components/admin/utils';

interface ReportColumn {
  key: string;
  label: string;
  type?: 'money' | 'number' | 'text' | 'date';
}
interface Report {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
}

const fmtCell = (c: ReportColumn, v: unknown) => {
  if (v == null || v === '') return '—';
  if (c.type === 'money') return inr(Number(v));
  if (c.type === 'number') return Number(v).toLocaleString('en-IN');
  if (c.type === 'date') return String(v).slice(0, 10);
  return String(v);
};

export default function ReportsPage() {
  const types = useApi<Record<string, string>>('/admin/reports');
  const [type, setType] = useState('bookings');
  const [from, setFrom] = useState(istToday().slice(0, 8) + '01');
  const [to, setTo] = useState(istToday());
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const query = { from, to, period };
  async function run() {
    setLoading(true);
    setError(null);
    try {
      setReport(await api<Report>(`/admin/reports/${type}`, { query: { ...query, format: 'json' } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function exportAs(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(format);
    try {
      await downloadFile(`/admin/reports/${type}`, { ...query, format }, `royal-ride-${type}-${from}.${format}`);
    } catch (e) {
      reportError(e);
    } finally {
      setExporting(null);
    }
  }

  // Chart: first text column as category (if it looks like a period/name) against the first money column.
  const chart = useMemo(() => {
    if (!report || report.rows.length < 2) return null;
    const cat = report.columns.find((c) => !c.type || c.type === 'text' || c.type === 'date');
    const val = report.columns.find((c) => c.type === 'money') ?? report.columns.find((c) => c.type === 'number');
    if (!cat || !val) return null;
    const rows = report.rows.slice(0, 31).map((r) => ({ name: String(r[cat.key] ?? ''), value: Number(r[val.key] ?? 0) }));
    return { cat, val, rows };
  }, [report]);

  const invalidRange = from > to;

  return (
    <>
      <PageHeader title="Reports & analytics" subtitle="Run a report, preview it, then export to CSV, Excel or PDF" />
      <Card className="mb-6">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Field label="Report">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(types.data ?? { bookings: 'Bookings summary' }).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" error={invalidRange ? 'Must be after start' : undefined}>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} invalid={invalidRange} />
          </Field>
          <Field label="Group by" hint={type === 'bookings' ? undefined : 'Used by the bookings report'}>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </Select>
          </Field>
          <Button icon={<Play className="h-4 w-4" />} onClick={run} loading={loading} disabled={invalidRange || !from}>
            Run report
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-mist-100 pt-4">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Export</span>
          <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting === 'csv'} disabled={invalidRange} onClick={() => exportAs('csv')}>
            CSV
          </Button>
          <Button size="sm" variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} loading={exporting === 'xlsx'} disabled={invalidRange} onClick={() => exportAs('xlsx')}>
            Excel
          </Button>
          <Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />} loading={exporting === 'pdf'} disabled={invalidRange} onClick={() => exportAs('pdf')}>
            PDF
          </Button>
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={run} />}
      {loading && !report && <Skeleton className="h-72" />}
      {!loading && !report && !error && <EmptyState title="Choose a report and run it" description="Results preview here before you export." />}

      {report && (
        <div className="space-y-6">
          {chart && (
            <Card>
              <h3 className="text-base font-semibold text-navy-900">{chart.val.label}</h3>
              <p className="mb-4 text-sm text-slate-500">by {chart.cat.label.toLowerCase()}</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_INK.axis }} tickLine={false} axisLine={{ stroke: CHART_INK.grid }} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART_INK.axis }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v: number) => (chart.val.type === 'money' ? compactInr(v) : v.toLocaleString('en-IN'))}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(11,31,75,0.05)' }}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e4e7ec', fontSize: 12 }}
                      formatter={(v) => [chart.val.type === 'money' ? inr(Number(v)) : Number(v).toLocaleString('en-IN'), chart.val.label]}
                    />
                    <Bar dataKey="value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          <div className="card overflow-hidden">
            <div className="border-b border-mist-200 px-5 py-4">
              <h3 className="text-base font-semibold text-navy-900">{report.title}</h3>
              <p className="text-sm text-slate-500">
                {report.rows.length} row{report.rows.length === 1 ? '' : 's'}
              </p>
            </div>
            {report.rows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No data for this period" />
              </div>
            ) : (
              <div className="scrollbar-thin max-h-[70vh] overflow-auto">
                <table className="table-base">
                  <thead className="sticky top-0">
                    <tr>
                      {report.columns.map((c) => (
                        <th key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right' : ''}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr key={i}>
                        {report.columns.map((c) => (
                          <td key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}>
                            {fmtCell(c, r[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {report.totals && Object.keys(report.totals).length > 0 && (
                      <tr className="bg-navy-50 font-semibold text-navy-900">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}>
                            {i === 0 ? 'Total' : report.totals![c.key] != null ? fmtCell(c, report.totals![c.key]) : ''}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
