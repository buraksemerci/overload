"use client";

/**
 * Program Düzenleme (Bölüm 4.1): gün/hareket ekle-sil-sırala, satır içi düzenleme.
 *
 * Sıralama hem **sürükle-bırak** (dokunmatik ve fare, dnd-kit) hem de tutamağa
 * odaklanıp **klavye** ile yapılabiliyor. Yalnızca sürüklemeye dayanan bir
 * arayüz klavye ve ekran okuyucu kullanıcılarına kapalı olurdu.
 *
 * Kaydetme tüm ağacı tek istekte gönderiyor (`PUT /programs/{id}/days`) —
 * sürükle-bırak sonrası sıra numaralarının yarısı değişiyor ve tek tek
 * güncelleme yarı-uygulanmış sıralama riski taşıyor.
 */

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SortableList } from "@/components/SortableList";
import { ErrorBox, Loading } from "@/components/States";
import {
  useExercises,
  useProgram,
  useReplaceProgramDays,
  type ProgramDayInput,
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

/** İç durumda kararlı kimlik: dizin kullanmak sıralama sonrası satırları karıştırır.
 *  `interface extends` indeksli erişim tipini kabul etmiyor; kesişim kullanılıyor. */
type EditableExercise = ProgramDayInput["exercises"][number] & { uid: string };

interface EditableDay {
  uid: string;
  label: string;
  exercises: EditableExercise[];
}

let uidCounter = 0;
const nextUid = () => `row-${++uidCounter}`;

export default function ProgramEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const program = useProgram(params.id ?? null);
  const library = useExercises("");
  const save = useReplaceProgramDays();

  const [days, setDays] = useState<EditableDay[] | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (program.data && days === null) {
      setDays(
        program.data.days.map((day) => ({
          uid: nextUid(),
          label: day.label,
          exercises: day.exercises.map((exercise) => ({
            uid: nextUid(),
            exercise_id: exercise.exercise_id,
            target_sets: exercise.target_sets,
            target_rep_min: exercise.target_rep_min,
            target_rep_max: exercise.target_rep_max,
            technique: exercise.technique,
            superset_group: exercise.superset_group,
            rest_seconds: exercise.rest_seconds,
            notes: exercise.notes,
            target_percent_1rm:
              exercise.target_percent_1rm === null
                ? null
                : Number.parseFloat(exercise.target_percent_1rm),
          })),
        })),
      );
    }
  }, [program.data, days]);

  if (program.isLoading || days === null) return <Loading />;
  if (program.isError)
    return <ErrorBox error={program.error} onRetry={() => void program.refetch()} />;

  if (program.data?.is_template) {
    return (
      <div className="card p-6">
        <p className="text-sm">
          Şablon programlar düzenlenemez. Önce kendi kopyanı çıkar — Programlar
          ekranındaki &ldquo;Başlat&rdquo; butonu bunu yapıyor.
        </p>
      </div>
    );
  }

  const edit = (mutate: (next: EditableDay[]) => void) => {
    const next = structuredClone(days);
    mutate(next);
    setDays(next);
    setDirty(true);
  };

  const firstExerciseId = library.data?.[0]?.id;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl lg:text-2xl">{program.data?.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Sıralamak için tutamağı sürükle ya da tutamağa odaklanıp boşluk + ok
          tuşlarını kullan.
        </p>
      </header>

      <SortableList
        items={days}
        getId={(day) => day.uid}
        onReorder={(reordered) => {
          setDays(reordered);
          setDirty(true);
        }}
        renderItem={(day, dayIndex) => (
          <section className="card mb-3 p-4">
            <div className="flex items-center gap-2">
              <input
                value={day.label}
                aria-label={`${dayIndex + 1}. günün adı`}
                onChange={(e) => edit((next) => void (next[dayIndex]!.label = e.target.value))}
                className="h-10 min-w-0 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm font-medium outline-none"
              />
              <button
                disabled={days.length <= 1}
                onClick={() => edit((next) => void next.splice(dayIndex, 1))}
                aria-label={`${day.label} gününü sil`}
                className="grid size-10 shrink-0 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-[var(--color-ink-faint)] hover:text-[var(--color-danger)] disabled:opacity-30"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <SortableList
                items={day.exercises}
                getId={(exercise) => exercise.uid}
                onReorder={(reordered) =>
                  edit((next) => void (next[dayIndex]!.exercises = reordered))
                }
                renderItem={(exercise, exerciseIndex) => (
                  <div className="mb-2 rounded-[3px] border border-[var(--color-border)] p-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={exercise.exercise_id}
                        onChange={(e) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[exerciseIndex]!.exercise_id =
                                e.target.value),
                          )
                        }
                        className="h-9 min-w-0 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
                      >
                        {(library.data ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          edit(
                            (next) => void next[dayIndex]!.exercises.splice(exerciseIndex, 1),
                          )
                        }
                        aria-label="Hareketi sil"
                        className="grid size-9 shrink-0 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-danger)]"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <NumField
                        label="Set"
                        value={exercise.target_sets}
                        onChange={(v) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[exerciseIndex]!.target_sets = v),
                          )
                        }
                      />
                      <NumField
                        label="Tek. min"
                        value={exercise.target_rep_min}
                        onChange={(v) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[exerciseIndex]!.target_rep_min = v),
                          )
                        }
                      />
                      <NumField
                        label="Tek. max"
                        value={exercise.target_rep_max}
                        onChange={(v) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[exerciseIndex]!.target_rep_max = v),
                          )
                        }
                      />
                      <label className="min-w-[7rem] flex-1">
                        <span className="mb-1 block text-2xs text-[var(--color-ink-muted)]">
                          Teknik
                        </span>
                        <select
                          value={exercise.technique}
                          onChange={(e) =>
                            edit(
                              (next) =>
                                void (next[dayIndex]!.exercises[exerciseIndex]!.technique =
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
                      <label className="w-20">
                        <span className="mb-1 block text-2xs text-[var(--color-ink-muted)]">
                          Superset
                        </span>
                        <input
                          inputMode="numeric"
                          value={exercise.superset_group ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const parsed = raw === "" ? null : Number.parseInt(raw, 10);
                            edit(
                              (next) =>
                                void (next[dayIndex]!.exercises[
                                  exerciseIndex
                                ]!.superset_group = Number.isFinite(parsed as number)
                                  ? (parsed as number)
                                  : null),
                            );
                          }}
                          className="tnum h-9 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-1.5 text-center text-xs outline-none"
                        />
                      </label>
                    </div>
                  </div>
                )}
              />

              <button
                className="btn btn-ghost w-full"
                disabled={!firstExerciseId}
                onClick={() =>
                  edit((next) =>
                    next[dayIndex]!.exercises.push({
                      uid: nextUid(),
                      exercise_id: firstExerciseId!,
                      target_sets: 3,
                      target_rep_min: 8,
                      target_rep_max: 12,
                      technique: "rir1",
                      superset_group: null,
                      rest_seconds: null,
                      notes: null,
                      target_percent_1rm: null,
                    }),
                  )
                }
              >
                + Hareket ekle
              </button>
            </div>
          </section>
        )}
      />

      <button
        className="btn btn-ghost w-full"
        disabled={days.length >= 7}
        onClick={() =>
          edit((next) =>
            next.push({ uid: nextUid(), label: `Gün ${next.length + 1}`, exercises: [] }),
          )
        }
      >
        + Gün ekle
      </button>

      <div className="sticky bottom-20 flex flex-wrap gap-2 sm:bottom-0">
        <button
          className="btn btn-primary"
          disabled={!dirty || save.isPending || days.some((d) => d.exercises.length === 0)}
          onClick={async () => {
            await save.mutateAsync({
              programId: params.id,
              // `uid` yalnızca istemci tarafı sıralama kimliği; API'ye gitmiyor.
              days: days.map(({ label, exercises }) => ({
                label,
                exercises: exercises.map(({ uid: _uid, ...rest }) => rest),
              })),
            });
            setDirty(false);
            router.push("/programs");
          }}
        >
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/programs")}>
          Vazgeç
        </button>
      </div>

      {days.some((d) => d.exercises.length === 0) && (
        <p className="text-2xs" style={{ color: "var(--color-warning)" }}>
          Hareketi olmayan gün kaydedilemez — ya hareket ekle ya da günü sil.
        </p>
      )}
      {save.isError && <ErrorBox error={save.error} />}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="w-16">
      <span className="mb-1 block text-2xs text-[var(--color-ink-muted)]">{label}</span>
      <input
        inputMode="numeric"
        value={value}
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
