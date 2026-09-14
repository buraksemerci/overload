"use client";

/** Ana Panel (Bölüm 8, ekran 2): bugünkü antrenman, seri, hacim, mini kas haritası. */

import Link from "next/link";
import { MuscleMap } from "@/components/MuscleMap";
import { ErrorBox, Empty, Loading, Stat, fmt } from "@/components/States";
import { useMuscleVolume, useStreak, useToday } from "@/lib/queries";
import type { MuscleVolume } from "@overload/shared-types";

export default function DashboardPage() {
  const today = useToday();
  const streak = useStreak();
  const volume = useMuscleVolume(7);

  if (today.isLoading) return <Loading />;
  if (today.isError) return <ErrorBox error={today.error} onRetry={() => void today.refetch()} />;

  const workout = today.data;
  const volumes: MuscleVolume[] = (volume.data ?? []).map((row) => ({
    slug: row.slug,
    nameTr: row.name_tr,
    svgId: row.svg_id,
    region: row.region,
    sets: row.sets,
    target: row.target,
  }));

  const weeklyVolumeSets = volumes.reduce((sum, v) => sum + v.sets, 0);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Bugün</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {workout?.day_label ?? "Aktif program yok"}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Seri"
          value={streak.data?.intact_weeks ?? "—"}
          unit="hafta kesintisiz"
          tone={streak.data && streak.data.intact_weeks > 0 ? "accent" : undefined}
        />
        <Stat
          label="Bu hafta"
          value={streak.data ? streak.data.this_week_sessions : "—"}
          unit={streak.data ? `/ ${streak.data.weekly_target} antrenman` : ""}
        />
        <Stat label="Haftalık hacim" value={fmt(weeklyVolumeSets, 1)} unit="efektif set" />
      </div>

      {workout?.is_deload_suggested && (
        <div className="card p-4" style={{ borderColor: "var(--color-warning)" }}>
          <p className="text-sm">
            <span style={{ color: "var(--color-warning)" }}>Deload önerisi:</span>{" "}
            Birkaç haftadır kesintisiz çalışıyorsun. Bu hafta ağırlıkları %10 düşürüp
            hacmi azaltmak, birikmiş yorgunluğu atıp bir sonraki bloğa taze girmeni sağlar.
          </p>
        </div>
      )}

      <section className="card p-4">
        {workout && workout.exercises.length > 0 ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-medium">Bugünkü antrenman</h2>
                <p className="mt-1 truncate text-sm text-[var(--color-ink-muted)]">
                  {workout.program_name} · {workout.exercises.length} hareket
                </p>
              </div>
              <Link href="/workout" className="btn btn-primary shrink-0">
                {workout.active_session_id ? "Devam et" : "Başla"}
              </Link>
            </div>

            <ul className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {workout.exercises.map((exercise) => (
                <li
                  key={exercise.program_exercise_id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{exercise.name}</p>
                    <p className="tnum text-xs text-[var(--color-ink-faint)]">
                      {exercise.target_sets}x{exercise.target_rep_min}
                      {exercise.target_rep_min !== exercise.target_rep_max &&
                        `-${exercise.target_rep_max}`}
                    </p>
                  </div>
                  {exercise.progression && (
                    <p className="tnum shrink-0 text-xs text-[var(--color-ink-muted)]">
                      {exercise.progression.label}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty
            title="Aktif program yok"
            hint="Şablon kütüphanesinden bir program seç ya da asistana kendi programını kurdur."
            action={
              <Link href="/programs" className="btn btn-primary">
                Programlara git
              </Link>
            }
          />
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Haftalık kas hacmi</h2>
          <Link
            href="/muscle-map"
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Tam ekran →
          </Link>
        </div>
        {volume.isLoading ? (
          <Loading />
        ) : volumes.length > 0 ? (
          <MuscleMap volumes={volumes} interactive={false} className="mt-4" />
        ) : (
          <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
            Henüz tamamlanmış antrenman yok — ilk seansından sonra burası dolacak.
          </p>
        )}
      </section>
    </div>
  );
}
