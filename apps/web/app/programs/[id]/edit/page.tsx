"use client";

/**
 * Program Düzenleme (Bölüm 4.1): gün/hareket ekle-sil-sırala, satır içi düzenleme.
 *
 * Sıralama hem **sürükle-bırak** (dokunmatik ve fare, dnd-kit) hem de tutamağa
 * odaklanıp **klavye** ile yapılabiliyor. Yalnızca sürüklemeye dayanan bir
 * arayüz klavye ve ekran okuyucu kullanıcılarına kapalı olurdu.
 *
 * Kaydetme tüm ağacı tek istekte gönderiyor (`PUT /programs/{id}/days`) —
 * sürükle-bırak sonrası sıra numaralarının yarısı değişiyor ve tek tek
 * güncelleme yarı-uygulanmış sıralama riski taşıyor.
 */

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Page, PageHeader } from "@/components/Layout";
import { SortableList } from "@/components/SortableList";
import { ErrorBox, Loading } from "@/components/States";
import {
  useDeleteProgram,
  useExercises,
  useProgram,
  useReplaceProgramDays,
  useUpdateProgram,
  type ProgramDayInput,
} from "@/lib/queries";

const TECHNIQUES = [
  { value: "straight", label: "Düz set" },
  { value: "rir1", label: "RIR 1" },
  { value: "failure", label: "Failure" },
  { value: "rir1_to_failure", label: "RIR1 → Failure" },
  { value: "superset_failure", label: "Superset (failure)" },
  { value: "drop_set", label: "Drop set" },
  { value: "myo_reps", label: "Myo-reps" },
] as const;

/** İç durumda kararlı kimlik: dizin kullanmak sıralama sonrası satırları karıştırır.
 *  `interface extends` indeksli erişim tipini kabul etmiyor; kesişim kullanılıyor. */
type EditableExercise = ProgramDayInput["exercises"][number] & { uid: string };

interface EditableDay {
  uid: string;
  label: string;
  exercises: EditableExercise[];
}

let uidCounter = 0;
const nextUid = () => `row-${++uidCounter}`;

