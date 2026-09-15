"use client";

/** Kilo Takibi (Bölüm 8, ekran 10): giriş, trend çizgisi, hareketli ortalama. */

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
import { PageHeader } from "@/components/Layout";
import { ErrorBox, Empty, Loading, Stat, fmt } from "@/components/States";
import { useLogBodyweight, useWeightTrend } from "@/lib/queries";

export default function WeightPage() {
  const trend = useWeightTrend(180);
  const log = useLogBodyweight();
  const [weight, setWeight] = useState("");

  const points = (trend.data ?? []).map((p) => ({
    date: p.date,
    // Recharts sayı bekliyor; backend Decimal'i string olarak döndürüyor.
    kilo: Number.parseFloat(p.weight_kg),
    ortalama: p.moving_average === null ? null : Number.parseFloat(p.moving_average),
    label: new Date(`${p.date}T00:00:00`).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    }),
  }));

  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first ? latest.kilo - first.kilo : null;

  // Trend için ham değer değil hareketli ortalama karşılaştırılıyor — günlük
  // dalgalanma (su, tuz, sindirim) ham farkı anlamsız kılıyor.
  const avgLatest = [...points].reverse().find((p) => p.ortalama !== null)?.ortalama ?? null;
  const avgEarlier =
    points.length >= 14
      ? points[points.length - 8]?.ortalama ?? null
      : null;
  const weeklyTrend =
    avgLatest !== null && avgEarlier !== null ? avgLatest - avgEarlier : null;

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Kilo Takibi"
        info={
          <>
            Günde tek kayıt tutuluyor; aynı güne ikinci giriş üzerine yazıyor.
            Gün içi dalgalanma (su, yemek) trend çizgisini gürültüye boğuyor.
            Karar verirken 7 günlük hareketli ortalamaya bak, tek güne değil.
          </>
        }
      />

      <section className="card p-6">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number.parseFloat(weight.replace(",", "."));
            if (Number.isFinite(value)) {
              log.mutate({ weight_kg: value });
              setWeight("");
            }
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Kilo (kg)</span>
            <input
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Bugünkü kilon (kg)"
              className="tnum h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={log.isPending || !weight}>
            Kaydet
          </button>
        </form>
        {log.isError && <div className="mt-3"><ErrorBox error={log.error} /></div>}
      </section>

      {trend.isLoading ? (
        <Loading />
      ) : trend.isError ? (
        <ErrorBox error={trend.error} onRetry={() => void trend.refetch()} />
      ) : points.length === 0 ? (
        <Empty
          title="Henüz kilo kaydın yok"
          hint="İlk kaydından sonra trend çizgisi ve hareketli ortalama burada görünecek."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Güncel" value={fmt(latest?.kilo, 1)} unit="kg" />
            <Stat
              label="Toplam değişim"
              value={change === null ? "—" : `${change > 0 ? "+" : ""}${fmt(change, 1)}`}
              unit="kg"
            />
            <Stat
              label="Haftalık eğilim"
              value={
                weeklyTrend === null
                  ? "—"
                  : `${weeklyTrend > 0 ? "+" : ""}${fmt(weeklyTrend, 2)}`
              }
              unit={weeklyTrend === null ? "14+ gün gerekli" : "kg/hafta"}
            />
          </div>

          <section className="card p-6">
            <h2 className="text-base">Trend</h2>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }}
                    stroke="var(--color-border)"
                    minTickGap={32}
                  />
                  <YAxis
                    domain={["dataMin - 1", "dataMax + 1"]}
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
                  />
                  <Line
                    type="monotone"
                    dataKey="kilo"
                    stroke="var(--color-ink-faint)"
                    strokeWidth={1}
                    dot={false}
                    name="Ham"
                  />
                  <Line
                    type="monotone"
                    dataKey="ortalama"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="7 günlük ortalama"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-2xs text-[var(--color-ink-faint)]">
              İnce çizgi günlük ölçüm, kalın çizgi 7 günlük hareketli ortalama.
              Kararlarını kalın çizgiye göre ver.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
