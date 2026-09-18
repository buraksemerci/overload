"use client";

/**
 * Panonun karoları.
 *
 * Her karo TEK bir soruya cevap veriyor ve kendi verisini kendi çekiyor:
 * haftalık tonaj, bugünün kalorisi, kas dengesi, kilo eğrisi, tutarlılık ve
 * haftalık rapor. Gece karoları (koyu zemin) grafikler için; açık kartlar
 * sayılar ve listeler için.
 */

import Link from "next/link";
import { Bars, Meter, Ring, Trend } from "@/components/Charts";
import { ConsistencyGrid } from "@/components/ConsistencyGrid";
import { MuscleMap } from "@/components/MuscleMap";
import { Photo } from "@/components/Photo";
import { fmt } from "@/components/States";
import {
  useConsistency,
  useLatestCoachReport,
  useMuscleVolume,
  useNutritionDay,
  useWeightTrend,
} from "@/lib/queries";
import { change, muscleBalance, shortDay, tonnage, weightSummary, weeklyVolume } from "@/lib/stats";
import type { Href } from "@/components/dashboard/model";

/* --- Karolar ----------------------------------------------------------------------- */

export function TileHead({
  eyebrow,
  title,
  href,
  linkLabel = "Aç",
  night = false,
}: {
  eyebrow: string;
  title?: React.ReactNode;
  href?: Href;
  linkLabel?: string;
  night?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="label" style={{ color: night ? "var(--color-on-night-faint)" : undefined }}>
          {eyebrow}
        </p>
        {title && <div className="mt-1.5">{title}</div>}
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-xs underline-offset-4 hover:underline"
          style={{ color: night ? "var(--color-on-night-muted)" : "var(--color-ink-muted)" }}
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

export function BigNumber({
  value,
  unit,
  night = false,
  size = "lg",
}: {
  value: React.ReactNode;
  unit?: string;
  night?: boolean;
  size?: "lg" | "md";
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className={`display tnum leading-none ${size === "lg" ? "text-4xl" : "text-3xl"}`}
        style={{ color: night ? "var(--color-on-night)" : "var(--color-ink)" }}
      >
        {value}
      </span>
      {unit && (
        <span className="text-sm" style={{ color: night ? "var(--color-on-night-muted)" : "var(--color-ink-muted)" }}>
          {unit}
        </span>
      )}
    </p>
  );
}

export function Delta({ percent, night = false }: { percent: number | null; night?: boolean }) {
  if (percent === null) return null;
  const up = percent >= 0;
  return (
    <span
      className="tnum text-xs"
      style={{
        color: up
          ? night
            ? "var(--color-accent)"
            : "var(--color-accent-deep)"
          : "var(--color-warning)",
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(percent).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

export function VolumeTile({ weeks, className }: { weeks: ReturnType<typeof weeklyVolume>; className: string }) {
  const current = weeks.at(-1)!;
  const previous = weeks.at(-2);
  const tons = tonnage(current.volume);
  const hasAny = weeks.some((w) => w.volume > 0);

  return (
    <section className={`tile-night flex flex-col p-6 lg:p-8 ${className}`}>
      <TileHead eyebrow="Haftalık tonaj" href="/history" linkLabel="Geçmiş" night />
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <BigNumber value={current.volume > 0 ? tons.value : "0"} unit={current.volume > 0 ? tons.unit : "kg"} night />
        <Delta percent={previous ? change(current.volume, previous.volume) : null} night />
        <span className="text-xs" style={{ color: "var(--color-on-night-faint)" }}>
          bu hafta · geçen haftaya göre
        </span>
      </div>
      <div className="mt-6 flex-1">
        {hasAny ? (
          <Bars
            night
            height={200}
            unit="kg"
            data={weeks.map((week, index) => ({
              label: index === weeks.length - 1 ? "Bu hafta" : shortDay(week.start),
              value: Math.round(week.volume),
              current: index === weeks.length - 1,
            }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            İlk antrenmanını tamamladığında haftalık tonaj burada birikmeye başlıyor.
          </p>
        )}
      </div>
    </section>
  );
}

export function NutritionTile({ className, goal }: { className: string; goal: string }) {
  const day = useNutritionDay(null, goal);
  const target = day.data?.target ?? null;
  const totals = day.data?.totals;
  const eaten = totals ? Number.parseFloat(totals.calories) || 0 : 0;

  return (
    <Link href="/nutrition" className={`card lift flex flex-col p-6 lg:p-8 ${className}`}>
      <TileHead eyebrow="Bugün yenilen" />
      {target && totals ? (
        <>
          <div className="mt-4 flex items-center gap-6">
            <Ring value={eaten} max={target.calories} size={132} stroke={11}>
              <div>
                <p className="display tnum text-2xl leading-none">{fmt(eaten, 0)}</p>
                <p className="mt-1 text-2xs text-[var(--color-ink-faint)]">/ {fmt(target.calories, 0)} kcal</p>
              </div>
            </Ring>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {(
                [
                  ["Protein", totals.protein_g, target.protein_g],
                  ["Karb.", totals.carbs_g, target.carbs_g],
                  ["Yağ", totals.fat_g, target.fat_g],
                ] as const
              ).map(([label, value, max]) => (
                <div key={label}>
                  <p className="mb-1 flex justify-between text-2xs text-[var(--color-ink-muted)]">
                    <span>{label}</span>
                    <span className="tnum">
                      {fmt(value, 0)} / {fmt(max, 0)} g
                    </span>
                  </p>
                  <Meter value={Number.parseFloat(String(value)) || 0} max={max} />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          Kalori hedefi için boy, doğum tarihi, cinsiyet ve kilo gerekiyor.
        </p>
      )}
    </Link>
  );
}

export function MuscleTile({ className }: { className: string }) {
  const volume = useMuscleVolume(7);
  const rows = volume.data ?? [];
  const balance = muscleBalance(rows);
  const lagging = balance.lagging.slice(0, 3);

  return (
    <Link href="/muscle-map" className={`tile-night lift flex flex-col p-6 lg:p-8 ${className}`}>
      <TileHead eyebrow="Kas dengesi · 7 gün" night />
      <div className="mt-4 grid flex-1 grid-cols-[minmax(0,1fr)_minmax(0,11rem)] items-center gap-6">
        <MuscleMap
          night
          pair
          interactive={false}
          volumes={rows.map((row) => ({
            slug: row.slug,
            nameTr: row.name_tr,
            svgId: row.svg_id,
            region: row.region,
            sets: row.sets,
            target: row.target,
          }))}
        />
        <div className="min-w-0">
          <BigNumber
            night
            size="md"
            value={balance.total > 0 ? Math.round(balance.onTarget * 100) : "—"}
            unit={balance.total > 0 ? "% hedefte" : undefined}
          />
          {lagging.length > 0 && (
            <>
              <p className="label mt-5" style={{ color: "var(--color-on-night-faint)" }}>
                Geride
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {lagging.map((row) => (
                  <li key={row.slug}>
                    <p className="flex justify-between text-xs" style={{ color: "var(--color-on-night-muted)" }}>
                      <span className="truncate">{row.name_tr}</span>
                      <span className="tnum">
                        {fmt(row.sets, 0)}/{row.target}
                      </span>
                    </p>
                    <div className="mt-1">
                      <Meter night value={row.sets} max={row.target} tone="neutral" />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export function WeightTile({ className }: { className: string }) {
  const weight = useWeightTrend(90);
  const points = weight.data ?? [];
  const summary = weightSummary(points);

  return (
    <Link href="/weight" className={`card lift flex flex-col p-6 lg:p-8 ${className}`}>
      <TileHead eyebrow="Kilo · 90 gün" />
      {summary ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4">
            <BigNumber value={fmt(summary.latest, 1)} unit="kg" />
            {summary.delta !== null && (
              <span className="tnum text-xs text-[var(--color-ink-muted)]">
                {summary.delta > 0 ? "+" : ""}
                {fmt(summary.delta, 1)} kg · 30 günde (ortalama)
              </span>
            )}
          </div>
          <div className="mt-4 flex-1">
            {points.length >= 2 ? (
              <Trend
                id="panel-kilo"
                unit="kg"
                height={150}
                data={points.map((point) => ({
                  label: shortDay(new Date(`${point.date}T00:00:00`)),
                  value: Number.parseFloat(point.weight_kg),
                  average: point.moving_average === null ? null : Number.parseFloat(point.moving_average),
                }))}
              />
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">
                İkinci tartıdan sonra eğilim çizgisi çiziliyor.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">İlk tartını gir; eğilim burada çizilecek.</p>
      )}
    </Link>
  );
}

export function ConsistencyTile({ className }: { className: string }) {
  const consistency = useConsistency(182);
  const days = consistency.data ?? [];
  const sessions = days.reduce((sum, day) => sum + day.sessions, 0);

  return (
    <Link href="/progress" className={`card lift flex flex-col p-6 lg:p-8 ${className}`}>
      <TileHead eyebrow="Tutarlılık · 6 ay" />
      <div className="mt-3">
        <BigNumber value={sessions} unit="antrenman" size="md" />
      </div>
      <div className="mt-5 min-w-0">
        {days.length > 0 ? (
          <ConsistencyGrid days={days} />
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">Antrenmanların burada gün gün işaretlenecek.</p>
        )}
      </div>
    </Link>
  );
}

export function CoachTile({ className }: { className: string }) {
  const report = useLatestCoachReport();
  /* Okunmamış rapor: kart bunu SÖYLÜYOR, yoksa pazartesi sabahı hazırlanan
     rapor kimsenin haberi olmadan bekliyordu. İşaret volt DEĞİL — pano
     bütçesi zaten "antrenmanı başlat" ve rekor rozetiyle dolu; burada beyaz
     bir nokta ve tek satır yetiyor. */
  const unread = report.data !== undefined && report.data.read_at === null;

  return (
    <Link href="/coach" className={`card lift block overflow-hidden ${className}`}>
      <Photo slug="app-review" fill scrim className="size-full min-h-[16rem]">
        <div className="flex size-full flex-col justify-end p-6 lg:p-8">
          <p className="label on-photo-dark flex items-center gap-2" style={{ color: "var(--color-on-night-faint)" }}>
            {unread && (
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{ background: "var(--color-on-night)" }}
              />
            )}
            Asistan
          </p>
          <p className="display on-photo-dark mt-1 text-2xl lg:text-3xl" style={{ color: "var(--color-on-night)" }}>
            Haftalık rapor
          </p>
          <p className="on-photo-dark mt-1 max-w-[36ch] text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            {unread
              ? "Yeni rapor hazır — haftanın hacmi, rekorları ve bir sonraki haftanın önerisi."
              : "Haftanın hacmi, rekorları ve bir sonraki haftanın önerisi — pazartesi sabahı hazır."}
          </p>
        </div>
      </Photo>
    </Link>
  );
}
