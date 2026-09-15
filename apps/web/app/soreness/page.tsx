"use client";

/**
 * Ağrı Check-in — bugün ne ağrıyor.
 *
 * --------------------------------------------------------------------------
 * DOKSAN DÜĞMEDEN BİRE
 * --------------------------------------------------------------------------
 * Önceki sürüm on sekiz kas grubunun her biri için beş seviyeli bir seçici
 * çiziyordu: ekranda doksan düğme. Uygulamanın en yoğun ekranıydı ve
 * yanıtlanan soru neredeyse hiç "hepsi nasıl" olmuyor — "bugün şurası
 * ağrıyor" oluyor. Bir kişi günde bir ya da iki kas grubu işaretliyor.
 *
 * Şimdi ekranda yalnızca **bugün işaretlenenler** var. Yeni bir kas eklemek
 * tek düğme; panelde önce kas, sonra seviye seçiliyor. Hiç ağrı yoksa ekran
 * neredeyse boş — doğru cevap bu.
 *
 * --------------------------------------------------------------------------
 * SIFIR DA BİR CEVAP
 * --------------------------------------------------------------------------
 * "0 — yok" seçeneği duruyor ve kaldırılmadı: dün 3 olan bir kasın bugün
 * iyileştiğini kaydetmek, hiç kaydetmemekten farklı. Asistan bu ayrımı
 * toparlanma hızını okumak için kullanıyor.
 */

import { useState } from "react";
import { Page, PageHeader, Section } from "@/components/Layout";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Loading } from "@/components/States";
import {
  useInjuries,
  useLogSoreness,
  useMuscleGroups,
  useSoreness,
  type MuscleGroupRow,
} from "@/lib/queries";

/**
 * Seviye ölçeği.
 *
 * Renkler ısı haritasının belirteçlerini paylaşıyor — aynı kavram (kasın
 * yüklenme durumu) iki ekranda iki farklı renk skalasıyla gösterilmemeli.
 * 4 kehribar: "hareketi kısıtlıyor" bir uyarı, hata değil.
 */
const LEVELS = [
  { value: 0, label: "Yok", color: "var(--color-heat-0)" },
  { value: 1, label: "Hafif", color: "var(--color-heat-1)" },
  { value: 2, label: "Orta", color: "var(--color-heat-2)" },
  { value: 3, label: "Belirgin", color: "var(--color-heat-4)" },
  { value: 4, label: "Kısıtlayıcı", color: "var(--color-heat-over)" },
] as const;

const levelOf = (value: number) => LEVELS.find((level) => level.value === value);

