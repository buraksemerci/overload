"use client";

/**
 * Hareket Kütüphanesi — ekipmandan girip harekete inen bir kütüphane.
 *
 * --------------------------------------------------------------------------
 * NEDEN DÖRT YÜZ SATIR DEĞİL
 * --------------------------------------------------------------------------
 * Önceki sürüm kütüphanenin tamamını tek bir düz listede döküyordu: dört
 * yüzden fazla satır, her satırda ad, ekipman ve kas eşlemesi. Aramak için
 * iyi, gezinmek için kullanılamaz.
 *
 * Bu ekrana iki farklı niyetle giriliyor:
 *
 *   1. "Şu hareketi arıyorum" → arama alanı. Yazınca liste geliyor.
 *   2. "Ne yapabilirim" → ekipman kartları. Salonda ne varsa ona dokunuyor.
 *
 * Varsayılan durum ikincisi: sekiz ekipman kartı. Hiçbiri seçilmeden liste
 * hiç açılmıyor. Arama yazıldığında filtre atlanıyor ve doğrudan sonuçlar
 * geliyor — arayan kişi kategoriyle uğraşmak istemiyor.
 *
 * --------------------------------------------------------------------------
 * KAS EŞLEMESİ DETAYDA
 * --------------------------------------------------------------------------
 * Her satırda birincil ve ikincil kaslar yazılıydı; iki satırlık gürültü ve
 * gerçekten bakılan bir bilgi değil. Artık harekete dokununca açılan panelde,
 * hacme nasıl sayıldığıyla birlikte duruyor.
 */

import { useMemo, useState } from "react";
import { Page, PageHeader, Section } from "@/components/Layout";
import { Photo } from "@/components/Photo";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Empty, Loading } from "@/components/States";
import { useExercises, type ExerciseRow } from "@/lib/queries";

/** Ekipman: kod değeri, Türkçe ad ve fotoğraf yuvası. */
const EQUIPMENT = [
  { value: "barbell", label: "Barbell", photo: "equipment-barbell" },
  { value: "dumbbell", label: "Dumbbell", photo: "equipment-dumbbell" },
  { value: "machine", label: "Makine", photo: "equipment-machine" },
  { value: "plate_loaded", label: "Plate loaded", photo: "equipment-plate-loaded" },
  { value: "smith_machine", label: "Smith", photo: "equipment-machine" },
  { value: "cable", label: "Kablo", photo: "equipment-cable" },
  { value: "bodyweight", label: "Vücut ağırlığı", photo: "equipment-bodyweight" },
  { value: "kettlebell", label: "Kettlebell", photo: "equipment-kettlebell" },
  { value: "band", label: "Direnç bandı", photo: "equipment-band" },
] as const;

const equipmentLabel = (value: string): string =>
  EQUIPMENT.find((option) => option.value === value)?.label ?? value;

