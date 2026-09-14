"use client";

/**
 * Programı Gözden Geçir — AI önerisinin satır satır düzenlenebildiği tam ekran.
 *
 * Bölüm 4.1'in şartı: AI `propose_program` ile tam yapılandırılmış bir program
 * önerir → kullanıcı bu ekranda satır satır inceleyip düzenler → onaylayınca
 * kaydedilir.
 *
 * **Onaya kadar hiçbir şey kaydedilmiyor.** Bu ekrandaki düzenlemeler
 * `PendingAction.payload` üzerinde yaşıyor; gerçek `Program` satırları ancak
 * "Onayla" denince, backend'de payload yeniden doğrulandıktan sonra oluşuyor.
 */

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorBox, Loading } from "@/components/States";
import {
  useExercises,
  usePendingAction,
  useResolvePendingAction,
  useUpdatePendingAction,
  type ProposedProgram,
} from "@/lib/queries";

const TECHNIQUES = [
  { value: "straight", label: "Düz set" },
  { value: "rir1", label: "RIR 1" },
  { value: "failure", label: "Failure" },
  { value: "rir1_to_failure", label: "RIR1 → Failure" },
  { value: "superset_failure", label: "Superset (failure)" },
  { value: "drop_set", label: "Drop set" },
  { value: "myo_reps", label: "Myo-reps" },
] as const;

const GOALS = [
  { value: "strength", label: "Güç" },
  { value: "hypertrophy", label: "Hipertrofi" },
  { value: "powerbuilding", label: "Powerbuilding" },
  { value: "general_fitness", label: "Genel form" },
] as const;

const LEVELS = [
  { value: "beginner", label: "Başlangıç" },
  { value: "intermediate", label: "Orta" },
  { value: "advanced", label: "İleri" },
] as const;

