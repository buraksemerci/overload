"use client";

/**
 * Ağrı Check-in — bugün ne ağrıyor.
 *
 * --------------------------------------------------------------------------
 * VÜCUDUN ÜSTÜNDE
 * --------------------------------------------------------------------------
 * "Nerem ağrıyor" sorusu bir liste sorusu değil, bir yer sorusu. Ekranın
 * ortasında ön ve arka vücut; ağrıyan yere dokunmak doğrudan seviye panelini
 * açıyor. Adı bilinmeyen kas ("rear delt" mi "trapez" mi?) ararken listede
 * dolaşmak gerekmiyor. Liste ("Ağrı işaretle") klavye ve ekran okuyucu için
 * yerinde duruyor.
 *
 * Ağrı hacimden ayrı bir renk ailesinde: kehribar tonlarında koyulaşıyor.
 * Hacim haritasındaki volt "iyi iş", buradaki kehribar bir uyarı.
 *
 * --------------------------------------------------------------------------
 * DOKSAN DÜĞMEDEN BİRE
 * --------------------------------------------------------------------------
 * Önceki sürümlerden biri on sekiz kas grubunun her biri için beş seviyeli
 * bir seçici çiziyordu: ekranda doksan düğme. Yanıtlanan soru neredeyse hiç
 * "hepsi nasıl" olmuyor — "bugün şurası ağrıyor" oluyor.
 *
 * --------------------------------------------------------------------------
 * SIFIR DA BİR CEVAP
 * --------------------------------------------------------------------------
 * "0 — yok" seçeneği duruyor: dün 3 olan bir kasın bugün iyileştiğini
 * kaydetmek, hiç kaydetmemekten farklı. Asistan bu ayrımı toparlanma hızını
 * okumak için kullanıyor. Son yedi günün şeridi de tam bunu gösteriyor.
 */

import { useState } from "react";
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
import { MuscleMap, SORENESS_LABELS, sorenessColor } from "@/components/MuscleMap";
import { Sheet } from "@/components/Sheet";
import { ErrorBox } from "@/components/States";
import {
  useCreateInjury,
  useInjuries,
  useLogSoreness,
  useMuscleGroups,
  useResolveInjury,
  useSoreness,
  type MuscleGroupRow,
  type SorenessRow,
} from "@/lib/queries";

const LEVELS = SORENESS_LABELS.map((label, value) => ({ value, label, color: sorenessColor(value) }));

const levelOf = (value: number) => LEVELS[Math.max(0, Math.min(4, value))]!;