export default function SorenessPage() {
  const groups = useMuscleGroups();
  const soreness = useSoreness(1);
  const injuries = useInjuries();
  const log = useLogSoreness();

  /** Panelde düzenlenen kas. `null` = panel kapalı. */
  const [picking, setPicking] = useState<MuscleGroupRow | null>(null);
  const [choosing, setChoosing] = useState(false);

  if (groups.isLoading || soreness.isLoading) return <Loading />;
  if (groups.isError)
    return <ErrorBox error={groups.error} onRetry={() => void groups.refetch()} />;

  const all = groups.data ?? [];
  const today = soreness.data ?? [];
  const byslug = new Map(today.map((row) => [row.muscle_group_slug, row.level]));
  const marked = all.filter((group) => byslug.has(group.slug));
  const active = injuries.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Ağrı"
        info={
          <>
            Asistan bu bilgiyi antrenman önerirken kullanıyor — quad&apos;lerin
            4/4 ağrıyorsa bacak gününü öne almanı önermez.{" "}
            <strong>0 ağrı yok</strong>, <strong>4 hareketi kısıtlıyor</strong>{" "}
            demek. Sıfır da bir cevap: dün ağrıyan bir kasın bugün iyileştiğini
            kaydetmek, hiç kaydetmemekten farklı.
          </>
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setChoosing(true)}>
            Ağrı işaretle
          </button>
        }
      />

      {log.isError && <ErrorBox error={log.error} />}

      {/* --- Sakatlık notu ------------------------------------------------ */}
      {active.length > 0 && (
        <section
          className="card p-5"
          style={{ borderColor: "var(--color-warning)" }}
        >
          <div className="flex items-center gap-2">
            <span className="badge badge-warning">SAKATLIK</span>
            <span className="tnum text-2xs text-[var(--color-ink-faint)]">
              {active.length} aktif
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {active.map((injury) => (
              <li key={injury.id} className="text-sm">
                <span className="font-medium">{injury.muscle_group_name}</span>
                <span className="text-[var(--color-ink-muted)]">
                  {" — "}
                  {injury.description}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs text-[var(--color-ink-faint)]">
            Bu bölgeyi birincil çalıştıran hareketler antrenman modunda uyarı
            alıyor.
          </p>
        </section>
      )}

      {/* --- Bugün ------------------------------------------------------- */}
      <Section title="Bugün">
        {marked.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)]">
            Bugün hiçbir şey işaretlemedin. Ağrı yoksa yapılacak bir şey yok.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {marked.map((group, index) => {
              const level = levelOf(byslug.get(group.slug) ?? 0);
              return (
                <li key={group.id} className="reveal" style={{ ["--i" as string]: index }}>
                  <button
                    type="button"
                    onClick={() => setPicking(group)}
                    aria-label={`${group.name_tr} seviyesini değiştir`}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                    style={{ transitionDuration: "var(--dur-micro)" }}
                  >
                    {/* Seviye rengi nokta olarak: sayıyı okumadan önce
                        şiddet görülüyor. Panelde de aynı nokta var. */}
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: level?.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {group.name_tr}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                      {level?.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <p className="text-2xs text-[var(--color-ink-faint)]">
        Sürekli ağrı, uyuşma ya da eklem ağrısı kas ağrısından farklıdır —
        bunlar için bir doktora ya da fizyoterapiste danış.
      </p>

      {/* --- Kas seçme --------------------------------------------------- */}
      {choosing && (
        <Sheet title="Hangi kas?" onClose={() => setChoosing(false)} width="28rem">
          <div className="flex flex-col gap-5">
            {(["front", "back"] as const).map((region) => {
              const inRegion = all.filter((group) => group.region === region);
              if (inRegion.length === 0) return null;
              return (
                <div key={region}>
                  <p className="label mb-2">{region === "front" ? "Ön" : "Arka"}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {inRegion.map((group) => {
                      const level = byslug.has(group.slug)
                        ? levelOf(byslug.get(group.slug)!)
                        : null;
                      return (
                        <li key={group.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setChoosing(false);
                              setPicking(group);
                            }}
                            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-raised)]"
                            style={{ transitionDuration: "var(--dur-micro)" }}
                          >
                            {level && (
                              <span
                                aria-hidden
                                className="size-2 rounded-full"
                                style={{ background: level.color }}
                              />
                            )}
                            {group.name_tr}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* --- Seviye seçme ------------------------------------------------ */}
      {picking && (
        <Sheet title={picking.name_tr} onClose={() => setPicking(null)} width="24rem">
          <div className="flex flex-col gap-2">
            {LEVELS.map((level) => {
              const selected = byslug.get(picking.slug) === level.value;
              return (
                <button
                  key={level.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={log.isPending}
                  onClick={() => {
                    log.mutate({ muscle_group_slug: picking.slug, level: level.value });
                    setPicking(null);
                  }}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors"
                  style={{
                    transitionDuration: "var(--dur-micro)",
                    borderColor: selected
                      ? "var(--color-accent-deep)"
                      : "var(--color-border)",
                    background: selected ? "var(--color-surface-raised)" : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-[var(--radius-sm)]"
                    style={{ background: level.color }}
                  />
                  <span className="flex-1 text-sm">{level.label}</span>
                  <span className="tnum text-xs text-[var(--color-ink-faint)]">
                    {level.value}
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </Page>
  );
}
