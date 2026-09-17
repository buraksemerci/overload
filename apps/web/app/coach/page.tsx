"use client";

/**
 * Haftalık Koç Raporu — rapor önde, sayılar arkada.
 *
 * --------------------------------------------------------------------------
 * SIRA TERSİNE ÇEVRİLDİ
 * --------------------------------------------------------------------------
 * Ekran önce bu haftanın canlı metriklerini (üç kart + iki kart daha), sonra
 * AI raporunu gösteriyordu. Ama bu ekranın adı "Koç Raporu" ve buraya gelen
 * kişi raporu okumaya geliyor; metrikler onu doğrulamak için var.
 *
 * Şimdi rapor metni tepede ve tam genişlikte. Haftanın sayıları tek satırlık
 * bir özet olarak onun üstünde duruyor; ayrıntılar (rekorlar, hedefin altında
 * kalan kaslar) kapalı bir bölümde.
 *
 * Rapor henüz üretilmemişse sayılar öne geçiyor — "rapor yok" demek yerine
 * verinin kendisini göstermek daha kullanışlı.
 *
 * --------------------------------------------------------------------------
 * MODEL ÇIKTISI HAM METİN
 * --------------------------------------------------------------------------
 * Rapor markdown olarak geliyor ve `whitespace-pre-wrap` ile basılıyor.
 * `dangerouslySetInnerHTML` ile HTML'e çevirmek XSS yüzeyi açardı: model
 * çıktısı güvenilmez girdidir ve bu uygulamada asistan kullanıcının kendi
 * metnini de raporlara taşıyabiliyor.
 */

import { useState } from "react";
import { Page, PageHeader, Section } from "@/components/Layout";
import { ErrorBox, Loading, fmt } from "@/components/States";
import { useCurrentWeek, useLatestCoachReport } from "@/lib/queries";

export default function CoachPage() {
  const report = useLatestCoachReport();
  const week = useCurrentWeek();
  const [showDetail, setShowDetail] = useState(false);

  const metrics = (week.data?.metrics ?? {}) as Record<string, unknown>;
  const num = (key: string): number | null => {
    const value = metrics[key];
    return typeof value === "number" ? value : null;
  };
  const list = (key: string): string[] => {
    const value = metrics[key];
    return Array.isArray(value) ? (value as string[]) : [];
  };

  const records = list("new_records");
  const undertrained = list("undertrained_muscles");
  const hasDetail = records.length > 0 || undertrained.length > 0;

  return (
    <Page>
      <PageHeader
        photo="app-review"
        position="right center"
        eyebrow="Asistan"
        title="Koç Raporu"
        info={
          <>
            Haftalık değerlendirme her Pazartesi, tamamlanmış hafta için gece
            çalışan bir işle üretiliyor. Üstteki sayılar içinde bulunduğun
            haftanın <strong>canlı</strong> hâli — rapor beklemeden görebilmen
            için.
          </>
        }
      />

      {/* --- Bu haftanın tek satırı --------------------------------------- */}
      {week.isLoading ? (
        <Loading />
      ) : week.isError ? (
        <ErrorBox error={week.error} />
      ) : (
        <section className="card px-6 py-5 lg:px-8">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <Figure label="Seans" value={num("sessions")} />
            <Figure label="Çalışma seti" value={num("total_sets")} />
            <Figure label="Tonaj" value={num("total_volume_kg")} unit="kg" />
            {records.length > 0 && (
              <div>
                <p className="label">Yeni rekor</p>
                <p className="mt-1">
                  <span
                    className="figure tnum text-xl leading-none"
                    style={{ color: "var(--color-accent-deep)" }}
                  >
                    {records.length}
                  </span>
                </p>
              </div>
            )}
          </div>

          {hasDetail && (
            <div className="mt-4">
              <button
                type="button"
                className="btn btn-quiet -ml-2.5"
                aria-expanded={showDetail}
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? "Ayrıntıyı gizle" : "Haftanın ayrıntısı"}
              </button>

              {showDetail && (
                <div className="reveal mt-3 grid gap-4 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2">
                  {records.length > 0 && (
                    <div>
                      <p className="label mb-2">Yeni rekorlar</p>
                      <ul className="flex flex-col gap-1">
                        {records.map((record, index) => (
                          <li key={index} className="tnum text-xs">
                            {record}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {undertrained.length > 0 && (
                    <div>
                      <p className="label mb-2">Hedefin altında</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {undertrained.map((muscle) => (
                          <li key={muscle} className="badge">
                            {muscle}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* --- Rapor -------------------------------------------------------- */}
      {report.isLoading ? (
        <Loading />
      ) : report.isError ? (
        <Section title="Son rapor">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Henüz rapor üretilmedi. Raporlar tamamlanmış bir hafta için, gece
            çalışan bir işle oluşturuluyor — ilk haftan dolduğunda burada
            olacak.
          </p>
          {/* Buradaki "elle tetiklemek için: python -m ..." satırı KALDIRILDI.
              Kullanıcıya verilebilecek bir talimat değil — uygulamayı
              kullanan kişinin sunucuda komut çalıştırma imkânı yok ve
              yapamayacağı bir şeyi söylemek, ekranda bir hata olduğunu
              düşündürüyor. Betiğin kendisi duruyor:
              `apps/api/src/overload_api/scripts/weekly_reports.py`. */}
        </Section>
      ) : (
        <article className="card p-6 lg:p-10">
          <p className="label">
            {report.data &&
              new Date(`${report.data.week_start}T00:00:00`).toLocaleDateString(
                "tr-TR",
                { day: "numeric", month: "long", year: "numeric" },
              )}{" "}
            haftası
          </p>
          {/* Okuma genişliği sınırlı: 68rem'lik kartta satırlar 130 karaktere
              uzuyor ve göz satır başını kaybediyor. */}
          <div className="mt-4 max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed">
            {report.data?.content}
          </div>
        </article>
      )}
    </Page>
  );
}

function Figure({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit?: string;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1">
        <span className="figure tnum text-xl leading-none">
          {value === null ? "—" : fmt(value, 0)}
        </span>
        {unit && (
          <span className="ml-1.5 text-xs text-[var(--color-ink-faint)]">{unit}</span>
        )}
      </p>
    </div>
  );
}
