"use client";

/**
 * Panelin bandı: selamlama ve GÜNÜN İŞİ.
 *
 * Ekranın tek büyük yazısı bugün yapılacak antrenman; selamlama onun üstünde
 * küçük duruyor. Duruma göre değişen tek bir blok — program yok, dinlenme
 * günü, devam eden seans, tamamlanmış gün: hepsi aynı yerde cevaplanıyor.
 */

import Link from "next/link";
import { fmt } from "@/components/States";
import type { TodayWorkout, WorkoutSession } from "@/lib/queries";
import { useMe } from "@/lib/queries";
import { totalSets, type Href } from "@/components/dashboard/model";

/* --- Bant: günün işi ------------------------------------------------------------ */

export interface PrimaryState {
  photo: string;
  eyebrow: string;
  title: string;
  note: string;
  action: { href: Href; label: string; quiet?: boolean };
  warn?: string;
  done?: boolean;
}

export function primaryState(
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

export function PrimaryBlock({ state, loading }: { state: PrimaryState; loading: boolean }) {
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

export function Greeting() {
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
