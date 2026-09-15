"use client";

/**
 * İlerleme — "daha güçlü müyüm" sorusunun yanıtı.
 *
 * --------------------------------------------------------------------------
 * SIRA NİYE BÖYLE
 * --------------------------------------------------------------------------
 * Önceki sürüm dört eşit kartı alt alta diziyordu: tutarlılık, güç
 * standartları, hareket grafiği, rekorlar. Hiçbiri öne çıkmıyordu.
 *
 * Ekranın tek bir başlığı olmalı ve o **güç seviyesi**: vücut ağırlığına
 * göre nerede olduğun. Geri kalanı onu destekliyor. Tutarlılık ızgarası
 * ritmi, grafik eğilimi, rekorlar da kazanılmış olanı gösteriyor.
 *
 * --------------------------------------------------------------------------
 * REKORLAR ARTIK HAREKET ADIYLA
 * --------------------------------------------------------------------------
 * Liste şöyle görünüyordu:
 *
 *     En ağır set        80,0 kg
 *     En ağır set        77,5 kg
 *     Tahmini 1RM        96,0 kg
 *
 * Hangi harekete ait olduğu yazmıyordu ve aynı hareketin eski rekorları da
 * listedeydi (tablo her yeni rekoru yeni satır olarak tutuyor). Artık
 * hareket başına güncel en iyi geliyor — bir kupa rafı gibi.
 */

import { useState } from "react";
import { ConsistencyGrid } from "@/components/ConsistencyGrid";
import { ExerciseChart } from "@/components/ExerciseChart";
import { InfoTip, Page, PageHeader, Section } from "@/components/Layout";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import {
  useBestRecords,
  useConsistency,
  useExercises,
  useStrengthStandards,
  type ExerciseRecords,
} from "@/lib/queries";

/**
 * Seviyeler SIRALI, bu yüzden renkler de sıralı: soluktan güçlüye.
 *
 * Önceden "intermediate" volt, "advanced" ise ayrı bir yeşildi; açık temada
 * ikisi de metin olarak okunmuyordu (volt %90 parlaklıkta) ve aralarındaki
 * sıra da belli olmuyordu. Volt yalnızca "advanced"ta çıkıyor — kazanılmış
 * bir eşik olduğu için anlamlı.
 */
const LEVEL_COLOR: Record<string, string> = {
  untrained: "var(--color-ink-faint)",
  novice: "var(--color-ink-muted)",
  intermediate: "var(--color-ink)",
  advanced: "var(--color-accent-deep)",
  elite: "var(--color-warning)",
};

