"use client";

/** Supplement Takibi (Bölüm 8, ekran 11). */

import { useState } from "react";
import { PageHeader } from "@/components/Layout";
import { ErrorBox, Empty, Loading } from "@/components/States";
import { useCreateSupplement, useMarkIntake, useSupplementsToday } from "@/lib/queries";

const SCHEDULE_LABEL: Record<string, string> = {
  daily: "Her gün",
  training_days: "Antrenman günleri",
  rest_days: "Dinlenme günleri",
  as_needed: "Gerektiğinde",
};

export default function SupplementsPage() {
  const today = useSupplementsToday();
  const mark = useMarkIntake();
  const create = useCreateSupplement();

  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Supplement"
        info={
          <>
            &ldquo;Atladım&rdquo; da kaydediliyor: işaretlememek ile almamak ayrı
            tutuluyor, yoksa uyum oranı hesaplanamaz. Boş bırakılan bir gün
            &ldquo;bilinmiyor&rdquo;, atlanan gün ise &ldquo;alınmadı&rdquo;.
          </>
        }
      />

      {today.isLoading ? (
        <Loading />
      ) : today.isError ? (
        <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
      ) : (today.data ?? []).length === 0 ? (
        <Empty
          title="Henüz supplement tanımlamadın"
          hint="Aşağıdan ekleyebilirsin. Ekledikten sonra asistana 'kreatini aldım' diyerek de işaretleyebilirsin."
        />
      ) : (
        <ul className="space-y-2">
          {(today.data ?? []).map((row) => (
            <li key={row.supplement.id} className="card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {row.supplement.name}
                    {row.supplement.dose && (
                      <span className="ml-1.5 text-xs text-[var(--color-ink-faint)]">
                        {row.supplement.dose}
                      </span>
                    )}
                  </p>
                  <p className="text-2xs text-[var(--color-ink-faint)]">
                    {SCHEDULE_LABEL[row.supplement.schedule] ?? row.supplement.schedule}
                    {!row.due_today && " · bugün gerekmiyor"}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    aria-label="Aldım"
                    onClick={() =>
                      mark.mutate({ supplementId: row.supplement.id, taken: true })
                    }
                    className="grid size-11 place-items-center rounded-[3px] border transition-colors"
                    style={
                      row.taken === true
                        ? {
                            background: "var(--color-accent)",
                            borderColor: "transparent",
                            color: "var(--color-ink)",
                          }
                        : { borderColor: "var(--color-border-strong)", color: "var(--color-ink-muted)" }
                    }
                  >
                    <span className={row.taken === true ? "animate-check" : undefined}>✓</span>
                  </button>
                  <button
                    aria-label="Atladım"
                    onClick={() =>
                      mark.mutate({ supplementId: row.supplement.id, taken: false })
                    }
                    className="grid size-11 place-items-center rounded-[3px] border transition-colors"
                    style={
                      row.taken === false
                        ? { background: "var(--color-surface-raised)", borderColor: "var(--color-border-strong)", color: "var(--color-ink-muted)" }
                        : { borderColor: "var(--color-border-strong)", color: "var(--color-ink-faint)" }
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mark.isError && <ErrorBox error={mark.error} />}

      <section className="card p-6">
        {adding ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate(
                { name: name.trim(), dose: dose.trim() || null, schedule },
                {
                  onSuccess: () => {
                    setName("");
                    setDose("");
                    setAdding(false);
                  },
                },
              );
            }}
          >
            <h2 className="text-base">Yeni supplement</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ad (ör. Kreatin)"
              className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
            />
            <input
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Doz (ör. 5 g) — isteğe bağlı"
              className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
            />
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
            >
              {Object.entries(SCHEDULE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                Ekle
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
                Vazgeç
              </button>
            </div>
            {create.isError && <ErrorBox error={create.error} />}
          </form>
        ) : (
          <button className="btn btn-ghost w-full" onClick={() => setAdding(true)}>
            + Supplement ekle
          </button>
        )}
      </section>
    </div>
  );
}
