"use client";

/**
 * Pano — giriş yaptıktan sonra ilk ekran.
 *
 * --------------------------------------------------------------------------
 * İKİ KATMAN
 * --------------------------------------------------------------------------
 * 1. **Bant** — salondan bir kare, üstünde bugünün tek işi ve dört sayı:
 *    seri, kalan kalori, kilo, bu haftanın tonajı. Her gün gelen kişi için
 *    ekranın katlanma çizgisinin üstü bu; kaydırmadan karar verilebiliyor.
 * 2. **Bento** — o sayıların GRAFİKLERİ: haftalık tonajın gidişi, günün
 *    kalori halkası, kas dengesi, kilo eğilimi, tutarlılık ızgarası, son
 *    antrenmanlar. Detay isteyen kaydırıyor; her karo kendi ekranına gidiyor.
 *
 * Önceki sürüm bilinçli olarak sadeydi ("bir büyük kart, üç gösterge") ve
 * grafikleri kendi ekranlarına sürgün etmişti. Geniş ekranda sağı solu boş,
 * bir tablonun ilk satırı gibi duruyordu. Sadelik korunuyor ama başka bir
 * yoldan: katlanmanın üstü hâlâ tek soruya cevap veriyor, altı ise
 * "nasıl gidiyor" sorusunun görsel cevabı.
 *
 * --------------------------------------------------------------------------
 * DURUMA GÖRE, SAATE GÖRE DEĞİL
 * --------------------------------------------------------------------------
 * Bant neyi göstereceğini saatten değil durumdan çıkarıyor (antrenman sürüyor
 * mu, bugün yapıldı mı, dinlenme günü mü). Fotoğraf da duruma göre: yapılacak
 * bir antrenman varsa rafın başında biri, dinlenme gününde esneme.
 */

import Link from "next/link";
import { Bars, Meter, Ring, Trend } from "@/components/Charts";
import { ConsistencyGrid } from "@/components/ConsistencyGrid";
import { Hero, HeroStat, HeroStats, Page } from "@/components/Layout";
import { MuscleMap } from "@/components/MuscleMap";
import { Photo } from "@/components/Photo";
import { ErrorBox, fmt } from "@/components/States";
import {
  useConsistency,
  useHistory,
  useLatestCoachReport,
  useMe,
  useMuscleVolume,
  useNutritionDay,
  useSessions,
  useStreak,
  useToday,
  useWeightTrend,
  type HistorySession,
  type TodayWorkout,
  type WorkoutSession,
} from "@/lib/queries";
import {
  change,
  muscleBalance,
  shortDay,
  tonnage,
  weeklyVolume,
  weightSummary,
} from "@/lib/stats";

// Next 16 rotaları tipliyor; `href` gerçekten var olan bir rota olmak zorunda.
type Href = React.ComponentProps<typeof Link>["href"];

export default function DashboardPage() {
  const me = useMe();
  const today = useToday();
  const streak = useStreak();
  const sessions = useSessions(8);
  const history = useHistory(60);
  const nutritionGoal = me.data?.nutrition_goal ?? "maintain";
  const nutrition = useNutritionDay(null, nutritionGoal);
  const weight = useWeightTrend(90);

  const workout = today.data;
  const finishedToday =
    (sessions.data ?? []).find((s) => s.completed_at !== null && isToday(s.started_at)) ??
    null;
  const state = primaryState(workout, finishedToday);

  const weeks = weeklyVolume(history.data ?? [], 8);
  const thisWeek = weeks.at(-1)!;
  const remaining = nutrition.data?.remaining ?? null;
  const summary = weightSummary(weight.data ?? []);
  const weekTons = tonnage(thisWeek.volume);

  return (
    <Page>
      <Hero photo={state.photo} position="center" size="lg" quietTitle title={<Greeting />}>
        <PrimaryBlock state={state} loading={today.isLoading} />
        {today.isError && (
          <div className="mt-4 max-w-md">
            <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
          </div>
        )}

        <div className="mt-10">
          <HeroStats>
            <HeroStat
              label={(streak.data?.intact_weeks ?? 0) > 0 ? "Seri" : "Bu hafta"}
              value={
                (streak.data?.intact_weeks ?? 0) > 0
                  ? streak.data!.intact_weeks
                  : (streak.data?.this_week_sessions ?? "—")
              }
              unit={(streak.data?.intact_weeks ?? 0) > 0 ? "hafta" : undefined}
              foot={
                streak.data
                  ? `bu hafta ${streak.data.this_week_sessions}/${streak.data.weekly_target}`
                  : undefined
              }
            />
            <HeroStat
              label="Kalan"
              value={remaining ? fmt(remaining.calories, 0) : "—"}
              unit={remaining ? "kcal" : undefined}
              foot={remaining ? `${fmt(remaining.protein_g, 0)} g protein` : "hedef için profilini tamamla"}
            />
            <HeroStat
              label="Kilo"
              value={summary ? fmt(summary.latest, 1) : "—"}
              unit={summary ? "kg" : undefined}
              foot={
                summary
                  ? isToday(summary.date)
                    ? "bugün ölçüldü"
                    : "bugün ölçülmedi"
                  : "ilk ölçümünü gir"
              }
            />
            <HeroStat
              label="Bu hafta"
              value={thisWeek.volume > 0 ? weekTons.value : "—"}
              unit={thisWeek.volume > 0 ? weekTons.unit : undefined}
              foot={`${thisWeek.sessions} antrenman · ${thisWeek.sets} set`}
            />
          </HeroStats>
        </div>
      </Hero>

      <div className="grid gap-3 lg:grid-cols-12">
        <VolumeTile weeks={weeks} className="lg:col-span-8" />
        <NutritionTile className="lg:col-span-4" goal={nutritionGoal} />
        <MuscleTile className="lg:col-span-5" />
        <WeightTile className="lg:col-span-7" />
        <ConsistencyTile className="lg:col-span-7" />
        <CoachTile className="lg:col-span-5" />
      </div>

      <RecentSessions sessions={history.data ?? []} />

      <section>
        <h2 className="display mb-4 text-xl lg:text-2xl">Bölümler</h2>
        <SectionGrid />
      </section>
    </Page>
  );
}

