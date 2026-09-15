"use client";

/**
 * Kilo Takibi — bir sayı, bir eğilim, bir çizgi.
 *
 * --------------------------------------------------------------------------
 * HANGİ SAYIYA BAKILIYOR
 * --------------------------------------------------------------------------
 * Önceki sürüm üç eşit kart gösteriyordu: güncel, toplam değişim, haftalık
 * eğilim. Üçü de doğru ama karar VERDİREN tek sayı haftalık eğilim: "haftada
 * 0,4 kg iniyorum" bilgisi hedefin tutup tutmadığını söylüyor. Güncel kilo
 * bağlam, toplam değişim ise geçmişe bakış.
 *
 * Şimdi güncel kilo büyük, haftalık eğilim onun yanında ve toplam değişim
 * "?" arkasında. Grafik yerinde kalıyor — bu ekranın var olma sebebi o.
 *
 * --------------------------------------------------------------------------
 * KALIN ÇİZGİ NEDEN VOLT DEĞİL
 * --------------------------------------------------------------------------
 * Hareketli ortalama çizgisi `--color-accent` ile çiziliyordu. Tasarım kuralı
 * grafiklerde volt kullanımına izin veriyor (ölçek olarak) ama burada mesele
 * kural değil görünürlük: %90 parlaklıktaki volt, kırık beyaz zeminde 2px'lik
 * bir çizgi olarak neredeyse kayboluyor. `accent-deep` aynı hue'nun okunur
 * hâli.
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
import { Page, PageHeader, Section } from "@/components/Layout";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { useLogBodyweight, useWeightTrend } from "@/lib/queries";

export default function WeightPage() {
  const trend = useWeightTrend(180);
  const log = useLogBodyweight();
  const [weight, setWeight] = useState("");

  const points = (trend.data ?? []).map((point) => ({
    date: point.date,
    // Recharts sayı bekliyor; backend Decimal'i string olarak döndürüyor.
    kilo: Number.parseFloat(point.weight_kg),
    ortalama:
      point.moving_average === null ? null : Number.parseFloat(point.moving_average),
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    }),
  }));

  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first ? latest.kilo - first.kilo : null;

  // Eğilim için ham değer değil HAREKETLİ ORTALAMA karşılaştırılıyor: günlük
  // dalgalanma (su, tuz, sindirim) ham farkı anlamsız kılıyor.
  const avgLatest =
    [...points].reverse().find((point) => point.ortalama !== null)?.ortalama ?? null;
  const avgEarlier =
    points.length >= 14 ? points[points.length - 8]?.ortalama ?? null : null;
  const weekly = avgLatest !== null && avgEarlier !== null ? avgLatest - avgEarlier : null;

  return (
    <Page>
      <PageHeader
        title="Kilo"
        info={
          <>
            Günde tek kayıt tutuluyor; aynı güne ikinci giriş üzerine yazıyor.
            Gün içi dalgalanma (su, yemek, sindirim) 1-2 kg oynayabiliyor, bu
            yüzden kararlar <strong>7 günlük hareketli ortalamaya</strong> göre
            veriliyor — tek güne göre değil.
            {change !== null && (
              <>
                {" "}
                Bu dönemdeki toplam değişim{" "}
                <strong>
                  {change > 0 ? "+" : ""}
                  {fmt(change, 1)} kg
                </strong>
                .
              </>
            )}
          </>
        }
      />

      {/* --- Bugünün kaydı ve durum -------------------------------------- */}
      <section className="card flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
        {latest ? (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="label">Güncel</p>
              <p className="mt-1">
                <span className="figure tnum text-3xl leading-none">
                  {fmt(latest.kilo, 1)}
                </span>
                <span className="ml-1.5 text-sm text-[var(--color-ink-muted)]">kg</span>
              </p>
            </div>

            <div>
              <p className="label">Haftalık eğilim</p>
              {weekly === null ? (
                <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
                  14+ gün gerekli
                </p>
              ) : (
                <p className="mt-1">
                  <span
                    className="figure tnum text-xl leading-none"
                    style={{
                      // Yön iyi/kötü DEĞİL — hedefe bağlı. Renk yalnızca
                      // duruşu belirginleştiriyor, yargı taşımıyor.
                      color:
                        Math.abs(weekly) < 0.1
                          ? "var(--color-ink-muted)"
                          : "var(--color-accent-deep)",
                    }}
                  >
                    {weekly > 0 ? "+" : ""}
                    {fmt(weekly, 2)}
                  </span>
                  <span className="ml-1.5 text-xs text-[var(--color-ink-faint)]">
                    kg/hafta
                  </span>
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">
            İlk kaydından sonra trend burada görünecek.
          </p>
        )}

        <form
          className="flex shrink-0 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number.parseFloat(weight.replace(",", "."));
            if (Number.isFinite(value)) {
              log.mutate({ weight_kg: value });
              setWeight("");
            }
          }}
        >
          <input
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="0,0"
            aria-label="Bugünkü kilon (kg)"
            className="field tnum h-12 w-24 text-center text-sm"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={log.isPending || !weight}
          >
            {log.isPending ? "…" : "Kaydet"}
          </button>
        </form>
      </section>

      {log.isError && <ErrorBox error={log.error} />}

      {/* --- Trend -------------------------------------------------------- */}
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
        <Section
          title="Trend"
          info="İnce çizgi günlük ölçüm, kalın çizgi 7 günlük hareketli ortalama. Kararlarını kalın çizgiye göre ver — ince çizgi su ve sindirim gürültüsü taşıyor."
        >
          <div className="h-64 w-full lg:h-80">
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
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--color-ink-muted)" }}
                />
                <Line
                  type="monotone"
                  dataKey="kilo"
                  stroke="var(--color-ink-faint)"
                  strokeWidth={1}
                  // Tek ölçüm varken NOKTA gerekiyor: çizgi iki nokta
                  // arasına çiziliyor, yani ilk kaydından sonra grafik
                  // tamamen boş görünüyordu.
                  dot={points.length < 3 ? { r: 2.5 } : false}
                  name="Ham"
                />
                <Line
                  type="monotone"
                  dataKey="ortalama"
                  stroke="var(--color-accent-deep)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name="7 günlük ortalama"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
    </Page>
  );
}