export default function ProgramReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pending = usePendingAction(params.id ?? null);
  const update = useUpdatePendingAction();
  const resolve = useResolvePendingAction();

  // Tüm kütüphane bir kez çekiliyor: payload sadece exercise_id tutuyor,
  // ekranda adları göstermek ve hareket değiştirebilmek için gerekli.
  const library = useExercises("");
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const exercise of library.data ?? []) map.set(exercise.id, exercise.name);
    return map;
  }, [library.data]);

  const [draft, setDraft] = useState<ProposedProgram | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (pending.data && draft === null) {
      setDraft(pending.data.payload as unknown as ProposedProgram);
    }
  }, [pending.data, draft]);

  if (pending.isLoading || draft === null) return <Loading />;
  if (pending.isError)
    return <ErrorBox error={pending.error} onRetry={() => void pending.refetch()} />;

  const isOpen = pending.data?.status === "pending";

  const edit = (mutate: (next: ProposedProgram) => void) => {
    // Yapısal paylaşım yerine derin kopya: iç içe diziler mutasyona uğruyor ve
    // sığ kopyada React değişikliği fark etmiyor.
    const next = structuredClone(draft);
    mutate(next);
    setDraft(next);
    setDirty(true);
  };

  const totalExercises = draft.days.reduce((sum, day) => sum + day.exercises.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-2xs uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
          Program önerisi · onayın gerekiyor
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Programı gözden geçir</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Aşağıdaki her satırı değiştirebilirsin. <strong>Onaylayana kadar hiçbir şey
          kaydedilmiyor</strong> — vazgeçersen program hiç var olmamış olur.
        </p>
      </header>

      {!isOpen && (
        <div className="card p-4">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Bu öneri zaten &ldquo;{pending.data?.status}&rdquo; durumunda; artık
            düzenlenemez.
          </p>
        </div>
      )}

      {draft.rationale && (
        <section className="card p-4">
          <h2 className="text-xs font-medium text-[var(--color-ink-muted)]">
            Asistanın gerekçesi
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{draft.rationale}</p>
        </section>
      )}

      {/* --- Program başlığı --- */}
      <section className="card space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-ink-muted)]">Program adı</span>
          <input
            value={draft.name}
            disabled={!isOpen}
            onChange={(e) => edit((next) => void (next.name = e.target.value))}
            className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-[var(--color-ink-muted)]">Hedef</span>
            <select
              value={draft.goal}
              disabled={!isOpen}
              onChange={(e) => edit((next) => void (next.goal = e.target.value))}
              className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
            >
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-[var(--color-ink-muted)]">Seviye</span>
            <select
              value={draft.level}
              disabled={!isOpen}
              onChange={(e) => edit((next) => void (next.level = e.target.value))}
              className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="tnum text-2xs text-[var(--color-ink-faint)]">
          {draft.days.length} gün · {totalExercises} hareket
        </p>
      </section>

      {/* --- Günler --- */}
      {draft.days.map((day, dayIndex) => (
        <section key={dayIndex} className="card p-4">
          <div className="flex items-center gap-2">
            <input
              value={day.label}
              disabled={!isOpen}
              // Etiketsiz girdi ekran okuyucuda "düzenleme alanı" diye okunur;
              // hangi gün olduğu anlaşılmaz.
              aria-label={`${dayIndex + 1}. günün adı`}
              onChange={(e) =>
                edit((next) => void (next.days[dayIndex]!.label = e.target.value))
              }
              className="h-10 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm font-medium outline-none"
            />
            <button
              disabled={!isOpen || draft.days.length <= 1}
              onClick={() => edit((next) => void next.days.splice(dayIndex, 1))}
              aria-label={`${day.label} gününü sil`}
              className="grid size-10 shrink-0 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-[var(--color-ink-faint)] hover:text-[var(--color-danger)] disabled:opacity-30"
            >
              ✕
            </button>
          </div>

          <ul className="mt-3 space-y-2">
            {day.exercises.map((exercise, exerciseIndex) => (
              <li
                key={exerciseIndex}
                className="rounded-[3px] border border-[var(--color-border)] p-2.5"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={exercise.exercise_id}
                    disabled={!isOpen}
                    onChange={(e) =>
                      edit(
                        (next) =>
                          void (next.days[dayIndex]!.exercises[exerciseIndex]!.exercise_id =
                            e.target.value),
                      )
                    }
                    className="h-9 min-w-0 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
                  >
                    {/* Kütüphane yüklenmediyse en azından mevcut id korunsun */}
                    {!nameById.has(exercise.exercise_id) && (
                      <option value={exercise.exercise_id}>
                        (bilinmeyen hareket: {exercise.exercise_id.slice(0, 8)})
                      </option>
                    )}
                    {(library.data ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex shrink-0 gap-1">
                    <button
                      disabled={!isOpen || exerciseIndex === 0}
                      onClick={() =>
                        edit((next) => {
                          const list = next.days[dayIndex]!.exercises;
                          [list[exerciseIndex - 1]!, list[exerciseIndex]!] = [
                            list[exerciseIndex]!,
                            list[exerciseIndex - 1]!,
                          ];
                        })
                      }
                      aria-label="Yukarı taşı"
                      className="grid size-9 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-xs text-[var(--color-ink-muted)] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      disabled={!isOpen || exerciseIndex === day.exercises.length - 1}
                      onClick={() =>
                        edit((next) => {
                          const list = next.days[dayIndex]!.exercises;
                          [list[exerciseIndex]!, list[exerciseIndex + 1]!] = [
                            list[exerciseIndex + 1]!,
                            list[exerciseIndex]!,
                          ];
                        })
                      }
                      aria-label="Aşağı taşı"
                      className="grid size-9 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-xs text-[var(--color-ink-muted)] disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      disabled={!isOpen}
                      onClick={() =>
                        edit((next) => void next.days[dayIndex]!.exercises.splice(exerciseIndex, 1))
                      }
                      aria-label="Hareketi sil"
                      className="grid size-9 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-danger)] disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <NumField
                    label="Set"
                    value={exercise.target_sets}
                    disabled={!isOpen}
                    onChange={(v) =>
                      edit(
                        (next) =>
                          void (next.days[dayIndex]!.exercises[exerciseIndex]!.target_sets = v),
                      )
                    }
                  />
                  <NumField
                    label="Tekrar min"
                    value={exercise.target_rep_min}
                    disabled={!isOpen}
                    onChange={(v) =>
                      edit(
                        (next) =>
                          void (next.days[dayIndex]!.exercises[exerciseIndex]!.target_rep_min = v),
                      )
                    }
                  />
                  <NumField
                    label="Tekrar max"
                    value={exercise.target_rep_max}
                    disabled={!isOpen}
                    onChange={(v) =>
                      edit(
                        (next) =>
                          void (next.days[dayIndex]!.exercises[exerciseIndex]!.target_rep_max = v),
                      )
                    }
                  />
                  <label className="min-w-[8rem] flex-1">
                    <span className="mb-1 block text-2xs text-[var(--color-ink-muted)]">
                      Teknik
                    </span>
                    <select
                      value={exercise.technique}
                      disabled={!isOpen}
                      onChange={(e) =>
                        edit(
                          (next) =>
                            void (next.days[dayIndex]!.exercises[exerciseIndex]!.technique =
                              e.target.value),
                        )
                      }
                      className="h-9 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-1.5 text-xs outline-none"
                    >
                      {TECHNIQUES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {exercise.target_percent_1rm !== null && (
                  <p className="tnum mt-1.5 text-2xs text-[var(--color-ink-faint)]">
                    Antrenman maksimumunun %{exercise.target_percent_1rm}&apos;i
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* --- Eylemler --- */}
      {isOpen && (
        <div className="sticky bottom-20 space-y-2 sm:bottom-0">
          {dirty && (
            <p className="text-2xs text-[var(--color-warning)]">
              Kaydedilmemiş düzenlemen var. &ldquo;Onayla&rdquo; demeden önce kaydet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              disabled={!dirty || update.isPending}
              onClick={async () => {
                await update.mutateAsync({
                  id: params.id,
                  payload: draft as unknown as Record<string, unknown>,
                });
                setDirty(false);
              }}
            >
              {update.isPending ? "Kaydediliyor…" : "Düzenlemeyi kaydet"}
            </button>
            <button
              className="btn btn-primary"
              disabled={dirty || resolve.isPending}
              onClick={async () => {
                await resolve.mutateAsync({ id: params.id, decision: "approve" });
                router.replace("/programs");
              }}
            >
              {resolve.isPending ? "Uygulanıyor…" : "Onayla ve kaydet"}
            </button>
            <button
              className="btn btn-ghost"
              disabled={resolve.isPending}
              onClick={async () => {
                await resolve.mutateAsync({ id: params.id, decision: "reject" });
                router.replace("/chat");
              }}
            >
              Reddet
            </button>
          </div>
          {update.isError && <ErrorBox error={update.error} />}
          {resolve.isError && <ErrorBox error={resolve.error} />}
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="w-16">
      <span className="mb-1 block text-2xs text-[var(--color-ink-muted)]">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          // NaN'ı state'e yazmak alanı kilitliyor; geçersiz girdide değeri koru.
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="tnum h-9 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-1.5 text-center text-xs outline-none"
      />
    </label>
  );
}