/* --- Bant: günün işi ------------------------------------------------------------ */

interface PrimaryState {
  photo: string;
  eyebrow: string;
  title: string;
  note: string;
  action: { href: Href; label: string; quiet?: boolean };
  warn?: string;
  done?: boolean;
}

function primaryState(
  workout: TodayWorkout | undefined,
  finishedToday: WorkoutSession | null,
): PrimaryState {
  if (workout?.active_session_id) {
    return {
      photo: "app-grip",
      eyebrow: "Devam ediyor",
      title: workout.day_label ?? "Antrenman",
      note: `${workout.exercises.length} hareket planlı`,
      action: { href: "/workout", label: "Devam et" },
    };
  }
  if (!workout || workout.program_name === null) {
    return {
      photo: "app-gym-wide",
      eyebrow: "Başlangıç",
      title: "Bir program seç",
      note: "Hazır şablonlardan birini başlat ya da asistana kendi programını kurdur.",
      action: { href: "/programs", label: "Programlara git" },
    };
  }
  if (workout.exercises.length === 0) {
    return {
      photo: "app-stretch",
      eyebrow: workout.program_name,
      title: "Dinlenme günü",
      note: "Bugün planlı antrenman yok. Toparlanma da programın parçası.",
      action: { href: "/programs", label: "Programı gör", quiet: true },
      warn: workout.is_deload_suggested ? "Bu hafta deload önerilir" : undefined,
    };
  }
  if (finishedToday) {
    const working = finishedToday.sets.filter((s) => !s.is_warmup);
    const kg = working.reduce((sum, s) => sum + Number.parseFloat(s.weight_kg) * s.reps, 0);
    return {
      photo: "app-plates",
      eyebrow: "Tamamlandı",
      title: workout.day_label ?? "Antrenman",
      note: kg > 0 ? `${working.length} set · ${fmt(kg, 0)} kg tonaj` : `${working.length} set`,
      action: { href: "/history", label: "Seansı gör", quiet: true },
      done: true,
    };
  }
  return {
    photo: "app-squat",
    eyebrow: workout.program_name ?? "Bugün",
    title: workout.day_label ?? "Antrenman",
    note: `${workout.exercises.length} hareket · ${totalSets(workout)} set`,
    action: { href: "/workout", label: "Antrenmanı başlat" },
    warn: workout.is_deload_suggested ? "Bu hafta deload önerilir" : undefined,
  };
}

