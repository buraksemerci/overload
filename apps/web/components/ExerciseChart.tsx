"use client";

/**
 * Hareket başına zaman içindeki ağırlık / hacim / tahmini 1RM grafiği (Bölüm 4.4).
 *
 * **Üç metrik ayrı ayrı gösteriliyor, tek grafikte üst üste değil.** Birimleri
 * farklı: ağırlık ve 1RM kilogram, hacim ton mertebesinde. Aynı eksende
 * çizmek hacmi devleştirip diğer ikisini düz çizgiye indirirdi. Kullanıcı
 * hangisine bakacağını seçiyor.
 */

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty, Loading } from "@/components/States";
import { useExerciseHistory } from "@/lib/queries";

const METRICS = [
  { key: "agirlik", label: "En ağır set", unit: "kg" },
  { key: "tahmini1rm", label: "Tahmini 1RM", unit: "kg" },
  { key: "hacim", label: "Seans hacmi", unit: "kg" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function ExerciseChart({ exerciseId }: { exerciseId: string }) {
  const history = useExerciseHistory(exerciseId);
  const [metric, setMetric] = useState<MetricKey>("tahmini1rm");

  if (history.isLoading) return <Loading label="Grafik yükleniyor…" />;
  if (history.isError || !history.data) return null;

  if (history.data.length < 2) {
    return (
      <Empty
        title="Grafik için en az iki seans gerekiyor"
        hint="Bu hareketi bir kez daha yaptığında ilerleme çizgisi burada görünecek."
      />
    );
  }

  const points = history.data.map((point) => ({
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    }),
    agirlik: Number.parseFloat(point.top_weight_kg),
    tahmini1rm: Number.parseFloat(point.estimated_1rm),
    hacim: Number.parseFloat(point.total_volume_kg),
    tekrar: point.top_reps,
  }));

  const first = points[0]![metric];
  const last = points[points.length - 1]![metric];
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const active = METRICS.find((m) => m.key === metric)!;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="seg" role="group" aria-label="Ölçüt">
          {METRICS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={metric === option.key}
              onClick={() => setMetric(option.key)}
              className="seg-item text-xs"
            >
              {option.label}
            </button>
          ))}
        </div>
        <span
          className="tnum text-xs"
          style={{
            color:
              change > 0
                ? "var(--color-accent-deep)"
                : change < 0
                  ? "var(--color-warning)"
                  : "var(--color-ink-muted)",
          }}
        >
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}% ({points.length} seans)
        </span>
      </div>

      <div className="mt-3 h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }}
              stroke="var(--color-border)"
              minTickGap={24}
            />
            <YAxis
              domain={["dataMin - 2", "dataMax + 2"]}
              tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }}
              stroke="var(--color-border)"
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 5,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-ink-muted)" }}
              // Recharts formatter'ı `ValueType | undefined` geçirebiliyor
              // (boş veri noktası); daraltmadan `toFixed` çağırmak çalışma
              // zamanında patlardı.
              formatter={(value) => {
                const numeric = typeof value === "number" ? value : Number(value);
                return [
                  Number.isFinite(numeric)
                    ? `${numeric.toFixed(1)} ${active.unit}`
                    : "—",
                  active.label,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--color-accent)" }}
              name={active.label}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {metric === "tahmini1rm" && (
        <p className="mt-1 text-2xs text-[var(--color-ink-faint)]">
          1RM Epley formülüyle tahmin ediliyor — gerçek tek tekrar testi değil.
        </p>
      )}
    </div>
  );
}
