"use client";

/**
 * Kilo Takibi — bir sayı, bir hız, bir çizgi.
 *
 * --------------------------------------------------------------------------
 * HANGİ SAYIYA BAKILIYOR
 * --------------------------------------------------------------------------
 * Karar VERDİREN sayı haftalık hız: "haftada 0,4 kg iniyorum" bilgisi hedefin
 * tutup tutmadığını söylüyor. Güncel kilo bağlam. Hız tek başına da eksikti:
 * -0,4 kg/hafta yağ kaybı isteyen için iyi, kas kazanmak isteyen için kötü.
 * Şimdi hız, beslenme hedefine göre sağlıklı bandın üzerinde gösteriliyor.
 *
 * --------------------------------------------------------------------------
 * GİRİŞ BANTTA
 * --------------------------------------------------------------------------
 * Bu ekranın her günkü işi tek bir sayı yazmak. Giriş alanı bandın içinde,
 * dünkü kiloyla dolu başlıyor ve ±0,1 düğmeleriyle çoğu gün klavye hiç
 * açılmadan kaydediliyor.
 *
 * --------------------------------------------------------------------------
 * GRAFİKTE KALIN ÇİZGİ ORTALAMA
 * --------------------------------------------------------------------------
 * İnce kesikli çizgi günlük ölçüm, kalın çizgi 7 günlük hareketli ortalama.
 * Gece zemininde volt; açık temada kaybolduğu için eskiden `accent-deep`ti.
 */

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
import { ErrorBox, Empty, fmt } from "@/components/States";
import { useLogBodyweight, useMe, useWeightTrend } from "@/lib/queries";
import {
  rateBand,
  rateVerdict,
  shortDay,
  weeklyAverages,
  weeklyRate,
  weightSummary,
  type BodyGoal,
  type RateVerdict,
} from "@/lib/stats";

const RANGES = [
  { days: 30, label: "30 gün" },
  { days: 90, label: "90 gün" },
  { days: 180, label: "180 gün" },
] as const;

const GOAL_LABEL: Record<BodyGoal, string> = {
  cut: "Yağ kaybı",
  maintain: "Koruma",
  bulk: "Kas kazanımı",
};

/** Hızın hedefe göre tek cümlelik yorumu. Korumada "ters yön" yok: iki yön de sapma. */
function verdictText(goal: BodyGoal, rate: number, bodyweight: number): string {
  const verdict: RateVerdict = rateVerdict(goal, rate, bodyweight);
  if (verdict === "in-band") return "Hedef bandındasın.";
  if (goal === "maintain") return rate < 0 ? "Bandın altında: kilo veriyorsun." : "Bandın üstünde: kilo alıyorsun.";
  if (verdict === "too-fast") return "Doğru yöndesin ama bandın üstünde bir hızla.";
  if (verdict === "too-slow") return "Doğru yöndesin ama bandın altında kalıyorsun.";
  return goal === "cut" ? "Hedefin tersine kilo alıyorsun." : "Hedefin tersine kilo veriyorsun.";
}

