"use client";

/** Hareket Kütüphanesi (Bölüm 8, ekran 5). */

import { useState } from "react";
import { ErrorBox, Empty, Loading } from "@/components/States";
import { useExercises } from "@/lib/queries";

const EQUIPMENT = [
  { value: "", label: "Hepsi" },
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Makine" },
  { value: "plate_loaded", label: "Plate loaded" },
  { value: "smith_machine", label: "Smith" },
  { value: "cable", label: "Kablo" },
  { value: "bodyweight", label: "Vücut ağırlığı" },
] as const;

export default function ExercisesPage() {
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState("");
  const exercises = useExercises(query, equipment || undefined);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hareket Kütüphanesi</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Her hareketin kas grubu eşlemesi var — kas haritası ve hacim dengesi
          buradan besleniyor.
        </p>
      </header>

      <div className="space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hareket ara…"
          className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {EQUIPMENT.map((option) => (
            <button
              key={option.value}
              onClick={() => setEquipment(option.value)}
              className={`rounded-[3px] px-2 py-1 text-2xs ${
                equipment === option.value
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-border-strong)] text-[var(--color-ink-muted)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {exercises.isLoading ? (
        <Loading />
      ) : exercises.isError ? (
        <ErrorBox error={exercises.error} onRetry={() => void exercises.refetch()} />
      ) : (exercises.data ?? []).length === 0 ? (
        <Empty
          title="Eşleşen hareket yok"
          hint="Aramayı daralt ya da asistandan kütüphaneye yeni bir hareket eklemesini iste — kas grubu eşlemesiyle birlikte önerir, sen onaylarsın."
        />
      ) : (
        <ul className="space-y-2">
          {(exercises.data ?? []).map((exercise) => (
            <li key={exercise.id} className="card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {exercise.name}
                    {exercise.is_unilateral && (
                      <span className="ml-1.5 text-2xs text-[var(--color-ink-faint)]">
                        tek taraflı
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    <span style={{ color: "var(--color-accent)" }}>
                      {exercise.primary_muscles.join(", ") || "—"}
                    </span>
                    {exercise.secondary_muscles.length > 0 && (
                      <span className="text-[var(--color-ink-faint)]">
                        {" · "}
                        {exercise.secondary_muscles.join(", ")}
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 rounded-[3px] border border-[var(--color-border-strong)] px-1.5 py-0.5 text-2xs text-[var(--color-ink-muted)]">
                  {EQUIPMENT.find((e) => e.value === exercise.equipment)?.label ??
                    exercise.equipment}
                </span>
              </div>
              {exercise.is_custom && (
                <p className="mt-1.5 text-2xs" style={{ color: "var(--color-success)" }}>
                  senin eklediğin
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-2xs text-[var(--color-ink-faint)]">
        Birincil kaslar vurgulu, ikincil kaslar soluk gösteriliyor. Hacim hesabında
        birincil 1.0, ikincil 0.5 set sayılır.
      </p>
    </div>
  );
}
