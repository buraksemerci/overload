"use client";

/**
 * Antrenman Modu (Bölüm 8, ekran 3).
 *
 * Salonda, tek elle, terli parmakla kullanılacak. Tasarım kararları buna göre:
 *  - Dokunma hedefleri en az 44px; sayı alanları `inputMode="decimal"`.
 *  - Set tamamlanınca TEK bir onay animasyonu — başka hareket yok.
 *  - Dinlenme sayacı otomatik başlar; bitince titreşim.
 *  - Her set ANINDA sunucuya yazılır. Telefon kilitlenir, uygulama arka plana
 *    atılır, bağlantı kopar — yarım antrenman kaybolmamalı.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import {
  useCompleteSession,
  useLogSet,
  useSession,
  useStartSession,
  useToday,
  type PersonalRecordRow,
  type PlannedExercise,
} from "@/lib/queries";

interface Draft {
  weight: string;
  reps: string;
  rir: string;
}

/** "100.00" -> "100", "42.50" -> "42,5". Alana geri yazılabilir biçim;
 *  gönderimde virgül zaten noktaya çevriliyor. */
const weightText = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? value : String(n).replace(".", ",");
};

export default function WorkoutPage() {
  const today = useToday();
  const startSession = useStartSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const session = useSession(sessionId);
  const logSet = useLogSet();
  const complete = useCompleteSession();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rest, setRest] = useState<{ remaining: number; total: number } | null>(null);
  const [newRecords, setNewRecords] = useState<PersonalRecordRow[] | null>(null);

  // Devam eden seans varsa otomatik devral — kullanıcı uygulamayı kapatıp
  // açtığında kaldığı yerden devam etmeli.
  useEffect(() => {
    if (sessionId === null && today.data?.active_session_id) {
      setSessionId(today.data.active_session_id);
    }
  }, [sessionId, today.data?.active_session_id]);

  // Dinlenme sayacı. Tek zamanlayıcı + fonksiyonel güncelleme ile sürüklenme yok.
  useEffect(() => {
    if (rest === null) return;
    if (rest.remaining <= 0) {
      // Titreşim kullanıcı etkileşimi gerektirmiyor; ses gerektiriyor.
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

  const draftKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;

  const updateDraft = useCallback(
    (key: string, patch: Partial<Draft>) => {
      setDrafts((prev) => ({
        ...prev,
        [key]: { weight: "", reps: "", rir: "", ...prev[key], ...patch },
      }));
    },
    [],
  );

  const submitSet = useCallback(
    async (exercise: PlannedExercise, setNumber: number) => {
      if (!sessionId) return;
      const key = draftKey(exercise.exercise_id, setNumber);
      const draft = drafts[key];
      if (!draft?.weight || !draft.reps) return;

      await logSet.mutateAsync({
        sessionId,
        exercise_id: exercise.exercise_id,
        set_number: setNumber,
        // Türkçe klavyede virgül yazılabiliyor; nokta bekleyen API'ye
        // göndermeden önce normalize ediyoruz.
        weight_kg: Number.parseFloat(draft.weight.replace(",", ".")),
        reps: Number.parseInt(draft.reps, 10),
        rir: draft.rir === "" ? null : Number.parseInt(draft.rir, 10),
        technique: exercise.technique,
      });

      setRest({
        remaining: exercise.rest_seconds ?? 150,
        total: exercise.rest_seconds ?? 150,
      });
    },
    [drafts, logSet, sessionId],
  );

  if (today.isLoading) return <Loading />;
  if (today.isError) return <ErrorBox error={today.error} onRetry={() => void today.refetch()} />;

  const workout = today.data;
  if (!workout || workout.exercises.length === 0) {
    return (
      <Empty
        title="Bugün için planlanmış antrenman yok"
        hint="Önce bir program seçip aktif hâle getirmen gerekiyor."
        action={
          <Link href="/programs" className="btn btn-primary">
            Programlara git
          </Link>
        }
      />
    );
  }

  const loggedSets = session.data?.sets ?? [];
  const loggedSet = (exerciseId: string, setNumber: number) =>
    loggedSets.find((s) => s.exercise_id === exerciseId && s.set_number === setNumber);

  const totalPlanned = workout.exercises.reduce((sum, e) => sum + e.target_sets, 0);
  const doneCount = loggedSets.filter((s) => !s.is_warmup).length;

  // --- Rekor kutlaması (Bölüm 4.4) ---
  if (newRecords !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Antrenman bitti</h1>
        {newRecords.length > 0 ? (
          <section className="card p-4" style={{ borderColor: "var(--color-accent)" }}>
            <p className="text-2xs uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
              {newRecords.length} yeni rekor
            </p>
            <ul className="mt-3 space-y-2">
              {newRecords.map((record, i) => (
                <li key={i} className="tnum text-sm">
                  <span className="animate-check inline-block">🏆</span>{" "}
                  {prLabel(record.type)}: {fmt(record.value, 1)} {prUnit(record.type)}
                  {record.reps !== null && ` x ${record.reps}`}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Bu seansta rekor kırılmadı — ama {doneCount} set tamamladın, hacim birikiyor.
          </p>
        )}
        <div className="flex gap-2">
          <Link href="/" className="btn btn-primary">
            Panele dön
          </Link>
          <Link href="/progress" className="btn btn-ghost">
            İlerlemeyi gör
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Antrenman</h1>
          <p className="mt-1 truncate text-sm text-[var(--color-ink-muted)]">
            {workout.day_label}
          </p>
        </div>
        <p className="tnum shrink-0 text-sm text-[var(--color-ink-muted)]">
          {doneCount} / {totalPlanned} set
        </p>
      </header>

      {sessionId === null ? (
        <button
          className="btn btn-primary w-full"
          disabled={startSession.isPending}
          onClick={async () => {
            const created = await startSession.mutateAsync({
              program_day_id: workout.program_day_id,
            });
            setSessionId(created.id);
          }}
        >
          {startSession.isPending ? "Başlatılıyor…" : "Antrenmanı başlat"}
        </button>
      ) : (
        rest && (
          <RestTimer
            remaining={rest.remaining}
            total={rest.total}
            onSkip={() => setRest(null)}
          />
        )
      )}

      {startSession.isError && <ErrorBox error={startSession.error} />}
      {logSet.isError && <ErrorBox error={logSet.error} />}

      {workout.exercises.map((exercise) => (
        <section key={exercise.program_exercise_id} className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-medium">{exercise.name}</h2>
            {exercise.superset_group !== null && (
              <span className="shrink-0 rounded-[3px] border border-[var(--color-border-strong)] px-1.5 py-0.5 text-2xs text-[var(--color-ink-muted)]">
                superset {exercise.superset_group}
              </span>
            )}
          </div>
          <p className="tnum mt-0.5 text-xs text-[var(--color-ink-faint)]">
            {exercise.target_sets}x{exercise.target_rep_min}
            {exercise.target_rep_min !== exercise.target_rep_max && `-${exercise.target_rep_max}`}
            {" · "}
            {exercise.technique}
          </p>

          {exercise.progression && (
            <>
              <p className="mt-3 rounded-[3px] bg-[var(--color-accent-dim)] px-2.5 py-2 text-xs">
                {exercise.progression.message}
              </p>
              {exercise.progression.warnings.map((warning, i) => (
                <p key={i} className="mt-1.5 text-xs" style={{ color: "var(--color-warning)" }}>
                  {warning}
                </p>
              ))}
            </>
          )}
          {exercise.last_session_summary && (
            <p className="tnum mt-1.5 text-xs text-[var(--color-ink-faint)]">
              Geçen sefer: {exercise.last_session_summary}
            </p>
          )}

          <div className="mt-3 space-y-2">
            {Array.from({ length: exercise.target_sets }, (_, index) => {
              const setNumber = index + 1;
              const key = draftKey(exercise.exercise_id, setNumber);
              const logged = loggedSet(exercise.exercise_id, setNumber);
              const done = logged !== undefined;
              // Tamamlanmış setin değerleri SUNUCUDAN okunur, taslaktan değil.
              // `drafts` yalnızca bellekte: sayfa yenilenince ya da yarım kalan
              // antrenmana "Devam et" ile dönünce boşalıyor ve girilmiş setler
              // boş kutu görünüyordu. Setin kendisi kaydediliyordu, sadece
              // ekranda kaybolmuştu.
              const draft = logged
                ? {
                    weight: weightText(logged.weight_kg),
                    reps: String(logged.reps),
                    rir: logged.rir === null ? "" : String(logged.rir),
                  }
                : (drafts[key] ?? { weight: "", reps: "", rir: "" });

              return (
                <div key={setNumber} className="flex items-center gap-2">
                  <span className="tnum w-5 shrink-0 text-xs text-[var(--color-ink-faint)]">
                    {setNumber}
                  </span>
                  <NumberField
                    label="kg"
                    value={draft.weight}
                    onChange={(v) => updateDraft(key, { weight: v })}
                    disabled={done || sessionId === null}
                  />
                  <NumberField
                    label="tekrar"
                    value={draft.reps}
                    onChange={(v) => updateDraft(key, { reps: v })}
                    disabled={done || sessionId === null}
                  />
                  <NumberField
                    label="RIR"
                    value={draft.rir}
                    onChange={(v) => updateDraft(key, { rir: v })}
                    disabled={done || sessionId === null}
                  />
                  <button
                    type="button"
                    aria-label={`Set ${setNumber} tamamlandı`}
                    disabled={done || sessionId === null || !draft.weight || !draft.reps}
                    onClick={() => void submitSet(exercise, setNumber)}
                    className={`grid size-11 shrink-0 place-items-center rounded-[3px] border transition-colors ${
                      done
                        ? "border-transparent bg-[var(--color-accent)] text-[var(--color-ink)]"
                        : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] disabled:opacity-40"
                    }`}
                  >
                    <span className={done ? "animate-check" : undefined}>✓</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {sessionId !== null && (
        <button
          className="btn btn-primary w-full"
          disabled={doneCount === 0 || complete.isPending}
          onClick={async () => {
            const result = await complete.mutateAsync(sessionId);
            setNewRecords(result.new_records);
          }}
        >
          {complete.isPending ? "Kapatılıyor…" : "Antrenmanı bitir"}
        </button>
      )}
      {complete.isError && <ErrorBox error={complete.error} />}
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
        // inputMode="decimal": mobilde sayısal klavye açar ama virgül de yazılabilir.
        // type="number" kullanılmıyor — iOS'ta ok tuşları alanı daraltıyor.
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

  return (
    <div className="card sticky top-16 z-10 flex items-center gap-3 p-3" role="timer">
      <div className="relative size-11 shrink-0">
        <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden="true">
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
