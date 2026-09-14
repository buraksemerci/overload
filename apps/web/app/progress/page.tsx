"use client";

/** İlerleme (Bölüm 8, ekran 8): güç standartları, tutarlılık ızgarası, rekorlar. */

import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { ConsistencyGrid } from "@/components/ConsistencyGrid";
import { useConsistency, useRecords, useStrengthStandards } from "@/lib/queries";

const PR_LABEL: Record<string, string> = {
  max_weight: "En ağır set",
  max_reps: "En çok tekrar",
  session_volume: "Seans hacmi",
  estimated_1rm: "Tahmini 1RM",
};

const LEVEL_COLOR: Record<string, string> = {
  untrained: "var(--color-ink-faint)",
  novice: "var(--color-ink-muted)",
  intermediate: "var(--color-accent)",
  advanced: "var(--color-success)",
  elite: "var(--color-warning)",
};

export default function ProgressPage() {
  const standards = useStrengthStandards();
  const consistency = useConsistency(365);
  const records = useRecords();

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
                  {PR_LABEL[record.type] ?? record.type}
                </span>
                <span className="tnum">
                  {fmt(record.value, 1)}
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