export default function ProgressPage() {
  const standards = useStrengthStandards();
  const consistency = useConsistency(365);
  const records = useBestRecords();
  const exercises = useExercises("");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader title="İlerleme" />

      {/* --- Başlık: güç seviyesi ---------------------------------------- */}
      <Section
        title="Güç standartları"
        info={
          <>
            Seviye, tahmini 1RM&apos;in vücut ağırlığına oranından çıkıyor.
            1RM <strong>Epley formülüyle tahmin</strong> ediliyor — gerçek tek
            tekrar testi değil. Oranlar cinsiyete göre ayrı tablolardan
            geliyor; aynı mutlak ağırlık farklı vücut ağırlıklarında farklı
            seviyeye denk düşüyor.
          </>
        }
      >
        {standards.isLoading ? (
          <Loading />
        ) : standards.isError ? (
          <ErrorBox error={standards.error} />
        ) : standards.data?.unavailable_reason ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            {standards.data.unavailable_reason}
          </p>
        ) : (
          <>
            {standards.data?.is_estimated && (
              <p className="mb-4 text-xs text-[var(--color-ink-faint)]">
                Vücut ağırlığı tahmini ({fmt(standards.data.bodyweight_kg, 1)} kg) —
                kilo kaydı girdiğinde kesinleşir.
              </p>
            )}
            <ul className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
              {(standards.data?.results ?? []).map((row, index) => (
                <li key={row.lift_key} className="reveal" style={{ ["--i" as string]: index }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {row.lift_label}
                    </span>
                    <span className="tnum shrink-0 text-sm">
                      {fmt(row.estimated_1rm, 1)} kg
                      <span className="ml-1.5 text-2xs text-[var(--color-ink-faint)]">
                        {fmt(row.bodyweight_ratio, 2)}× VA
                      </span>
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden bg-[var(--color-surface-raised)]">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.round(row.progress_to_next * 100)}%`,
                          background: LEVEL_COLOR[row.level] ?? "var(--color-ink)",
                          transition: "width var(--dur-long) var(--ease-out)",
                        }}
                      />
                    </div>
                    <span
                      className="shrink-0 text-2xs font-medium tracking-wide uppercase"
                      style={{ color: LEVEL_COLOR[row.level] ?? "var(--color-ink)" }}
                    >
                      {row.level_label}
                    </span>
                  </div>

                  {row.next_level_kg !== null && (
                    <p className="tnum mt-1 text-2xs text-[var(--color-ink-faint)]">
                      {/* "İleri için" değil "İleri seviye için": etiketler
                          sıfat ("Orta", "İleri") ve tek başına ek almıyor. */}
                      {row.next_level_label ?? "Bir sonraki"} seviye için{" "}
                      {fmt(row.next_level_kg, 1)} kg
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* --- Tutarlılık --------------------------------------------------- */}
      <Section
        title="Tutarlılık"
        info="Son 12 ay. Koyuluk o günkü toplam tonajı gösteriyor — antrenman yapılmayan gün boş kalıyor."
      >
        {consistency.isLoading ? (
          <Loading />
        ) : consistency.isError ? (
          <ErrorBox error={consistency.error} />
        ) : (
          <ConsistencyGrid days={consistency.data ?? []} />
        )}
      </Section>

      {/* --- Rekorlar ----------------------------------------------------- */}
      <Section
        title="Kişisel rekorlar"
        info="Hareket başına GÜNCEL en iyi. Dört tür ayrı takip ediliyor çünkü farklı şeyler ölçüyorlar: ağır tek set, dayanıklılık, toplam iş ve ikisini birleştiren tahmini 1RM."
      >
        {records.isLoading ? (
          <Loading />
        ) : records.isError ? (
          <ErrorBox error={records.error} />
        ) : (records.data ?? []).length === 0 ? (
          <Empty
            title="Henüz rekor yok"
            hint="İlk antrenmanını tamamladığında her hareket için dört tür rekor takip edilmeye başlar."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(records.data ?? []).map((row, index) => (
              <li key={row.exercise_id} className="reveal" style={{ ["--i" as string]: index }}>
                <RecordCard row={row} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --- Hareket grafiği ---------------------------------------------- */}
      <Section
        title="Hareket grafiği"
        info="Ağırlık, hacim ve tahmini 1RM'in zaman içindeki değişimi. En az iki seans gerekiyor — tek noktadan eğilim çıkmaz."
      >
        {exercises.isLoading ? (
          <Loading />
        ) : (exercises.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)]">
            Hareket kütüphanesi yüklenemedi.
          </p>
        ) : (
          <>
            <select
              value={selected ?? ""}
              onChange={(event) => setSelected(event.target.value || null)}
              aria-label="Hareket seç"
              className="field h-11 w-full max-w-[24rem] px-2.5 text-sm"
            >
              <option value="">Hareket seç…</option>
              {(exercises.data ?? []).map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>

            {selected !== null && (
              <div className="reveal mt-5">
                <ExerciseChart exerciseId={selected} />
              </div>
            )}
          </>
        )}
      </Section>
    </Page>
  );
}

/* --- Rekor kartı ---------------------------------------------------------- */

function RecordCard({ row }: { row: ExerciseRecords }) {
  return (
    <div className="card h-full px-4 py-3.5">
      <p className="truncate text-sm font-medium" title={row.name}>
        {row.name}
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {row.records.map((record) => (
          <li
            key={record.type}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="min-w-0 truncate text-[var(--color-ink-muted)]">
              {prLabel(record.type)}
            </span>
            <span className="tnum shrink-0">
              {/* "En çok tekrar" tam sayı; ağırlıklarda tek ondalık anlamlı
                  (2,5 kg'lık plakalar). */}
              {fmt(record.value, record.type === "max_reps" ? 0 : 1)}{" "}
              <span className="text-[var(--color-ink-faint)]">{prUnit(record.type)}</span>
              {record.type === "max_weight" && record.reps !== null && (
                <span className="text-[var(--color-ink-faint)]"> × {record.reps}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-[var(--color-border)] pt-2 text-2xs text-[var(--color-ink-faint)]">
        Son: {new Date(row.last_achieved_at).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
