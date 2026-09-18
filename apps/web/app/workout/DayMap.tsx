"use client";

/**
 * Günün haritası — bütün hareketler, set noktaları, o anki hareket işaretli.
 *
 * Önce "diğer hareketleri gör" düğmesinin arkasındaydı ve geniş ekranda
 * sahnenin iki yanı boş kalıyordu. Harita dokununca o harekete atlıyor.
 */

import type { PlannedExercise, WorkoutSet } from "@/lib/queries";
import type { Step } from "./model";

/* --- Günün haritası --------------------------------------------------------- */

export function DayMap({
  className,
  steps,
  cursor,
  findLogged,
  onJump,
  onAddSet,
  canRemoveSet,
  onRemoveSet,
}: {
  className: string;
  steps: Step[];
  cursor: number;
  findLogged: (exerciseId: string, setNumber: number) => WorkoutSet | undefined;
  onJump?: (index: number) => void;
  onAddSet?: (exerciseId: string) => void;
  canRemoveSet?: (exerciseId: string, planned: number) => boolean;
  onRemoveSet?: (exerciseId: string) => void;
}) {
  /* Hareket başına grupla: harita set değil hareket düzeyinde okunuyor.
     Set sayısı PLANDAN değil adım listesinden geliyor — plana eklenen
     fazladan setler de haritada görünüyor. */
  const byExercise = new Map<
    number,
    { exercise: PlannedExercise; firstStep: number; planned: number }
  >();
  steps.forEach((s, index) => {
    const found = byExercise.get(s.exerciseIndex);
    if (found) found.planned += 1;
    else byExercise.set(s.exerciseIndex, { exercise: s.exercise, firstStep: index, planned: 1 });
  });
  const current = steps[cursor]?.exerciseIndex;

  return (
    <aside className={`card p-6 lg:sticky lg:top-6 ${className}`} aria-label="Günün hareketleri">
      <p className="label">Günün hareketleri</p>
      <ol className="mt-4 flex flex-col">
        {[...byExercise.entries()].map(([exerciseIndex, { exercise, firstStep, planned }], order) => {
          const done = Array.from({ length: planned }, (_, i) =>
            findLogged(exercise.exercise_id, i + 1),
          ).filter(Boolean).length;
          const isCurrent = exerciseIndex === current;
          const content = (
            <>
              <span
                className="display tnum w-7 shrink-0 text-lg"
                style={{ color: isCurrent ? "var(--color-ink)" : "var(--color-ink-faint)" }}
              >
                {String(order + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${isCurrent ? "font-semibold" : ""}`}>
                  {exercise.name}
                  {/* Süperset işareti haritada da: sıranın neden hareketler
                      arasında gidip geldiği ancak burada görünüyor. */}
                  {exercise.superset_group !== null && (
                    <span className="ml-2 text-2xs text-[var(--color-ink-faint)]">
                      süperset {exercise.superset_group}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 flex gap-1" aria-hidden>
                  {Array.from({ length: planned }, (_, i) => (
                    <span
                      key={i}
                      className="h-1 flex-1"
                      style={{
                        maxWidth: "1.5rem",
                        background: i < done ? "var(--color-accent-deep)" : "var(--color-border-strong)",
                      }}
                    />
                  ))}
                </span>
              </span>
              <span className="tnum shrink-0 text-xs text-[var(--color-ink-muted)]">
                {done} / {planned} set
              </span>
            </>
          );
          return (
            <li
              key={exercise.program_exercise_id}
              className="flex items-center border-t border-[var(--color-border)] first:border-t-0"
            >
              {onJump ? (
                <button
                  onClick={() => onJump(firstStep)}
                  className="-ml-3 flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{
                    transitionDuration: "var(--dur-micro)",
                    boxShadow: isCurrent ? "inset 3px 0 0 var(--color-accent-deep)" : undefined,
                  }}
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-3.5">{content}</div>
              )}

              {/* Plana bir set daha: program bir öneri, yasak değil. Yanlışlıkla
                  açılan boş slot aynı yerden geri alınıyor. */}
              {onRemoveSet && canRemoveSet?.(exercise.exercise_id, planned) && (
                <button
                  type="button"
                  onClick={() => onRemoveSet(exercise.exercise_id)}
                  aria-label={`${exercise.name} için eklenen seti geri al`}
                  className="grid size-9 shrink-0 place-items-center text-lg text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  −
                </button>
              )}
              {onAddSet && (
                <button
                  type="button"
                  onClick={() => onAddSet(exercise.exercise_id)}
                  aria-label={`${exercise.name} için bir set daha ekle`}
                  className="-mr-2 grid size-9 shrink-0 place-items-center text-lg text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  +
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {/* Kısayollar yalnızca klavyesi olan ekranda yazıyor: telefonda satır
          yer kaplamaktan başka bir şey yapmazdı. */}
      {onJump && (
        <p className="mt-5 hidden border-t border-[var(--color-border)] pt-4 text-2xs text-[var(--color-ink-faint)] lg:block">
          Klavye: <strong className="font-medium">Enter</strong> seti kaydet ·{" "}
          <strong className="font-medium">↑ ↓</strong> ağırlık ve tekrar ·{" "}
          dinlenmede <strong className="font-medium">Enter</strong> atla,{" "}
          <strong className="font-medium">← →</strong> ±15 sn
        </p>
      )}
    </aside>
  );
}
