"use client";

/**
 * Antrenman Modu (Bölüm 8, ekran 3).
 *
 * Bu ekranın tek işi var: salonda, tek elle, terli parmakla, hızlıca set girmek.
 * Tasarım kararları buna göre:
 *  - Dokunma hedefleri büyük (min 44px), sayı girişleri numeric klavye açar.
 *  - Set tamamlanınca TEK bir onay animasyonu — başka hareket yok.
 *  - Dinlenme sayacı otomatik başlar; bitince titreşim (sesli bildirim
 *    tarayıcıda kullanıcı etkileşimi gerektirdiği için titreşim öncelikli).
 *  - Bir önceki seansın rakamı her satırda görünür; motorun önerisi üstte.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface PlannedExercise {
  id: string;
  name: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  technique: string;
  suggestion: string;
  lastTime: string | null;
  restSeconds: number;
}

interface LoggedSet {
  weight: string;
  reps: string;
  rir: string;
  done: boolean;
}

// Örnek plan — backend bağlandığında GET /workouts/today ile gelecek.
const PLAN: PlannedExercise[] = [
  {
    id: "1",
    name: "Plate Loaded Chest Press",
    targetSets: 2,
    repMin: 5,
    repMax: 6,
    technique: "RIR1",
    suggestion: "42.5kg x 5 — geçen sefer 40kg x 6 RIR1 yaptın",
    lastTime: "40kg x 6 RIR1, 40kg x 5 RIR1",
    restSeconds: 180,
  },
  {
    id: "2",
    name: "Chest Fly Machine",
    targetSets: 2,
    repMin: 6,
    repMax: 8,
    technique: "RIR1",
    suggestion: "35kg x 8 — aralık içindesin, bir tekrar ekle",
    lastTime: "35kg x 7 RIR1",
    restSeconds: 120,
  },
];

export default function WorkoutPage() {
  const [logs, setLogs] = useState<Record<string, LoggedSet[]>>(() =>
    Object.fromEntries(
      PLAN.map((ex) => [
        ex.id,
        Array.from({ length: ex.targetSets }, () => ({
          weight: "",
          reps: "",
          rir: "",
          done: false,
        })),
      ]),
    ),
  );
  const [rest, setRest] = useState<{ remaining: number; total: number } | null>(null);

  const update = useCallback(
    (exerciseId: string, index: number, patch: Partial<LoggedSet>) => {
      setLogs((prev) => {
        const sets = prev[exerciseId];
        if (!sets) return prev;
        const next = [...sets];
        const current = next[index];
        if (!current) return prev;
        next[index] = { ...current, ...patch };
        return { ...prev, [exerciseId]: next };
      });
    },
    [],
  );

  const completeSet = useCallback(
    (exercise: PlannedExercise, index: number) => {
      update(exercise.id, index, { done: true });
      setRest({ remaining: exercise.restSeconds, total: exercise.restSeconds });
    },
    [update],
  );

  // Dinlenme sayacı. setInterval yerine her saniye yeniden kurulmuyor;
  // tek interval + fonksiyonel güncelleme ile sürüklenme (drift) engelleniyor.
  useEffect(() => {
    if (rest === null) return;
    if (rest.remaining <= 0) {
      // Titreşim: kullanıcı etkileşimi gerektirmez, ses gerektirir.
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      setRest(null);
      return;
    }
    const timer = setTimeout(
      () => setRest((r) => (r ? { ...r, remaining: r.remaining - 1 } : null)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [rest]);

  const totalSets = Object.values(logs).flat().length;
  const doneSets = Object.values(logs).flat().filter((s) => s.done).length;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Antrenman</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Pazartesi — Göğüs / Omuz / Triceps
          </p>
        </div>
        <p className="tnum shrink-0 text-sm text-[var(--color-ink-muted)]">
          {doneSets} / {totalSets} set
        </p>
      </header>

      {rest && <RestTimer remaining={rest.remaining} total={rest.total} onSkip={() => setRest(null)} />}

      {PLAN.map((exercise) => (
        <section key={exercise.id} className="card p-4">
          <h2 className="text-base font-medium">{exercise.name}</h2>
          <p className="tnum mt-0.5 text-xs text-[var(--color-ink-faint)]">
            {exercise.targetSets}x{exercise.repMin}-{exercise.repMax} · {exercise.technique}
          </p>

          {/* Motorun önerisi — vurgu rengi burada çünkü ekranın birincil bilgisi */}
          <p className="mt-3 rounded-[3px] bg-[var(--color-accent-dim)] px-2.5 py-2 text-xs text-[var(--color-ink)]">
            {exercise.suggestion}
          </p>
          {exercise.lastTime && (
            <p className="tnum mt-1.5 text-xs text-[var(--color-ink-faint)]">
              Geçen sefer: {exercise.lastTime}
            </p>
          )}

          <div className="mt-3 space-y-2">
            {(logs[exercise.id] ?? []).map((set, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="tnum w-5 shrink-0 text-xs text-[var(--color-ink-faint)]">
                  {index + 1}
                </span>
                <NumberField
                  label="kg"
                  value={set.weight}
                  onChange={(v) => update(exercise.id, index, { weight: v })}
                  disabled={set.done}
                />
                <NumberField
                  label="tekrar"
                  value={set.reps}
                  onChange={(v) => update(exercise.id, index, { reps: v })}
                  disabled={set.done}
                />
                <NumberField
                  label="RIR"
                  value={set.rir}
                  onChange={(v) => update(exercise.id, index, { rir: v })}
                  disabled={set.done}
                />
                <button
                  type="button"
                  aria-label={`Set ${index + 1} tamamlandı`}
                  disabled={set.done || !set.weight || !set.reps}
                  onClick={() => completeSet(exercise, index)}
                  className={`grid size-11 shrink-0 place-items-center rounded-[3px] border transition-colors ${
                    set.done
                      ? "border-transparent bg-[var(--color-success)] text-white"
                      : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] disabled:opacity-40"
                  }`}
                >
                  <span className={set.done ? "animate-check" : undefined}>✓</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      <button className="btn btn-primary w-full" disabled={doneSets === 0}>
        Antrenmanı bitir
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        // inputMode="decimal": mobilde sayısal klavye açar ama virgül/nokta da yazılabilir.
        // type="number" kullanılmıyor — iOS'ta ok tuşları ekranı daraltıyor.
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="tnum h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-center text-sm outline-none placeholder:text-[var(--color-ink-faint)] disabled:opacity-50"
      />
    </label>
  );
}

function RestTimer({
  remaining,
  total,
  onSkip,
}: {
  remaining: number;
  total: number;
  onSkip: () => void;
}) {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = total > 0 ? (total - remaining) / total : 0;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="card sticky top-16 z-10 flex items-center gap-3 p-3"
      role="timer"
      aria-live="off"
    >
      <div className="relative size-11 shrink-0">
        <svg viewBox="0 0 36 36" className="size-11 -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-border)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeDasharray={`${progress * 100.5} 100.5`}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex-1">
        <p className="text-xs text-[var(--color-ink-muted)]">Dinlenme</p>
        <p className="tnum text-lg font-semibold">
          {minutes}:{String(seconds).padStart(2, "0")}
        </p>
      </div>
      <button className="btn btn-ghost" onClick={onSkip}>
        Atla
      </button>
    </div>
  );
}