export default function ExercisesPage() {
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<string | null>(null);
  const [open, setOpen] = useState<ExerciseRow | null>(null);

  const searching = query.trim().length > 0;
  // Arama varken ekipman filtresi UYGULANMIYOR: "kablo" seçili olduğu
  // unutulup "squat" arandığında sonuç boş geliyordu ve sebebi görünmüyordu.
  const exercises = useExercises(query.trim(), searching ? undefined : equipment ?? undefined);

  // Kütüphanenin tamamı bir kez çekiliyor ki kartlarda sayı yazabilelim.
  const all = useExercises("", undefined);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const exercise of all.data ?? []) {
      map.set(exercise.equipment, (map.get(exercise.equipment) ?? 0) + 1);
    }
    return map;
  }, [all.data]);

  const rows = exercises.data ?? [];
  const showList = searching || equipment !== null;

  return (
    <Page>
      <PageHeader
        photo="app-dumbbells"
        position="right center"
        eyebrow="Antrenman"
        title="Hareket Kütüphanesi"
        info={
          <>
            Her hareketin kas grubu eşlemesi var: birincil ve ikincil kaslar
            ayrı işaretli. Kas haritası ve haftalık hacim dengesi bu eşlemeden
            besleniyor — yani bir hareketi yanlış eşlemek haritayı da yanıltır.
            Hacim hesabında <strong>birincil kas 1.0</strong>,{" "}
            <strong>ikincil kas 0.5</strong> set sayılıyor; tek taraflı
            hareketler iki katı.
          </>
        }
      />

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Hareket ara…"
        aria-label="Hareket ara"
        className="field h-12 w-full px-4 text-sm"
      />

      {/* --- Ekipman kartları --------------------------------------------- */}
      {!searching && (
        <Section bare>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {EQUIPMENT.map((option) => {
              const count = counts.get(option.value) ?? 0;
              if (count === 0 && !all.isLoading) return null;
              const selected = equipment === option.value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setEquipment(selected ? null : option.value)}
                    className="card block w-full overflow-hidden text-left transition-[border-color]"
                    style={{
                      transitionDuration: "var(--dur-micro)",
                      borderColor: selected ? "var(--color-accent-deep)" : undefined,
                    }}
                  >
                    <Photo slug={option.photo} ratio="3 / 2" scrim>
                      <div className="flex size-full flex-col justify-end p-3">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "oklch(99% 0 0)" }}
                        >
                          {option.label}
                        </p>
                        <p
                          className="tnum text-2xs"
                          style={{ color: "oklch(88% 0.01 115)" }}
                        >
                          {count} hareket
                        </p>
                      </div>
                    </Photo>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* --- Liste --------------------------------------------------------- */}
      {showList && (
        <Section
          bare
          title={searching ? `"${query.trim()}" için sonuçlar` : equipmentLabel(equipment!)}
          actions={
            !searching ? (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setEquipment(null)}
              >
                Kapat
              </button>
            ) : undefined
          }
        >
          {exercises.isLoading ? (
            <Loading />
          ) : exercises.isError ? (
            <ErrorBox error={exercises.error} onRetry={() => void exercises.refetch()} />
          ) : rows.length === 0 ? (
            <Empty
              title="Eşleşen hareket yok"
              hint="Aramayı daralt ya da asistandan kütüphaneye yeni bir hareket eklemesini iste — kas grubu eşlemesiyle birlikte önerir, sen onaylarsın."
            />
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((exercise, index) => (
                <li key={exercise.id} className="reveal" style={{ ["--i" as string]: index }}>
                  <button
                    type="button"
                    onClick={() => setOpen(exercise)}
                    className="card flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                    style={{ transitionDuration: "var(--dur-micro)" }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{exercise.name}</span>
                      <span className="block truncate text-2xs text-[var(--color-ink-faint)]">
                        {equipmentLabel(exercise.equipment)}
                      </span>
                    </span>
                    {exercise.is_custom && <span className="badge badge-accent">SENİN</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {open && <ExerciseSheet exercise={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

/* --- Hareket detayı ------------------------------------------------------- */

function ExerciseSheet({
  exercise,
  onClose,
}: {
  exercise: ExerciseRow;
  onClose: () => void;
}) {
  return (
    <Sheet title={exercise.name} onClose={onClose} width="28rem">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="badge">{equipmentLabel(exercise.equipment)}</span>
          {exercise.is_unilateral && <span className="badge">tek taraflı</span>}
          {exercise.is_custom && <span className="badge badge-accent">SENİN EKLEDİĞİN</span>}
        </div>

        <MuscleList
          label="Birincil kaslar"
          muscles={exercise.primary_muscles}
          note="Hacim hesabında 1.0 set sayılıyor."
          strong
        />

        {exercise.secondary_muscles.length > 0 && (
          <MuscleList
            label="İkincil kaslar"
            muscles={exercise.secondary_muscles}
            note="Hacim hesabında 0.5 set sayılıyor."
          />
        )}

        {exercise.is_unilateral && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            Tek taraflı hareket: her set iki kez yapılıyor ve hacme{" "}
            <strong>iki katı</strong> sayılıyor.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function MuscleList({
  label,
  muscles,
  note,
  strong,
}: {
  label: string;
  muscles: string[];
  note: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {muscles.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-faint)]">Eşleme yok.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {muscles.map((muscle) => (
            <li
              key={muscle}
              /* Birincil kaslar YIKAMA zeminle işaretli, volt METİNLE değil.
                 Eskiden `color: var(--color-accent)` kullanılıyordu ve kırık
                 beyaz üzerinde ~1.3:1 kontrast veriyordu — yani okunmuyordu. */
              className={`badge ${strong ? "badge-accent" : ""}`}
            >
              {muscle}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-2xs text-[var(--color-ink-faint)]">{note}</p>
    </div>
  );
}
