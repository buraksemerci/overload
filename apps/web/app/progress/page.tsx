"use client";

/** İlerleme (Bölüm 8, ekran 8): güç standartları, tutarlılık ızgarası, rekorlar. */

import { useState } from "react";
import { ConsistencyGrid } from "@/components/ConsistencyGrid";
import { ExerciseChart } from "@/components/ExerciseChart";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import {
  useConsistency,
  useExercises,
  useRecords,
  useStrengthStandards,
} from "@/lib/queries";

// Seviyeler SIRALI, bu yüzden renkler de sıralı: soluktan güçlüye.
// Önceden "intermediate" volt, "advanced" ise success rengiydi; açık temada
// ikisi de metin olarak okunmuyordu (volt %90 parlaklıkta) ve aralarındaki
// sıra da belli olmuyordu. Volt yalnızca "advanced"ta çıkıyor — kazanılmış bir
// eşik olduğu için anlamlı.
const LEVEL_COLOR: Record<string, string> = {
  untrained: "var(--color-ink-faint)",
  novice: "var(--color-ink-muted)",
  intermediate: "var(--color-ink)",
  advanced: "var(--color-accent-deep)",
  elite: "var(--color-warning)",
};

export default function ProgressPage() {
  const standards = useStrengthStandards();
  const consistency = useConsistency(365);
  const records = useRecords();
  const exercises = useExercises("");
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">İlerleme</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Güç standartları, tutarlılık ve kırılan rekorlar.
        </p>
      </header>

      {/* --- Tutarlılık ızgarası --- */}
      <section className="card p-4">
        <h2 className="text-base font-medium">Tutarlılık</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          Son 12 ay. Koyuluk o günkü toplam tonajı gösteriyor.
        </p>
        {consistency.isLoading ? (
          <Loading />
        ) : consistency.isError ? (
          <ErrorBox error={consistency.error} />
        ) : (
          <ConsistencyGrid days={consistency.data ?? []} className="mt-4" />
        )}
      </section>

      {/* --- Güç standartları --- */}
      <section className="card p-4">
        <h2 className="text-base font-medium">Güç standartları</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          Vücut ağırlığına göre seviye. 1RM değerleri Epley formülüyle{" "}
          <strong>tahmin</strong> ediliyor — gerçek tek tekrar testi değil.
        </p>

        {standards.isLoading ? (
          <Loading />
        ) : standards.isError ? (
          <ErrorBox error={standards.error} />
        ) : standards.data?.unavailable_reason ? (
          <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
            {standards.data.unavailable_reason}
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {(standards.data?.results ?? []).map((row) => (
              <li key={row.lift_key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{row.lift_label}</span>
                  <span className="tnum text-sm">
                    {fmt(row.estimated_1rm, 1)} kg
                    <span className="ml-1.5 text-xs text-[var(--color-ink-faint)]">
                      ({fmt(row.bodyweight_ratio, 2)}x VA)
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${Math.round(row.progress_to_next * 100)}%`,
                        background: LEVEL_COLOR[row.level] ?? "var(--color-accent)",
                      }}
                    />
                  </div>
                  <span
                    className="shrink-0 text-2xs uppercase tracking-wide"
                    style={{ color: LEVEL_COLOR[row.level] ?? "var(--color-accent)" }}
                  >
                    {row.level_label}
                  </span>
                </div>
                {row.next_level_kg && (
                  <p className="tnum mt-1 text-2xs text-[var(--color-ink-faint)]">
                    Bir sonraki seviye için {fmt(row.next_level_kg, 1)} kg
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Hareket bazında ilerleme --- */}
      <section className="card p-4">
        <h2 className="text-base font-medium">Hareket grafiği</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          Bir hareket seç — ağırlık, hacim ve tahmini 1RM&apos;in zaman içindeki
          değişimi.
        </p>

        {exercises.isLoading ? (
          <Loading />
        ) : (exercises.data ?? []).length === 0 ? (
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
            Hareket kütüphanesi yüklenemedi.
          </p>
        ) : (
          <>
            <select
              value={selectedExercise ?? ""}
              onChange={(e) => setSelectedExercise(e.target.value || null)}
              aria-label="Hareket seç"
              className="mt-3 h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
            >
              <option value="">Hareket seç…</option>
              {(exercises.data ?? []).map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>

            {selectedExercise && (
              <div className="mt-4">
                <ExerciseChart exerciseId={selectedExercise} />
              </div>
            )}
          </>
        )}
      </section>

      {/* --- Kişisel rekorlar --- */}
      <section className="card p-4">
        <h2 className="text-base font-medium">Kişisel rekorlar</h2>
        {records.isLoading ? (
          <Loading />
        ) : records.isError ? (
          <ErrorBox error={records.error} />
        ) : records.data && records.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
            {records.data.slice(0, 20).map((record, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-[var(--color-ink-muted)]">
                  {prLabel(record.type)}
                </span>
                <span className="tnum">
                  {fmt(record.value, 1)} {prUnit(record.type)}
                  {record.reps !== null && ` x ${record.reps}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <Empty
              title="Henüz rekor yok"
              hint="İlk antrenmanını tamamladığında her hareket için dört tür rekor takip edilmeye başlar."
            />
          </div>
        )}
      </section>
    </div>
  );
}