/** Yerel takvim günü, `YYYY-MM-DD`. `toISOString` UTC'ye çeviriyor ve gece yarısından sonra dünü veriyordu. */
const localIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function SorenessPage() {
  const groups = useMuscleGroups();
  const soreness = useSoreness(1);
  const week = useSoreness(7);
  const injuries = useInjuries();
  const log = useLogSoreness();
  const createInjury = useCreateInjury();
  const resolveInjury = useResolveInjury();

  /** Panelde düzenlenen kas. `null` = panel kapalı. */
  const [picking, setPicking] = useState<MuscleGroupRow | null>(null);
  const [choosing, setChoosing] = useState(false);
  /** Sakatlık ekleme paneli. */
  const [addingInjury, setAddingInjury] = useState(false);

  const all = groups.data ?? [];
  const today = soreness.data ?? [];
  const byslug = new Map(today.map((row) => [row.muscle_group_slug, row.level]));
  const marked = all
    .filter((group) => byslug.has(group.slug))
    .sort((a, b) => (byslug.get(b.slug) ?? 0) - (byslug.get(a.slug) ?? 0));
  const active = injuries.data ?? [];
  const sore = marked.filter((group) => (byslug.get(group.slug) ?? 0) > 0);
  const worst = sore[0];
  const ready = !groups.isLoading && !soreness.isLoading;

  // Yüklenirken de iki satırlık bir cümle: dar ekranda tek satırlık bir
  // metin veri gelince ikiye çıkıyor ve altındaki her şeyi aşağı itiyordu.
  const lead = !ready
    ? "Bugün nerede ağrı var? İşaretlemek için vücuttaki bölgeye dokun."
    : sore.length === 0
      ? "Bugün işaretli ağrı yok. Ağrıyan bir yer varsa vücutta dokun."
      : `Bugün ${sore.length} bölge işaretli; en belirgini ${worst!.name_tr.toLocaleLowerCase("tr-TR")}.`;

  return (
    <Page>
      <Hero
        photo="app-stretch"
        position="right center"
        size="md"
        eyebrow="Vücut"
        title="Ağrı"
        lead={lead}
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
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready || groups.isError}
              onClick={() => setChoosing(true)}
            >
              Ağrı işaretle
            </button>
            <button
              type="button"
              className="btn btn-on-photo"
              disabled={!ready || groups.isError}
              onClick={() => setAddingInjury(true)}
            >
              Sakatlık ekle
            </button>
          </>
        }
      >
        <HeroStats>
          <HeroStat label="Bugün" value={ready ? sore.length : "—"} unit="bölge" />
          <HeroStat label="En yüksek" value={ready ? (worst ? levelOf(byslug.get(worst.slug) ?? 0).label : "Yok") : "—"} />
          <HeroStat label="Sakatlık" value={injuries.data ? active.length : "—"} unit="aktif" />
        </HeroStats>
      </Hero>

      {groups.isError && <ErrorBox error={groups.error} onRetry={() => void groups.refetch()} />}
      {log.isError && <ErrorBox error={log.error} />}

      {/* --- Sakatlık notu ------------------------------------------------ */}
      {active.length > 0 && (
        <section className="card border-l-2 p-6" style={{ borderLeftColor: "var(--color-warning)" }}>
          <div className="flex items-center gap-2">
            <span className="badge badge-warning">SAKATLIK</span>
            <span className="tnum text-2xs text-[var(--color-ink-faint)]">{active.length} aktif</span>
          </div>
          <ul className="mt-4 flex flex-col">
            {active.map((injury) => (
              <li
                key={injury.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--color-border)] py-3 last:border-b-0"
              >
                <span className="text-base font-medium">{injury.muscle_group_name}</span>
                <span className="min-w-0 flex-1 text-sm text-[var(--color-ink-muted)]">
                  {injury.description}
                </span>
                {/* Kapatma SİLME değil: kayıt duruyor, `resolved_on` doluyor.
                    Aynı bölge tekrar ağrırsa geçmiş bir bağlam. */}
                <button
                  type="button"
                  className="btn btn-quiet shrink-0 text-sm"
                  disabled={resolveInjury.isPending}
                  onClick={() => resolveInjury.mutate(injury.id)}
                >
                  İyileşti
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs text-[var(--color-ink-faint)]">
            Bu bölgeyi birincil çalıştıran hareketler antrenman modunda uyarı alıyor.
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* --- Vücut ------------------------------------------------------ */}
        <section aria-label="Vücut üzerinde işaretle" className="tile-night flex min-h-[30rem] flex-col p-5 sm:p-6 lg:col-span-7 lg:min-h-[34rem] lg:p-10">
          {ready && !groups.isError && (
            <>
              <MuscleMap
                night
                pair
                scale="soreness"
                volumes={all.map((group) => ({
                  slug: group.slug,
                  nameTr: group.name_tr,
                  svgId: group.svg_id,
                  region: group.region,
                  sets: byslug.get(group.slug) ?? 0,
                  target: 4,
                }))}
                onSelect={(svgId) => {
                  const group = all.find((row) => row.svg_id === svgId);
                  if (group) setPicking(group);
                }}
              />
              <ul className="mt-auto flex flex-wrap justify-center gap-x-5 gap-y-2 pt-4">
                {LEVELS.map((level) => (
                  <li
                    key={level.value}
                    className="flex items-center gap-1.5 text-2xs"
                    style={{ color: "var(--color-on-night-muted)" }}
                  >
                    <span className="inline-block h-2.5 w-4" style={{ background: level.color }} />
                    {level.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* --- Bugün ------------------------------------------------------- */}
          <Section title="Bugün">
            {marked.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-faint)]">
                Bugün hiçbir şey işaretlemedin. Ağrı yoksa yapılacak bir şey yok.
              </p>
            ) : (
              <ul className="flex flex-col">
                {marked.map((group, index) => {
                  const level = levelOf(byslug.get(group.slug) ?? 0);
                  return (
                    <li key={group.id} className="reveal border-b border-[var(--color-border)] last:border-b-0" style={{ ["--i" as string]: index }}>
                      <button
                        type="button"
                        onClick={() => setPicking(group)}
                        aria-label={`${group.name_tr} seviyesini değiştir`}
                        className="flex w-full items-center gap-3 py-3 text-left"
                      >
                        {/* Seviye rengi kare olarak: sayıyı okumadan önce
                            şiddet görülüyor. Haritada ve panelde de aynı renk. */}
                        <span aria-hidden className="size-3 shrink-0" style={{ background: level.color }} />
                        <span className="min-w-0 flex-1 truncate text-base">{group.name_tr}</span>
                        <LevelDots value={level.value} />
                        <span className="w-20 shrink-0 text-right text-xs text-[var(--color-ink-muted)]">{level.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {ready && <AdviceCard level={worst ? (byslug.get(worst.slug) ?? 0) : 0} name={worst?.name_tr} />}

          {/* --- Son 7 gün ----------------------------------------------------- */}
          <Section
            title="Son 7 gün"
            info="Her satır bir kas, her kare bir gün. Boş kare o gün kayıt yok demek; soluk kare 'yok' diye kaydedilmiş. Ağrının kaç günde geçtiğini buradan okuyabilirsin."
          >
            <WeekStrip rows={week.data ?? []} />
          </Section>
        </div>
      </div>

      <p className="text-2xs text-[var(--color-ink-faint)]">
        Sürekli ağrı, uyuşma ya da eklem ağrısı kas ağrısından farklıdır — bunlar
        için bir doktora ya da fizyoterapiste danış.
      </p>

      {/* --- Sakatlık ekleme ---------------------------------------------- */}
      {addingInjury && (
        <Sheet title="Sakatlık ekle" onClose={() => setAddingInjury(false)} width="28rem">
          <InjuryForm
            groups={all}
            pending={createInjury.isPending}
            error={createInjury.isError ? createInjury.error : null}
            onSubmit={async (values) => {
              await createInjury.mutateAsync(values);
              setAddingInjury(false);
            }}
          />
        </Sheet>
      )}

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
                      const level = byslug.has(group.slug) ? levelOf(byslug.get(group.slug)!) : null;
                      return (
                        <li key={group.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setChoosing(false);
                              setPicking(group);
                            }}
                            className="flex items-center gap-1.5 border border-[var(--color-border-strong)] px-3 py-2 text-sm transition-colors hover:bg-[var(--color-surface-raised)]"
                            style={{ transitionDuration: "var(--dur-micro)" }}
                          >
                            {level && <span aria-hidden className="size-2" style={{ background: level.color }} />}
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
                  className="flex items-center gap-3 border px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{
                    transitionDuration: "var(--dur-micro)",
                    borderColor: selected ? "var(--color-ink-muted)" : "var(--color-border)",
                    background: selected ? "var(--color-surface-raised)" : undefined,
                  }}
                >
                  <span aria-hidden className="size-5 shrink-0" style={{ background: level.color }} />
                  <span className="flex-1 text-base">{level.label}</span>
                  <span className="tnum text-xs text-[var(--color-ink-faint)]">{level.value}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </Page>
  );
}

/**
 * Bugünkü en yüksek ağrıya göre tek cümle. Genel antrenman pratiği; teşhis
 * değil — sayfanın altındaki not bunu ayrıca söylüyor.
 */
const ADVICE = [
  "Ağrı yok. Programına göre devam et.",
  "Normal antrenman. Isınmayı biraz uzatmak yeterli.",
  "Antrenman yapılabilir; bu bölgede hacmi biraz azalt.",
  "Bu bölgeyi bugün ağır yükleme. Başka bir kas grubuna geç ya da hafif hareketlilik çalış.",
  "Bu bölgeyi bugün çalıştırma. Birkaç günde geçmezse bir uzmana danış.",
] as const;

function AdviceCard({ level, name }: { level: number; name?: string }) {
  return (
    <section className="card-raised border-l-2 p-6" style={{ borderLeftColor: sorenessColor(Math.max(level, 1)) }}>
      <p className="label">{name && level > 0 ? `Bugün için · ${name}` : "Bugün için"}</p>
      <p className="mt-2 text-base leading-relaxed">{ADVICE[Math.max(0, Math.min(4, level))]}</p>
    </section>
  );
}

/**
 * Sakatlık formu.
 *
 * Ağrıdan ayrı bir kayıt: hangi bölge ve NE olduğu. Açıklama zorunlu çünkü
 * "omuz" tek başına antrenman modunda işe yaramıyor — "omuz, sıkışma hissi,
 * bench press ağrıtıyor" yarın hatırlanacak olan şey.
 */
function InjuryForm({
  groups,
  pending,
  error,
  onSubmit,
}: {
  groups: MuscleGroupRow[];
  pending: boolean;
  error: unknown;
  onSubmit: (values: { muscle_group_slug: string; description: string }) => Promise<void>;
}) {
  const [slug, setSlug] = useState(groups[0]?.slug ?? "");
  const [description, setDescription] = useState("");
  const ready = slug !== "" && description.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !pending) void onSubmit({ muscle_group_slug: slug, description: description.trim() });
      }}
    >
      <label className="flex flex-col gap-2">
        <span className="label">Bölge</span>
        <select
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          className="field h-12 w-full px-3 text-base"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.slug}>
              {group.name_tr}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="label">Ne oldu?</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Örn. omuzda sıkışma hissi; bench press ağrıtıyor"
          className="field w-full px-3 py-2.5 text-base"
        />
      </label>

      <p className="text-xs text-[var(--color-ink-faint)]">
        Bu bölgeyi birincil çalıştıran hareketler antrenman modunda uyarı alıyor.
        İyileşince listeden kapatabilirsin; kayıt geçmişte kalıyor.
      </p>

      {error !== null && <ErrorBox error={error} />}

      <button type="submit" className="btn btn-primary" disabled={!ready || pending}>
        {pending ? "Kaydediliyor…" : "Sakatlığı kaydet"}
      </button>
    </form>
  );
}

/** Dört kutulu şiddet göstergesi — rengi okuyamayan için de sıra belli. */
function LevelDots({ value }: { value: number }) {
  return (
    <span aria-hidden className="flex shrink-0 gap-0.5">
      {[1, 2, 3, 4].map((step) => (
        <span
          key={step}
          className="h-3 w-1.5"
          style={{ background: step <= value ? sorenessColor(value) : "var(--color-surface-raised)" }}
        />
      ))}
    </span>
  );
}

const WEEKDAY = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function WeekStrip({ rows }: { rows: SorenessRow[] }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { iso: localIso(date), label: WEEKDAY[date.getDay()]!, today: index === 6 };
  });

  const muscles = new Map<string, { name: string; byDay: Map<string, number> }>();
  for (const row of rows) {
    const entry = muscles.get(row.muscle_group_slug) ?? { name: row.muscle_group_name, byDay: new Map() };
    entry.byDay.set(row.date, row.level);
    muscles.set(row.muscle_group_slug, entry);
  }
  const list = [...muscles.values()]
    .filter((entry) => [...entry.byDay.values()].some((level) => level > 0))
    .sort((a, b) => Math.max(...b.byDay.values()) - Math.max(...a.byDay.values()));

  if (list.length === 0) {
    return <p className="text-sm text-[var(--color-ink-faint)]">Son yedi günde ağrı kaydı yok.</p>;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,1.75rem)] items-center gap-x-1.5 gap-y-2">
      <span />
      {days.map((day) => (
        <span
          key={day.iso}
          className={`text-center text-[10px] ${day.today ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]"}`}
        >
          {day.label}
        </span>
      ))}
      {list.map((entry) => (
        <Row key={entry.name} name={entry.name} byDay={entry.byDay} days={days} />
      ))}
    </div>
  );
}

function Row({
  name,
  byDay,
  days,
}: {
  name: string;
  byDay: Map<string, number>;
  days: Array<{ iso: string; label: string; today: boolean }>;
}) {
  return (
    <>
      <span className="truncate text-sm">{name}</span>
      {days.map((day) => {
        const level = byDay.get(day.iso);
        return (
          <span
            key={day.iso}
            title={level === undefined ? `${day.label}: kayıt yok` : `${day.label}: ${SORENESS_LABELS[level]}`}
            className="h-7"
            style={{
              background: level === undefined ? "transparent" : sorenessColor(level),
              boxShadow: level === undefined ? "inset 0 0 0 1px var(--color-border)" : undefined,
            }}
          />
        );
      })}
    </>
  );
}