function PrimaryBlock({ state, loading }: { state: PrimaryState; loading: boolean }) {
  if (loading) {
    return <div className="h-40" aria-busy="true" />;
  }
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          {state.done && (
            <span
              aria-hidden
              className="grid size-[18px] shrink-0 place-items-center rounded-full"
              style={{ background: "var(--color-accent)" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          <span className="label on-photo-dark" style={{ color: "var(--color-on-night-muted)" }}>
            {state.eyebrow}
          </span>
        </p>
        {/* Ekranın tek odak noktası: giriş ekranının başlıkları kadar büyük. */}
        <h2
          className="display on-photo-dark mt-2 max-w-[18ch] text-3xl leading-[1.02] sm:text-4xl lg:text-[4.75rem]"
          style={{ color: "var(--color-on-night)" }}
        >
          {state.title}
        </h2>
        <p
          className="on-photo-dark mt-4 max-w-[46ch] text-sm sm:text-base"
          style={{ color: "var(--color-on-night-muted)" }}
        >
          {state.note}
        </p>
        {state.warn && (
          <p className="on-photo-dark mt-2 text-sm" style={{ color: "var(--color-warning)" }}>
            {state.warn}
          </p>
        )}
      </div>

      <Link
        href={state.action.href}
        className={`${state.action.quiet ? "btn btn-on-photo" : "btn btn-primary"} shrink-0 px-6 py-3 text-base`}
      >
        {state.action.label}
      </Link>
    </div>
  );
}

function Greeting() {
  const me = useMe();
  const now = new Date();
  const hour = now.getHours();
  const part =
    hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

  /* Ad varsa selamlamaya giriyor; yoksa selamlama tek başına kalıyor.
     E-posta adresi ad yerine KULLANILMIYOR. */
  const name = me.data?.display_name?.trim();
  const date = now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

  return (
    <>
      {name ? `${part}, ${name}` : part}
      <span className="sr-only"> — </span>
      <span
        className="ml-3 align-middle font-sans text-sm font-normal tracking-normal"
        style={{ color: "var(--color-on-night-muted)" }}
      >
        {date}
      </span>
    </>
  );
}

/* --- Karolar ----------------------------------------------------------------------- */

function TileHead({
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

function BigNumber({
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

function Delta({ percent, night = false }: { percent: number | null; night?: boolean }) {
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

function VolumeTile({ weeks, className }: { weeks: ReturnType<typeof weeklyVolume>; className: string }) {
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

function NutritionTile({ className, goal }: { className: string; goal: string }) {
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

function MuscleTile({ className }: { className: string }) {
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

function WeightTile({ className }: { className: string }) {
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

function ConsistencyTile({ className }: { className: string }) {
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

function CoachTile({ className }: { className: string }) {
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

/* --- Son antrenmanlar -------------------------------------------------------------- */

function RecentSessions({ sessions }: { sessions: readonly HistorySession[] }) {
  const rows = sessions.slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="display text-xl lg:text-2xl">Son antrenmanlar</h2>
        <Link href="/history" className="link text-xs">
          Tümü
        </Link>
      </div>

      <ul className="grid gap-3 md:grid-cols-3">
        {rows.map((session, index) => {
          const tons = tonnage(Number.parseFloat(session.volume_kg) || 0);
          return (
            <li key={session.id}>
              <Link href="/history" className="card lift flex h-full flex-col p-6">
                <p className="flex items-center justify-between gap-2">
                  <span className="label">{shortDate(session.started_at)}</span>
                  {session.records.length > 0 && (
                    <span className="badge badge-accent">
                      {session.records.length > 1 ? `${session.records.length} REKOR` : "REKOR"}
                    </span>
                  )}
                </p>
                <p className="display mt-3 text-xl leading-tight">
                  {session.day_label ?? dayName(session.started_at)}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                  <BigNumber value={tons.value} unit={tons.unit} size="md" />
                  <p className="tnum text-right text-xs text-[var(--color-ink-faint)]">
                    {session.total_sets} set
                    {session.duration_min ? ` · ${session.duration_min} dk` : ""}
                  </p>
                </div>
                <span aria-hidden className="mt-4 block h-1 w-full bg-[var(--color-surface-raised)]">
                  <span
                    className="block h-full"
                    style={{
                      width: `${100 - index * 22}%`,
                      background: "var(--color-ink)",
                      opacity: 0.12 + (2 - index) * 0.1,
                    }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const dayName = (iso: string): string =>
  new Date(iso)
    .toLocaleDateString("tr-TR", { weekday: "long" })
    .replace(/^./, (c) => c.toLocaleUpperCase("tr-TR"));

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });

/* --- Bölümler ------------------------------------------------------------------------ */

const SECTIONS: ReadonlyArray<{
  href: Href;
  photo: string;
  title: string;
  note: string;
  className: string;
}> = [
  {
    href: "/workout",
    photo: "app-grip",
    title: "Antrenman",
    note: "Bugünün akışı, programlar, hareket kütüphanesi, geçmiş",
    className: "lg:col-span-7 lg:row-span-2",
  },
  {
    href: "/nutrition",
    photo: "app-meal-bar",
    title: "Beslenme",
    note: "Günlük ve supplement",
    className: "lg:col-span-5",
  },
  {
    href: "/body",
    photo: "app-body",
    title: "Vücut",
    note: "Durum özeti, kas haritası, kilo, ağrı",
    className: "lg:col-span-5",
  },
  {
    href: "/chat",
    photo: "app-review",
    title: "Asistan",
    note: "Sohbet ve haftalık rapor",
    className: "lg:col-span-12",
  },
];

function SectionGrid() {
  return (
    <ul className="grid auto-rows-[15rem] gap-3 sm:grid-cols-2 lg:auto-rows-[17rem] lg:grid-cols-12">
      {SECTIONS.map((section) => (
        <li key={String(section.href)} className={section.className}>
          <Link href={section.href} className="card lift block size-full overflow-hidden">
            <Photo slug={section.photo} fill scrim className="size-full">
              <div className="flex size-full flex-col justify-end p-6 lg:p-8">
                <p className="display on-photo-dark text-2xl lg:text-3xl" style={{ color: "var(--color-on-night)" }}>
                  {section.title}
                </p>
                <p className="on-photo-dark mt-1 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
                  {section.note}
                </p>
              </div>
            </Photo>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* --- Yardımcılar ---------------------------------------------------------------------- */

function totalSets(workout: TodayWorkout): number {
  return workout.exercises.reduce((sum, e) => sum + e.target_sets, 0);
}

/** ISO tarih/zaman damgasının kullanıcının yerel gününe denk gelip gelmediği. */
function isToday(iso: string): boolean {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
