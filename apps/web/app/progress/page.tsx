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
 * göre nerede olduğun. Bant onu tek kelimeyle söylüyor (ortanca seviye),
 * hemen altındaki gece karosu hareket hareket açıyor. Geri kalanı onu
 * destekliyor: rekorlar kazanılmış olanı, tutarlılık ritmi, grafik eğilimi.
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
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import {
  useBestRecords,
  useConsistency,
  useExercises,
  useStrengthStandards,
  type ExerciseRecords,
  type StrengthStandard,
} from "@/lib/queries";
import { STRENGTH_LEVELS, consistencySummary, levelIndex, strengthSummary } from "@/lib/stats";

export default function ProgressPage() {
  const standards = useStrengthStandards();
  const consistency = useConsistency(365);
  const records = useBestRecords();
  const exercises = useExercises("");
  const [selected, setSelected] = useState<string | null>(null);

  const results = standards.data?.results ?? [];
  const strength = strengthSummary(results);
  const rhythm = consistencySummary(consistency.data ?? []);
  const shelf = records.data ?? [];

  const lead = strength.level
    ? strength.closest
      ? `Temel kaldırışlarda seviyen ${strength.level.label}. ${strength.closest.next_level_label} seviyeye en yakın hareket: ${strength.closest.lift_label}.`
      : `Temel kaldırışlarda seviyen ${strength.level.label}.`
    : "Güç seviyen, rekorların ve antrenman ritmin.";

  // Grafik için kısayol: rekoru olan hareketler. Yüzlerce satırlık seçiciyi
  // açmadan en sık bakılan hareketlere tek dokunuşla geçiliyor.
  const shortcuts = shelf.slice(0, 6);

  return (
    <Page>
      <Hero photo="app-plates" size="lg" eyebrow="Vücut" title="İlerleme" lead={lead}>
        <HeroStats>
          <HeroStat
            label="Güç seviyesi"
            value={strength.level?.label ?? "—"}
            foot={results.length > 0 ? `${results.length} temel harekette` : undefined}
          />
          <HeroStat
            label="En güçlü"
            value={strength.strongest ? fmt(strength.strongest.bodyweight_ratio, 2) : "—"}
            unit={strength.strongest ? "× VA" : undefined}
            foot={strength.strongest?.lift_label}
          />
          <HeroStat label="Rekor" value={records.data ? shelf.length : "—"} unit="hareket" />
          <HeroStat
            label="Seri"
            value={consistency.data ? rhythm.weekStreak : "—"}
            unit="hafta"
            foot="üst üste antrenman"
          />
          <HeroStat
            label="12 ay"
            value={consistency.data ? rhythm.sessions : "—"}
            unit="antrenman"
          />
        </HeroStats>
      </Hero>

      {/* --- Başlık: güç seviyesi ---------------------------------------- */}
      <Section
        night
        title="Güç standartları"
        info={
          <>
            Seviye, tahmini 1RM&apos;in vücut ağırlığına oranından çıkıyor. 1RM{" "}
            <strong>Epley formülüyle tahmin</strong> ediliyor — gerçek tek
            tekrar testi değil. Oranlar cinsiyete göre ayrı tablolardan geliyor;
            aynı mutlak ağırlık farklı vücut ağırlıklarında farklı seviyeye denk
            düşüyor.
          </>
        }
      >
        {standards.isLoading ? (
          <div aria-busy className="min-h-[18rem]" />
        ) : standards.isError ? (
          <ErrorBox error={standards.error} />
        ) : standards.data?.unavailable_reason ? (
          <p className="text-base" style={{ color: "var(--color-on-night-muted)" }}>
            {standards.data.unavailable_reason}
          </p>
        ) : (
          <>
            {standards.data?.is_estimated && (
              <p className="-mt-2 mb-6 text-sm" style={{ color: "var(--color-on-night-faint)" }}>
                Vücut ağırlığı tahmini ({fmt(standards.data.bodyweight_kg, 1)} kg) — kilo
                kaydı girdiğinde kesinleşir.
              </p>
            )}
            {/* Ayrı kenarlıklı hücreler: çizgiyi ızgaranın zemininden
                boyamak, satır dolmayınca boş hücreyi gri bir blok olarak
                bırakıyordu. */}
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((row, index) => (
                <li
                  key={row.lift_key}
                  className="reveal border p-6 lg:p-7"
                  style={{ ["--i" as string]: index, borderColor: "var(--color-night-line)" }}
                >
                  <LiftCard row={row} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* --- Rekorlar -----------------------------------------------------
          Boşken BAŞLIK ŞERİDİ YOK: fotoğraflı davet kendi başına bir kart ve
          üstüne bir başlık kartı daha koymak onu ikinci kez çerçeveliyordu.
          Dolu hâlde başlık geri geliyor — o zaman altında sıralanacak bir
          liste var. */}
      {shelf.length === 0 && !records.isLoading && !records.isError ? (
        <Empty
          photo="app-chalk"
          title="Henüz rekor yok"
          hint="İlk antrenmanını tamamladığında her hareket için dört tür rekor takip edilmeye başlar."
        />
      ) : (
        <Section
          bare
          title="Kişisel rekorlar"
          info="Hareket başına GÜNCEL en iyi. Dört tür ayrı takip ediliyor çünkü farklı şeyler ölçüyorlar: ağır tek set, dayanıklılık, toplam iş ve ikisini birleştiren tahmini 1RM."
        >
          {records.isLoading ? (
            <Loading />
          ) : records.isError ? (
            <ErrorBox error={records.error} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shelf.map((row) => (
                <li key={row.exercise_id} className="rise">
                  <RecordCard row={row} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* --- Tutarlılık --------------------------------------------------- */}
      <Section
        title="Tutarlılık"
        info="Son 12 ay. Koyuluk o günkü toplam tonajı gösteriyor — antrenman yapılmayan gün boş kalıyor. Seri, en az bir antrenman yapılan ardışık haftaları sayıyor; bu hafta henüz antrenman yoksa seri bozulmuyor."
      >
        {consistency.isLoading ? (
          <div aria-busy className="min-h-[10rem]" />
        ) : consistency.isError ? (
          <ErrorBox error={consistency.error} />
        ) : (consistency.data ?? []).length === 0 ? (
          /* Izgara veri yokken kendini ÇİZMİYOR ve kart yalnızca başlıktan
             ibaret kalıyordu — ekranda ne olduğu belirsiz boş bir kutu. */
          <p className="text-sm text-[var(--color-ink-faint)]">
            Son 12 ayda tamamlanmış antrenman yok. İlk seansından sonra burası
            dolmaya başlıyor.
          </p>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[14rem_minmax(0,1fr)] xl:items-center">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:grid-cols-1">
              <Figure label="Antrenman günü" value={fmt(rhythm.trainingDays, 0)} />
              <Figure label="Haftada" value={fmt(rhythm.perWeek, 1)} unit="antrenman" foot="son 12 hafta" />
              <Figure label="En uzun seri" value={fmt(rhythm.longestWeekStreak, 0)} unit="hafta" />
            </dl>
            <div className="min-w-0">
              <ConsistencyGrid days={consistency.data ?? []} cell={16} className="w-fit max-w-full" />
            </div>
          </div>
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
          <p className="text-sm text-[var(--color-ink-faint)]">Hareket kütüphanesi yüklenemedi.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selected ?? ""}
                onChange={(event) => setSelected(event.target.value || null)}
                aria-label="Hareket seç"
                className="field h-11 w-full max-w-[22rem] px-2.5 text-sm"
              >
                <option value="">Hareket seç…</option>
                {(exercises.data ?? []).map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
              {shortcuts.length > 0 && (
                <div role="group" aria-label="Rekoru olan hareketler" className="flex flex-wrap gap-2">
                  {shortcuts.map((row) => (
                    <button
                      key={row.exercise_id}
                      type="button"
                      aria-pressed={selected === row.exercise_id}
                      onClick={() => setSelected(row.exercise_id)}
                      className="seg-item h-11 border border-[var(--color-border)] px-4 text-sm"
                    >
                      {row.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected !== null ? (
              <div className="reveal mt-6">
                <ExerciseChart exerciseId={selected} />
              </div>
            ) : (
              <p className="mt-6 text-sm text-[var(--color-ink-faint)]">
                Bir hareket seç — en ağır set, tahmini 1RM ve seans hacmi zaman içinde çizilir.
              </p>
            )}
          </>
        )}
      </Section>
    </Page>
  );
}

/* --- Hareket başına güç kartı ------------------------------------------------ */

/**
 * Beş basamaklı merdiven. Geçilen basamaklar dolu, bulunulan basamak bir
 * sonrakine ilerleme oranında dolu, kalanlar boş. Volt yalnızca İleri ve
 * Elit'te: kazanılmış bir eşik olduğu için anlamlı; alt basamaklar kırık
 * beyaz.
 */
function LiftCard({ row }: { row: StrengthStandard }) {
  const current = levelIndex(row.level);
  const earned = current >= 3;

  return (
    <div>
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-base font-medium" style={{ color: "var(--color-on-night)" }}>
          {row.lift_label}
        </span>
        <span
          className="label"
          style={{ color: earned ? "var(--color-accent)" : "var(--color-on-night-muted)" }}
        >
          {row.level_label}
        </span>
      </p>

      <p className="mt-4 flex items-baseline gap-2">
        <span
          className="display tnum text-[3.25rem] leading-none lg:text-[4rem]"
          style={{ color: "var(--color-on-night)" }}
        >
          {fmt(row.estimated_1rm, 1)}
        </span>
        <span className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
          kg
        </span>
        <span className="tnum ml-auto text-sm" style={{ color: "var(--color-on-night-faint)" }}>
          {fmt(row.bodyweight_ratio, 2)}× VA
        </span>
      </p>

      <div className="mt-5 grid grid-cols-5 gap-1" aria-hidden>
        {STRENGTH_LEVELS.map((level, index) => {
          const fill = index < current ? 1 : index === current ? Math.max(row.progress_to_next, 0.04) : 0;
          return (
            <span key={level.key} className="h-1.5 overflow-hidden" style={{ background: "oklch(99% 0 0 / 0.1)" }}>
              <span
                className="block h-full"
                style={{
                  width: `${fill * 100}%`,
                  background: index >= 3 && fill > 0 ? "var(--color-accent)" : "oklch(99% 0 0 / 0.72)",
                  transition: "width var(--dur-long) var(--ease-out)",
                }}
              />
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1 text-[10px]" aria-hidden>
        {STRENGTH_LEVELS.map((level, index) => (
          <span
            key={level.key}
            className="truncate"
            style={{
              color: index === current ? "var(--color-on-night)" : "var(--color-on-night-faint)",
            }}
          >
            {level.label}
          </span>
        ))}
      </div>

      <p className="tnum mt-4 min-h-[1.25rem] text-sm" style={{ color: "var(--color-on-night-muted)" }}>
        {row.next_level_kg !== null ? (
          <>
            {/* "İleri için" değil "İleri seviye için": etiketler sıfat ("Orta",
                "İleri") ve tek başına ek almıyor. */}
            {row.next_level_label ?? "Bir sonraki"} seviye için {fmt(row.next_level_kg, 1)} kg
          </>
        ) : (
          "En üst seviye"
        )}
      </p>
    </div>
  );
}

/* --- Küçük sayı ---------------------------------------------------------------- */

function Figure({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: string;
  unit?: string;
  foot?: string;
}) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1">
        <span className="display tnum text-3xl">{value}</span>
        {unit && <span className="ml-1.5 text-xs text-[var(--color-ink-muted)]">{unit}</span>}
        {foot && <span className="block text-2xs text-[var(--color-ink-faint)]">{foot}</span>}
      </dd>
    </div>
  );
}

/* --- Rekor kartı ---------------------------------------------------------- */

/**
 * Kartın başında TEK büyük sayı: tahmini 1RM, yoksa en ağır set. Altında
 * dört türün tamamı. Büyük sayının yanında tür adı tekrar YAZILMIYOR — aynı
 * etiket kartta iki kez geçince liste satırıyla karışıyordu.
 */
function RecordCard({ row }: { row: ExerciseRecords }) {
  const headline =
    row.records.find((record) => record.type === "estimated_1rm") ??
    row.records.find((record) => record.type === "max_weight") ??
    row.records[0];

  return (
    <div className="card lift flex h-full flex-col p-6">
      <p className="label">
        {new Date(row.last_achieved_at).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
      <p className="display mt-2 truncate text-lg" title={row.name}>
        {row.name}
      </p>

      {headline && (
        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="display tnum text-5xl leading-none">
            {fmt(headline.value, headline.type === "max_reps" ? 0 : 1)}
          </span>
          <span className="text-sm text-[var(--color-ink-muted)]">
            {headline.type === "estimated_1rm" ? "kg · 1RM" : prUnit(headline.type)}
          </span>
        </p>
      )}

      <ul className="mt-5 flex flex-col border-t border-[var(--color-border)] pt-3">
        {row.records.map((record) => (
          <li key={record.type} className="flex items-baseline justify-between gap-3 py-1 text-sm">
            <span className="min-w-0 truncate text-[var(--color-ink-muted)]">{prLabel(record.type)}</span>
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
    </div>
  );
}
