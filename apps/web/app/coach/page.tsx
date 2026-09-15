"use client";

/**
 * Haftalık Koç Raporu (Bölüm 8, ekran 14).
 *
 * Rapor gece Batch API ile üretiliyor; henüz gelmemişse ekran boş kalmasın diye
 * haftanın canlı metrikleri gösteriliyor. "Rapor yok" demek yerine, verinin
 * kendisini göstermek daha kullanışlı.
 */

import { PageHeader } from "@/components/Layout";
import { ErrorBox, Loading, Stat, fmt } from "@/components/States";
import { useCurrentWeek, useLatestCoachReport } from "@/lib/queries";

export default function CoachPage() {
  const report = useLatestCoachReport();
  const week = useCurrentWeek();

  const metrics = (week.data?.metrics ?? {}) as Record<string, unknown>;
  const num = (key: string): number | null => {
    const value = metrics[key];
    return typeof value === "number" ? value : null;
  };
  const list = (key: string): string[] => {
    const value = metrics[key];
    return Array.isArray(value) ? (value as string[]) : [];
  };

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Koç Raporu"
        info={
          <>
            Haftalık değerlendirme her Pazartesi, tamamlanmış hafta için gece
            çalışan bir işle üretiliyor. Aşağıdaki sayılar içinde bulunduğun
            haftanın canlı hâli — rapor beklemeden görebilmen için.
          </>
        }
      />

      {/* --- Bu haftanın canlı metrikleri --- */}
      <section>
        <h2 className="mb-3 text-base font-medium">Bu hafta</h2>
        {week.isLoading ? (
          <Loading />
        ) : week.isError ? (
          <ErrorBox error={week.error} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Seans" value={num("sessions") ?? "—"} unit="antrenman" />
              <Stat label="Çalışma seti" value={num("total_sets") ?? "—"} unit="set" />
              <Stat
                label="Tonaj"
                value={fmt(num("total_volume_kg"), 0)}
                unit="kg"
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {list("new_records").length > 0 && (
                <div className="card p-6">
                  <p className="text-2xs uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                    Yeni rekorlar
                  </p>
                  <ul className="mt-2 space-y-1">
                    {list("new_records").map((record, i) => (
                      <li key={i} className="tnum text-xs">
                        {record}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {list("undertrained_muscles").length > 0 && (
                <div className="card p-6">
                  <p className="text-2xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Hedefin altında
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                    {list("undertrained_muscles").join(", ")}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* --- Son AI raporu --- */}
      <section>
        <h2 className="mb-3 text-base font-medium">Son rapor</h2>
        {report.isLoading ? (
          <Loading />
        ) : report.isError ? (
          <div className="card p-6">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Henüz rapor üretilmedi. Raporlar tamamlanmış bir hafta için, gece
              çalışan bir işle oluşturuluyor — ilk haftan dolduğunda burada olacak.
            </p>
            <p className="mt-2 text-2xs text-[var(--color-ink-faint)]">
              Elle tetiklemek için:{" "}
              <code className="font-mono">
                python -m overload_api.scripts.weekly_reports run
              </code>
            </p>
          </div>
        ) : (
          <article className="card p-6">
            <p className="text-2xs text-[var(--color-ink-faint)]">
              {report.data &&
                new Date(`${report.data.week_start}T00:00:00`).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
              haftası
            </p>
            {/* Markdown ham gösteriliyor: `dangerouslySetInnerHTML` ile model
                çıktısını HTML olarak basmak XSS yüzeyi açardı. Model çıktısı
                güvenilmez girdidir. */}
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
              {report.data?.content}
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