/** İşaretli sayı. Yuvarlanınca sıfır kalan değer işaretsiz: "−0,0" yazmıyor. */
const signed = (value: number, digits: number) => {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${fmt(Math.abs(rounded), digits)}`;
};

export default function WeightPage() {
  const trend = useWeightTrend(180);
  const me = useMe();
  const [range, setRange] = useState<number>(90);

  const all = trend.data ?? [];
  const latest = all.at(-1);
  const latestKg = latest ? Number.parseFloat(latest.weight_kg) : null;
  const rate = weeklyRate(all);
  const month = weightSummary(all, 30);
  const goal: BodyGoal = me.data?.nutrition_goal ?? "maintain";

  const cutoff = latest
    ? new Date(`${latest.date}T00:00:00`).getTime() - range * 86_400_000
    : 0;
  const points = all
    .filter((point) => new Date(`${point.date}T00:00:00`).getTime() > cutoff)
    .map((point) => ({
      // Recharts sayı bekliyor; backend Decimal'i string olarak döndürüyor.
      kilo: Number.parseFloat(point.weight_kg),
      ortalama: point.moving_average === null ? null : Number.parseFloat(point.moving_average),
      label: shortDay(new Date(`${point.date}T00:00:00`)),
    }));

  const change = points.length > 1 ? points.at(-1)!.kilo - points[0]!.kilo : null;

  return (
    <Page>
      <Hero
        photo="app-scale"
        position="right center"
        size="lg"
        eyebrow="Vücut"
        title="Kilo"
        lead={
          latestKg !== null && rate !== null
            ? `${GOAL_LABEL[goal]} hedefinde. ${verdictText(goal, rate, latestKg)}`
            : "Her sabah aynı koşulda tart; kararları 7 günlük ortalama verir."
        }
        info={
          <>
            Günde tek kayıt tutuluyor; aynı güne ikinci giriş üzerine yazıyor.
            Gün içi dalgalanma (su, yemek, sindirim) 1-2 kg oynayabiliyor, bu
            yüzden kararlar <strong>7 günlük hareketli ortalamaya</strong> göre
            veriliyor — tek güne göre değil.
          </>
        }
        actions={<QuickEntry last={latestKg} />}
      >
        <HeroStats>
          <HeroStat
            label="Güncel"
            value={latestKg !== null ? fmt(latestKg, 1) : "—"}
            unit="kg"
            foot={latest ? shortDay(new Date(`${latest.date}T00:00:00`)) : undefined}
          />
          <HeroStat
            label="Haftalık hız"
            value={rate !== null ? signed(rate, 2) : "—"}
            unit="kg/hafta"
            foot={rate === null ? "14+ gün gerekli" : undefined}
          />
          <HeroStat
            label="30 gün"
            value={month?.delta != null ? signed(month.delta, 1) : "—"}
            unit="kg"
          />
          <HeroStat
            label="Ortalama"
            value={month?.average != null ? fmt(month.average, 1) : "—"}
            unit="kg"
            foot="7 gün"
          />
        </HeroStats>
      </Hero>

      {trend.isError ? (
        <ErrorBox error={trend.error} onRetry={() => void trend.refetch()} />
      ) : trend.isLoading ? (
        <div aria-busy className="tile-night min-h-[28rem]" />
      ) : all.length === 0 ? (
        <Empty
          title="Henüz kilo kaydın yok"
          hint="İlk kaydından sonra trend çizgisi ve hareketli ortalama burada görünecek."
        />
      ) : (
        <>
          <Section
            night
            title="Trend"
            info="İnce kesikli çizgi günlük ölçüm, kalın çizgi 7 günlük hareketli ortalama. Kararlarını kalın çizgiye göre ver — ince çizgi su ve sindirim gürültüsü taşıyor."
            actions={
              <div className="flex flex-wrap items-center gap-4">
                {change !== null && (
                  <span className="tnum text-sm" style={{ color: "var(--color-on-night-muted)" }}>
                    {signed(change, 1)} kg bu aralıkta
                  </span>
                )}
                <div className="seg" role="group" aria-label="Zaman aralığı">
                  {RANGES.map((option) => (
                    <button
                      key={option.days}
                      type="button"
                      aria-pressed={range === option.days}
                      onClick={() => setRange(option.days)}
                      className="seg-item"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            <TrendChart points={points} />
          </Section>

          <div className="grid gap-4 lg:grid-cols-12">
            {latestKg !== null && (
              <RatePanel goal={goal} rate={rate} bodyweight={latestKg} className="lg:col-span-7" />
            )}
            <WeeksPanel points={all} className="lg:col-span-5" />
          </div>
        </>
      )}
    </Page>
  );
}

/* --- Hızlı giriş ------------------------------------------------------------- */

function QuickEntry({ last }: { last: number | null }) {
  const log = useLogBodyweight();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Boş alan yerine dünkü kilo: çoğu gün fark 0,1-0,3 kg ve ±0,1 ile bulunuyor.
  const value = draft ?? (last !== null ? fmt(last, 1) : "");
  const parsed = Number.parseFloat(value.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 20 && parsed <= 400;

  const nudge = (by: number) => {
    const base = Number.isFinite(parsed) ? parsed : (last ?? 70);
    setDraft(fmt(Math.round((base + by) * 10) / 10, 1));
    setSaved(false);
  };

  return (
    <form
      className="glass flex flex-col gap-3 p-4 sm:w-[21rem]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        log.mutate(
          { weight_kg: parsed },
          {
            onSuccess: () => {
              setDraft(null);
              setSaved(true);
            },
          },
        );
      }}
    >
      <p className="label" style={{ color: "var(--color-on-night-muted)" }}>
        Bugünkü tartı
      </p>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => nudge(-0.1)}
          aria-label="0,1 kg azalt"
          className="btn-on-photo grid w-11 shrink-0 place-items-center text-lg"
        >
          −
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 border-b py-1" style={{ borderColor: "oklch(99% 0 0 / 0.3)" }}>
          <input
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
            placeholder="0,0"
            aria-label="Bugünkü kilon (kg)"
            className="display tnum w-full min-w-0 bg-transparent text-center text-3xl outline-none"
            style={{ color: "var(--color-on-night)" }}
          />
          <span className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            kg
          </span>
        </label>
        <button
          type="button"
          onClick={() => nudge(0.1)}
          aria-label="0,1 kg artır"
          className="btn-on-photo grid w-11 shrink-0 place-items-center text-lg"
        >
          +
        </button>
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={log.isPending || !valid}>
        {log.isPending ? "Kaydediliyor…" : saved ? "Kaydedildi" : "Kaydet"}
      </button>
      {log.isError && <ErrorBox error={log.error} />}
    </form>
  );
}

/* --- Grafik ---------------------------------------------------------------------- */

function TrendChart({ points }: { points: Array<{ kilo: number; ortalama: number | null; label: string }> }) {
  // Tam sayılara oturan eksen: "dataMin - 1" 79,3 / 81,3 / 83,8 gibi düzensiz
  // etiketler üretiyordu.
  const values = points.map((point) => point.kilo);
  const low = Math.floor(Math.min(...values) - 0.5);
  const span = Math.ceil(Math.max(...values) + 0.5) - low;
  const step = Math.max(1, Math.ceil(span / 4));
  const ticks = Array.from({ length: Math.ceil(span / step) + 1 }, (_, index) => low + index * step);
  return (
    <div className="h-72 w-full sm:h-[26rem]">
      <ResponsiveContainer width="100%" height="100%">
        {/* `left: 0`. Negatif sol boşluk ekseni sola çekiyordu ve
            `width={44}` içine sığmayan etiketin İLK KARAKTERİ
            kırpılıyordu: "80,7" ekranda "0,7" olarak duruyordu. */}
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="kilo-alan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(90% 0.19 118)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="oklch(90% 0.19 118)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(99% 0 0 / 0.07)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-on-night-faint)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            domain={[ticks[0]!, ticks.at(-1)!]}
            ticks={ticks}
            tick={{ fill: "var(--color-on-night-faint)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            // Ham eksen değeri "80.7166" gibi çıkıyor: hem nokta hem altı
            // basamak. Uzun etiket `width` içine sığmıyor ve taşan kısmı
            // SVG'nin dışında kalıp kırpılıyordu.
            tickFormatter={(value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-night-raised)",
              border: "1px solid var(--color-night-line)",
              fontSize: 12,
              color: "var(--color-on-night)",
            }}
            labelStyle={{ color: "var(--color-on-night-muted)" }}
            formatter={(value, name) => {
              const numeric = typeof value === "number" ? value : Number(value);
              return [Number.isFinite(numeric) ? `${fmt(numeric, 1)} kg` : "—", name];
            }}
          />
          <Area
            type="monotone"
            dataKey="ortalama"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            fill="url(#kilo-alan)"
            connectNulls
            isAnimationActive={false}
            name="7 günlük ortalama"
          />
          <Line
            type="monotone"
            dataKey="kilo"
            stroke="oklch(99% 0 0 / 0.45)"
            strokeWidth={1}
            strokeDasharray="2 3"
            // Tek ölçüm varken NOKTA gerekiyor: çizgi iki nokta arasına
            // çiziliyor, yani ilk kaydından sonra grafik boş görünüyordu.
            dot={points.length < 3 ? { r: 3, fill: "var(--color-on-night)" } : false}
            isAnimationActive={false}
            name="Ölçüm"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --- Hedefe göre hız ------------------------------------------------------------ */

/**
 * -1,5 … +1,5 kg/hafta ölçeğinde sağlıklı bant ve bugünkü hız. Yön iyi/kötü
 * DEĞİL — hedefe bağlı; bu yüzden tek başına bir sayı değil, bandın
 * neresinde olduğu gösteriliyor.
 */
function RatePanel({
  goal,
  rate,
  bodyweight,
  className,
}: {
  goal: BodyGoal;
  rate: number | null;
  bodyweight: number;
  className: string;
}) {
  const band = rateBand(goal, bodyweight);
  const limit = 1.5;
  const at = (value: number) => `${((Math.max(-limit, Math.min(limit, value)) + limit) / (2 * limit)) * 100}%`;

  return (
    <section className={`card flex flex-col p-6 lg:p-8 ${className}`}>
      <p className="label">Hedefe göre hız · {GOAL_LABEL[goal]}</p>
      <p className="display mt-3 text-2xl lg:text-3xl">
        {rate !== null ? verdictText(goal, rate, bodyweight) : "Hız için iki haftalık ölçüm gerekiyor."}
      </p>
      <p className="tnum mt-2 text-sm text-[var(--color-ink-muted)]">
        Sağlıklı bant: {signed(band.min, 2)} ile {signed(band.max, 2)} kg/hafta
      </p>

      <div className="mt-auto pt-14">
        <div className="relative h-12">
          {/* Ölçek */}
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-border-strong)]" />
          <div className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--color-ink-faint)]" style={{ left: "50%" }} />
          {/* Bant */}
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2"
            style={{
              left: at(band.min),
              width: `calc(${at(band.max)} - ${at(band.min)})`,
              background: "var(--color-accent-wash)",
              boxShadow: "inset 0 0 0 1px var(--color-accent-deep)",
            }}
          />
          {/* Bugünkü hız */}
          {rate !== null && (
            <div className="absolute top-0 bottom-0 -translate-x-1/2" style={{ left: at(rate) }}>
              <div className="mx-auto h-full w-0.5 bg-[var(--color-ink)]" />
              <span className="tnum absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-xs font-medium">
                {signed(rate, 2)}
              </span>
            </div>
          )}
        </div>
        <div className="tnum relative mt-2 h-4 text-2xs text-[var(--color-ink-faint)]">
          <span className="absolute left-0">−1,5</span>
          <span className="absolute left-1/2 -translate-x-1/2">0</span>
          <span className="absolute right-0">+1,5 kg/hafta</span>
        </div>
      </div>
    </section>
  );
}

/* --- Haftalar ------------------------------------------------------------------------ */

function WeeksPanel({ points, className }: { points: Parameters<typeof weeklyAverages>[0]; className: string }) {
  const weeks = weeklyAverages(points, 6);
  return (
    <section className={`card p-6 lg:p-8 ${className}`}>
      <p className="label">Haftalık ortalama</p>
      <ul className="mt-4">
        {weeks.map((week) => (
          <li
            key={week.start.getTime()}
            className="tnum grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-4 border-b border-[var(--color-border)] py-2.5 text-sm last:border-b-0"
          >
            <span className="text-[var(--color-ink-muted)]">{shortDay(week.start)} haftası</span>
            <span>
              {fmt(week.average, 1)} <span className="text-xs text-[var(--color-ink-faint)]">kg</span>
            </span>
            <span className="text-right text-xs text-[var(--color-ink-muted)]">
              {week.change !== null ? signed(week.change, 1) : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