export default function ProgramEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const program = useProgram(params.id ?? null);
  const library = useExercises("");
  const save = useReplaceProgramDays();
  const rename = useUpdateProgram();
  const removeProgram = useDeleteProgram();

  const [days, setDays] = useState<EditableDay[] | null>(null);
  const [dirty, setDirty] = useState(false);
  /** Program adı — `null` iken sunucudaki ad gösteriliyor. */
  const [name, setName] = useState<string | null>(null);
  /** Silme iki adımda: program gidince günleri geri getirmenin yolu yok. */
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (program.data && days === null) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect --
         Hesap ekranındaki tohumlama ile aynı: düzenlenen ağaç sunucudan bir
         kez alınıyor, sonrası kullanıcının. Yeniden çekim, kaydedilmemiş
         düzenlemeyi silmemeli. */
      setDays(
        program.data.days.map((day) => ({
          uid: nextUid(),
          label: day.label,
          exercises: day.exercises.map((exercise) => ({
            uid: nextUid(),
            exercise_id: exercise.exercise_id,
            target_sets: exercise.target_sets,
            target_rep_min: exercise.target_rep_min,
            target_rep_max: exercise.target_rep_max,
            technique: exercise.technique,
            superset_group: exercise.superset_group,
            rest_seconds: exercise.rest_seconds,
            notes: exercise.notes,
            target_percent_1rm:
              exercise.target_percent_1rm === null
                ? null
                : Number.parseFloat(exercise.target_percent_1rm),
          })),
        })),
      );
    }
  }, [program.data, days]);

  /**
   * Seçenek listesi: kütüphane + PROGRAMIN KENDİ HAREKETLERİ.
   *
   * `/exercises` sunucuda varsayılan 50 satır döndürüyor. Programdaki bir
   * hareket o ellinin dışında kalınca `<select>`in değerine karşılık gelen
   * seçenek olmuyor ve tarayıcı listedeki BAŞKA bir hareketi gösteriyordu —
   * kullanıcıya yalan söyleyen bir alan: ekranda "Bench Press" yazarken
   * kayıtlı hareket bambaşkaydı.
   *
   * Program detayı her hareketin adını zaten taşıyor; eksik olanlar oradan
   * tamamlanıyor.
   */
  const options = useMemo(() => {
    const byId = new Map<string, string>();
    for (const day of program.data?.days ?? []) {
      for (const exercise of day.exercises) {
        // Adsız satır listeye GİRMİYOR: sıralama karşılaştırıcısı `undefined`
        // görünce patlıyor ve tek bir eksik alan bütün ekranı düşürüyor.
        if (exercise.exercise_name)
          byId.set(exercise.exercise_id, exercise.exercise_name);
      }
    }
    for (const row of library.data ?? []) byId.set(row.id, row.name);
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [program.data, library.data]);

  // Bant veri beklemiyor: yüklenirken, hata verirken de aynı yerden açılıyor
  // ve üstteki saydam başlık hiçbir durumda içeriğin üstüne binmiyor.
  const hero = (
    <PageHeader
      photo="app-gym-wide"
      size="sm"
      eyebrow="Programı düzenle"
      title={program.data?.name ?? "Program"}
      lead="Sıralamak için tutamağı sürükle ya da tutamağa odaklanıp boşluk + ok tuşlarını kullan."
    />
  );

  // Hata önce: hata olunca `days` hiç dolmuyor ve eski sırayla ekran sonsuza
  // dek "yükleniyor" gösteriyordu.
  if (program.isError)
    return (
      <Page>
        {hero}
        <ErrorBox error={program.error} onRetry={() => void program.refetch()} />
      </Page>
    );
  if (program.isLoading || days === null)
    return (
      <Page>
        {hero}
        <Loading />
      </Page>
    );

  if (program.data?.is_template) {
    return (
      <Page>
        {hero}
        <div className="card p-6">
          <p className="text-sm">
            Şablon programlar düzenlenemez. Önce kendi kopyanı çıkar — Programlar
            ekranındaki &ldquo;Başlat&rdquo; butonu bunu yapıyor.
          </p>
        </div>
      </Page>
    );
  }

  const edit = (mutate: (next: EditableDay[]) => void) => {
    const next = structuredClone(days);
    mutate(next);
    setDays(next);
    setDirty(true);
  };

  const programName = name ?? program.data?.name ?? "";
  const nameChanged = programName.trim().length > 0 && programName !== program.data?.name;

  const firstExerciseId = library.data?.[0]?.id;

  const emptyDay = days.some((day) => day.exercises.length === 0);

  return (
    <Page>
      {hero}

      {/* Programın ADI — gün listesinden önce, çünkü bir programda ilk
          değiştirilen şey genelde bu. Kaydetme ayrı: gün ağacını kaydeden
          tek istek (`PUT .../days`) adı taşımıyor. */}
      <section className="card flex flex-wrap items-end gap-3 p-6">
        <label className="min-w-[14rem] flex-1">
          <span className="label mb-1.5 block">Program adı</span>
          <input
            value={programName}
            onChange={(event) => setName(event.target.value)}
            aria-label="Program adı"
            className="field h-12 w-full px-3 text-base"
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!nameChanged || rename.isPending}
          onClick={() =>
            rename.mutate(
              { id: params.id, name: programName.trim() },
              { onSuccess: () => setName(null) },
            )
          }
        >
          {/* "Kaydet" DEĞİL: gün ağacını kaydeden düğme de o adı taşıyor ve
              iki "Kaydet" yan yana hangisinin neyi kaydettiğini belirsiz
              bırakıyordu. */}
          {rename.isPending ? "Güncelleniyor…" : "Adı güncelle"}
        </button>
        {rename.isError && (
          <div className="w-full">
            <ErrorBox error={rename.error} />
          </div>
        )}
      </section>

      <SortableList
        items={days}
        getId={(day) => day.uid}
        onReorder={(reordered) => {
          setDays(reordered);
          setDirty(true);
        }}
        renderItem={(day, dayIndex) => (
          <section className="card mb-3 p-4">
            <div className="flex items-center gap-2">
              <input
                value={day.label}
                aria-label={`${dayIndex + 1}. günün adı`}
                onChange={(e) =>
                  edit((next) => void (next[dayIndex]!.label = e.target.value))
                }
                className="field h-11 min-w-0 flex-1 px-3 text-sm font-medium"
              />
              <button
                disabled={days.length <= 1}
                onClick={() => edit((next) => void next.splice(dayIndex, 1))}
                aria-label={`${day.label} gününü sil`}
                className="grid size-11 shrink-0 place-items-center border border-[var(--color-border-strong)] text-[var(--color-ink-faint)] hover:text-[var(--color-danger)] disabled:opacity-30"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <SortableList
                items={day.exercises}
                getId={(exercise) => exercise.uid}
                onReorder={(reordered) =>
                  edit((next) => void (next[dayIndex]!.exercises = reordered))
                }
                renderItem={(exercise, exerciseIndex) => (
                  /* Kutu içinde kutu yerine hafif bir yüzey: gün zaten bir
                     kart, hareket satırının ikinci bir çerçeveye ihtiyacı yok. */
                  <div className="mb-2 bg-[var(--color-surface-raised)] p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={exercise.exercise_id}
                        onChange={(e) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[
                                exerciseIndex
                              ]!.exercise_id = e.target.value),
                          )
                        }
                        aria-label={`${exerciseIndex + 1}. hareket`}
                        className="field h-10 min-w-0 flex-1 px-2 text-sm"
                      >
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          edit(
                            (next) =>
                              void next[dayIndex]!.exercises.splice(
                                exerciseIndex,
                                1,
                              ),
                          )
                        }
                        aria-label="Hareketi sil"
                        className="grid size-10 shrink-0 place-items-center border border-[var(--color-border-strong)] text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-danger)]"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <NumField
                        label="Set"
                        value={exercise.target_sets}
                        onChange={(v) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[
                                exerciseIndex
                              ]!.target_sets = v),
                          )
                        }
                      />
                      <NumField
                        label="Min"
                        name="Min tekrar"
                        value={exercise.target_rep_min}
                        onChange={(v) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[
                                exerciseIndex
                              ]!.target_rep_min = v),
                          )
                        }
                      />
                      <NumField
                        label="Maks"
                        name="Maks tekrar"
                        value={exercise.target_rep_max}
                        onChange={(v) =>
                          edit(
                            (next) =>
                              void (next[dayIndex]!.exercises[
                                exerciseIndex
                              ]!.target_rep_max = v),
                          )
                        }
                      />
                      <label className="min-w-[7rem] flex-1">
                        <span className="label mb-1 block">Teknik</span>
                        <select
                          value={exercise.technique}
                          onChange={(e) =>
                            edit(
                              (next) =>
                                void (next[dayIndex]!.exercises[
                                  exerciseIndex
                                ]!.technique = e.target.value),
                            )
                          }
                          className="h-10 w-full border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-1.5 text-xs outline-none"
                        >
                          {TECHNIQUES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="w-20">
                        <span className="label mb-1 block">Superset</span>
                        <input
                          inputMode="numeric"
                          value={exercise.superset_group ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const parsed =
                              raw === "" ? null : Number.parseInt(raw, 10);
                            edit(
                              (next) =>
                                void (next[dayIndex]!.exercises[
                                  exerciseIndex
                                ]!.superset_group = Number.isFinite(
                                  parsed as number,
                                )
                                  ? (parsed as number)
                                  : null),
                            );
                          }}
                          className="tnum h-10 w-full border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-1.5 text-center text-xs outline-none"
                        />
                      </label>
                    </div>
                  </div>
                )}
              />

              <button
                className="btn btn-ghost w-full"
                disabled={!firstExerciseId}
                onClick={() =>
                  edit((next) =>
                    next[dayIndex]!.exercises.push({
                      uid: nextUid(),
                      exercise_id: firstExerciseId!,
                      target_sets: 3,
                      target_rep_min: 8,
                      target_rep_max: 12,
                      technique: "rir1",
                      superset_group: null,
                      rest_seconds: null,
                      notes: null,
                      target_percent_1rm: null,
                    }),
                  )
                }
              >
                + Hareket ekle
              </button>
            </div>
          </section>
        )}
      />

      <button
        className="btn btn-ghost w-full"
        disabled={days.length >= 7}
        onClick={() =>
          edit((next) =>
            next.push({
              uid: nextUid(),
              label: `Gün ${next.length + 1}`,
              exercises: [],
            }),
          )
        }
      >
        + Gün ekle
      </button>

      {/* Kaydet çubuğu kendi yüzeyinde duruyor. Zeminsizken sayfanın üstünden
          kayarken altındaki gün kartlarının yazısı düğmelerin arasından
          görünüyordu. Devre dışı bırakma SEBEBİ de burada: uyarıyı sayfanın
          en altına koymak, düğmenin neden basılamadığını ekranın başka bir
          yerinde aratıyordu. */}
      <div className="card-raised sticky bottom-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        {emptyDay ? (
          <p className="text-xs" style={{ color: "var(--color-warning)" }}>
            Hareketi olmayan gün kaydedilemez — ya hareket ekle ya da günü sil.
          </p>
        ) : (
          <p className="text-xs text-[var(--color-ink-faint)]">
            {dirty ? "Kaydedilmemiş değişiklik var" : "Değişiklik yok"}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={!dirty || save.isPending || emptyDay}
            onClick={async () => {
              await save.mutateAsync({
                programId: params.id,
                // `uid` yalnızca istemci tarafı sıralama kimliği; API'ye gitmiyor.
                days: days.map(({ label, exercises }) => ({
                  label,
                  exercises: exercises.map(({ uid: _uid, ...rest }) => rest),
                })),
              });
              setDirty(false);
              router.push("/programs");
            }}
          >
            {save.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => router.push("/programs")}
          >
            Vazgeç
          </button>
        </div>
      </div>

      {save.isError && <ErrorBox error={save.error} />}
      {/* --- Programı sil --------------------------------------------------
          Geçmiş seanslar SİLİNMİYOR; silinen şey plan. Uç nokta baştan vardı
          ama arayüzde yolu yoktu ve denenen her şablon listede birikiyordu. */}
      <section className="card p-6">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="w-full text-sm text-[var(--color-ink-muted)]">
              Bu program ve günleri silinir. Yapılmış antrenmanlar geçmişte kalır.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
              disabled={removeProgram.isPending}
              onClick={() =>
                removeProgram.mutate(params.id, { onSuccess: () => router.replace("/programs") })
              }
            >
              {removeProgram.isPending ? "Siliniyor…" : "Evet, programı sil"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
              Vazgeç
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-quiet -ml-2.5"
            onClick={() => setConfirmDelete(true)}
          >
            Programı sil
          </button>
        )}
        {removeProgram.isError && (
          <div className="mt-3">
            <ErrorBox error={removeProgram.error} />
          </div>
        )}
      </section>

    </Page>
  );
}

/**
 * Dar sayı alanı.
 *
 * `label` GÖRÜNEN metin ve kısa: 4rem genişliğinde bir sütunda "Maks tekrar"
 * iki satıra kırılıyor ve satır yüksekliğini bozuyordu. `name` ekran
 * okuyucunun duyduğu ad — görünen metni İÇERİYOR, yoksa sesli adla ekrandaki
 * ad birbirini tutmaz (WCAG 2.5.3).
 */
function NumField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  /** Ekran okuyucunun okuduğu ad. Verilmezse görünen metin kullanılıyor. */
  name?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="w-16">
      <span className="label mb-1 block">{label}</span>
      <input
        aria-label={name ?? label}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          // NaN'ı state'e yazmak alanı kilitliyor; geçersiz girdide değeri koru.
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="tnum h-10 w-full border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-1.5 text-center text-xs outline-none"
      />
    </label>
  );
}
