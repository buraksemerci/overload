"use client";

/**
 * Pano grafikleri.
 *
 * --------------------------------------------------------------------------
 * AZ ÇİZGİ, BÜYÜK SAYI
 * --------------------------------------------------------------------------
 * Her grafik tek bir soruya cevap veriyor ve cevabın kendisi grafiğin
 * ÜSTÜNDE büyük bir sayı olarak yazıyor ("bu hafta 12,4 t"). Grafik o sayının
 * bağlamı: artıyor mu, geçen haftalara göre nerede. Eksen çizgileri, ızgara,
 * lejant yok — okunması gereken değer zaten yazılı; çizgiler yalnızca
 * gürültü ekliyordu.
 *
 * Koyu karolarda volt DOLGU: ışık gibi duruyor ve kural 1 (volt metin
 * taşımaz) bozulmuyor — yazılar açık renk.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = (night: boolean): React.CSSProperties => ({
  background: night ? "var(--color-night-raised)" : "var(--color-surface)",
  border: `1px solid ${night ? "var(--color-night-line)" : "var(--color-border-strong)"}`,
  borderRadius: 0,
  fontSize: 12,
  color: night ? "var(--color-on-night)" : "var(--color-ink)",
  padding: "6px 10px",
});

/* --- Sütunlar ---------------------------------------------------------------- */

export interface BarPoint {
  label: string;
  value: number;
  /** Vurgulanan sütun (ör. bu hafta). */
  current?: boolean;
}

export function Bars({
  data,
  night = false,
  height = 180,
  format = (value: number) => value.toLocaleString("tr-TR"),
  unit = "",
}: {
  data: BarPoint[];
  night?: boolean;
  height?: number;
  format?: (value: number) => string;
  unit?: string;
}) {
  const dim = night ? "oklch(99% 0 0 / 0.16)" : "var(--color-heat-2)";
  const lit = night ? "var(--color-accent)" : "var(--color-accent-deep)";
  const axis = night ? "var(--color-on-night-faint)" : "var(--color-ink-faint)";

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis
            dataKey="label"
            tick={{ fill: axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ fill: night ? "oklch(99% 0 0 / 0.06)" : "var(--color-surface-raised)" }}
            contentStyle={tooltipStyle(night)}
            labelStyle={{ color: night ? "var(--color-on-night-muted)" : "var(--color-ink-muted)" }}
            formatter={(value) => [`${format(Number(value))}${unit ? ` ${unit}` : ""}`, ""]}
            separator=""
          />
          <Bar dataKey="value" isAnimationActive={false}>
            {data.map((point) => (
              <Cell key={point.label} fill={point.current ? lit : dim} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --- Eğilim alanı ------------------------------------------------------------- */

export interface TrendPoint {
  label: string;
  value: number;
  /** İsteğe bağlı ikinci seri: hareketli ortalama. */
  average?: number | null;
}

export function Trend({
  data,
  night = false,
  height = 160,
  format = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 1 }),
  unit = "",
  id,
}: {
  data: TrendPoint[];
  night?: boolean;
  height?: number;
  format?: (value: number) => string;
  unit?: string;
  /** Gradyan kimliği sayfada tekil olmalı. */
  id: string;
}) {
  const stroke = night ? "var(--color-accent)" : "var(--color-ink)";
  const axis = night ? "var(--color-on-night-faint)" : "var(--color-ink-faint)";
  const hasAverage = data.some((point) => point.average != null);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={night ? "oklch(90% 0.19 118)" : "oklch(56% 0.14 118)"} stopOpacity={night ? 0.35 : 0.22} />
              <stop offset="100%" stopColor={night ? "oklch(90% 0.19 118)" : "oklch(56% 0.14 118)"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            contentStyle={tooltipStyle(night)}
            labelStyle={{ color: night ? "var(--color-on-night-muted)" : "var(--color-ink-muted)" }}
            formatter={(value, name) => [
              `${format(Number(value))}${unit ? ` ${unit}` : ""}`,
              name === "average" ? "ortalama" : "",
            ]}
            separator=" "
          />
          <Area
            type="monotone"
            dataKey={hasAverage ? "average" : "value"}
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${id})`}
            isAnimationActive={false}
            connectNulls
          />
          {hasAverage && (
            <Area
              type="monotone"
              dataKey="value"
              stroke={night ? "oklch(99% 0 0 / 0.35)" : "var(--color-ink-faint)"}
              strokeWidth={1}
              strokeDasharray="2 3"
              fill="none"
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --- Halka --------------------------------------------------------------------- */

/**
 * Tek bir oran: harcanan / hedef. SVG, grafik kütüphanesi değil — iki daire
 * için bir kütüphane bileşeni ölçüm döngüsü ve boyut belirsizliği getiriyordu.
 */
export function Ring({
  value,
  max,
  size = 168,
  stroke = 12,
  night = false,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  night?: boolean;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const over = max > 0 && value > max;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={night ? "oklch(99% 0 0 / 0.12)" : "var(--color-surface-raised)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={over ? "var(--color-warning)" : night ? "var(--color-accent)" : "var(--color-accent-deep)"}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset var(--dur-long) var(--ease-out)" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      )}
    </div>
  );
}

/* --- Yatay oran çubuğu ------------------------------------------------------------ */

export function Meter({
  value,
  max,
  night = false,
  tone = "accent",
}: {
  value: number;
  max: number;
  night?: boolean;
  tone?: "accent" | "warning" | "neutral";
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const fill =
    tone === "warning"
      ? "var(--color-warning)"
      : tone === "neutral"
        ? night
          ? "oklch(99% 0 0 / 0.5)"
          : "var(--color-ink-faint)"
        : night
          ? "var(--color-accent)"
          : "var(--color-accent-deep)";
  return (
    <div
      className="h-1.5 w-full overflow-hidden"
      style={{ background: night ? "oklch(99% 0 0 / 0.1)" : "var(--color-surface-raised)" }}
    >
      <div
        className="h-full"
        style={{
          width: `${ratio * 100}%`,
          background: fill,
          transition: "width var(--dur-long) var(--ease-out)",
        }}
      />
    </div>
  );
}
