'use client';

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatInteger, formatPercent } from '@/lib/format';

/**
 * Biểu đồ dùng token màu ngữ nghĩa, không dùng bảng màu mặc định của thư viện.
 *
 * Guideline 13.6: mỗi biểu đồ đi kèm **bảng dữ liệu tương đương** cho screen reader, và không
 * truyền đạt thông tin chỉ bằng màu — nhãn luôn có chữ.
 */

const TONE_HEX = {
  danger: 'var(--tone-danger-text)',
  warning: 'var(--tone-warning-text)',
  info: 'var(--tone-info-text)',
  progress: 'var(--tone-progress-text)',
  success: 'var(--tone-success-text)',
  muted: 'var(--tone-muted-text)',
  strategic: 'var(--tone-strategic-text)',
} as const;

export type ChartTone = keyof typeof TONE_HEX;

export interface BarDatum {
  label: string;
  value: number;
  tone: ChartTone;
}

export function DeadlineRhythmChart({ data }: { data: BarDatum[] }) {
  return (
    <figure className="space-y-3">
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-hover)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(value) => [`${formatInteger(Number(value))} công việc`, '']}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={TONE_HEX[entry.tone]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="sr-only">
        Nhịp deadline:{' '}
        {data.map((d) => `${d.label} ${d.value} công việc`).join(', ')}.
      </figcaption>
    </figure>
  );
}

export interface DonutDatum {
  label: string;
  value: number;
  tone: ChartTone;
}

export function DataHealthDonut({ data }: { data: DonutDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <figure className="space-y-2">
      <div className="h-48 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={TONE_HEX[entry.tone]} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              height={28}
              formatter={(value: string) => (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{value}</span>
              )}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(value, name) => {
                const count = Number(value);
                return [
                  `${formatInteger(count)} bản ghi (${formatPercent(total ? (count / total) * 100 : null)})`,
                  String(name),
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="sr-only">
        Chất lượng dữ liệu trên tổng {total} bản ghi:{' '}
        {data.map((d) => `${d.label} ${d.value}`).join(', ')}.
      </figcaption>
    </figure>
  );
}

export function UtilizationChart({
  data,
}: {
  data: { label: string; value: number; tone: ChartTone }[];
}) {
  return (
    <figure className="space-y-2">
      <div className="w-full" style={{ height: Math.max(160, data.length * 34) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
            <XAxis
              type="number"
              domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              unit="%"
            />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-hover)' }}
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(value) => [formatPercent(Number(value)), 'Mức sử dụng công suất']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={TONE_HEX[entry.tone]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Mức sử dụng công suất: {data.map((d) => `${d.label} ${d.value}%`).join(', ')}.
      </figcaption>
    </figure>
  );
}
