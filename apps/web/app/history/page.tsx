"use client";

/** Geçmiş / Takvim (Bölüm 8, ekran 6). */

import { useState } from "react";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { useSessions, type WorkoutSession } from "@/lib/queries";

export default function HistoryPage() {
  const sessions = useSessions(60);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sessions.isLoading) return <Loading />;
  if (sessions.isError)
    return <ErrorBox error={sessions.error} onRetry={() => void sessions.refetch()} />;

  const rows = sessions.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Geçmiş</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Tamamlanan ve devam eden antrenmanlar.
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty
          title="Henüz antrenman kaydın yok"
          hint="İlk seansını tamamladığında burada listelenecek."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((session) => (
            <li key={session.id}>
              <SessionRow
                session={session}
                expanded={expanded === session.id}
                onToggle={() => setExpanded(expanded === session.id ? null : session.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionRow({
  session,
  expanded,
  onToggle,
}: {
  session: WorkoutSession;
  expanded: boolean;
  onToggle: () => void;
}) {
  const workingSets = session.sets.filter((s) => !s.is_warmup);
  const volume = workingSets.reduce(
    (sum, s) => sum + Number.parseFloat(s.weight_kg) * s.reps,
    0,
  );
  const started = new Date(session.started_at);
  const duration =
    session.completed_at !== null
      ? Math.round(
          (new Date(session.completed_at).getTime() - started.getTime()) / 60000,
        )
      : null;

  return (
    <div className="card p-3">
      <button onClick={onToggle} className="w-full text-left" aria-expanded={expanded}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm">
              {started.toLocaleDateString("tr-TR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p className="tnum mt-0.5 text-xs text-[var(--color-ink-faint)]">
              {workingSets.length} set · {fmt(volume, 0)} kg tonaj
              {duration !== null && ` · ${duration} dk`}
            </p>
          </div>
          {session.completed_at === null ? (
            <span
              className="shrink-0 rounded-[3px] px-1.5 py-0.5 text-2xs"
              style={{
                background: "var(--color-accent-dim)",
                color: "var(--color-accent)",
              }}
            >
              DEVAM EDİYOR
            </span>
          ) : session.is_deload ? (
            <span
              className="shrink-0 text-2xs"
              style={{ color: "var(--color-warning)" }}
            >
              deload
            </span>
          ) : null}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          {workingSets.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-faint)]">Set kaydı yok.</p>
          ) : (
            <ul className="space-y-1">
              {workingSets.map((set) => (
                <li
                  key={set.id}
                  className="tnum flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-[var(--color-ink-faint)]">Set {set.set_number}</span>
                  <span>
                    {fmt(set.weight_kg, 1)} kg x {set.reps}
                    {set.rir !== null && (
                      <span className="text-[var(--color-ink-faint)]"> RIR{set.rir}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {session.notes && (
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{session.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
