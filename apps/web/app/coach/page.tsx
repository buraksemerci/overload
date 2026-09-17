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
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
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

  const weekLabel = report.data
    ? new Date(`${report.data.week_start}T00:00:00`).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Page>
      <Hero
        photo="app-review"
        position="right center"
        size="md"
        eyebrow="Asistan"
        title="Koç raporu"
        lead={
          weekLabel
            ? `${weekLabel} haftasının değerlendirmesi. Üstteki sayılar içinde bulunduğun haftanın canlı hâli.`
            : "Haftanın canlı sayıları; rapor hafta kapanınca geliyor."
        }
        info={
          <>
            Haftalık değerlendirme her Pazartesi, tamamlanmış hafta için gece
            çalışan bir işle üretiliyor. Üstteki sayılar içinde bulunduğun
            haftanın <strong>canlı</strong> hâli — rapor beklemeden görebilmen
            için.
          </>
        }
      >
        <HeroStats>
          <HeroStat label="Seans" value={week.data ? (num("sessions") ?? 0) : "—"} foot="bu hafta" />
          <HeroStat label="Çalışma seti" value={week.data ? (num("total_sets") ?? 0) : "—"} />
          <HeroStat
            label="Tonaj"
            value={week.data ? fmt(num("total_volume_kg") ?? 0, 0) : "—"}
            unit="kg"
          />
          <HeroStat label="Yeni rekor" value={week.data ? records.length : "—"} />
        </HeroStats>
      </Hero>

      {week.isError && <ErrorBox error={week.error} />}

      {/* --- Rapor --------------------------------------------------------
          Ekranın adı "Koç Raporu" ve buraya gelen kişi raporu okumaya
          geliyor; sayılar onu doğrulamak için bantta duruyor. */}
      {report.isLoading ? (
        <Loading />
      ) : report.isError ? (
        <Section title="Son rapor">
          <p className="text-base text-[var(--color-ink-muted)]">
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
        <article className="card p-6 sm:p-10 lg:p-14">
          <p className="label">{weekLabel} haftası</p>
          {/* Okuma genişliği sınırlı: 88rem'lik kartta satırlar 130 karaktere
              uzuyor ve göz satır başını kaybediyor. */}
          <div className="mt-6 max-w-[62ch] whitespace-pre-wrap text-base leading-relaxed sm:text-lg">
            {report.data?.content}
          </div>
        </article>
      )}

      {/* --- Haftanın ayrıntısı -------------------------------------------- */}
      {hasDetail && (
        <Section bare>
          <button
            type="button"
            className="btn btn-quiet -ml-2.5"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((v) => !v)}
          >
            {showDetail ? "Ayrıntıyı gizle" : "Haftanın ayrıntısı"}
          </button>

          {showDetail && (
            <div className="reveal mt-4 grid gap-6 sm:grid-cols-2">
              {records.length > 0 && (
                <div className="card p-6">
                  <p className="label mb-3">Yeni rekorlar</p>
                  <ul className="flex flex-col gap-1.5">
                    {records.map((record, index) => (
                      <li key={index} className="tnum text-sm">
                        {record}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {undertrained.length > 0 && (
                <div className="card p-6">
                  <p className="label mb-3">Hedefin altında</p>
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
        </Section>
      )}
    </Page>
  );
}
