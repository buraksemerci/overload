"use client";

/**
 * Kas Haritası.
 *
 * Soru tek: "hangi kas geride kaldı?". Ekran üç katmanda cevaplıyor:
 *
 * 1. **Bant** — denge yüzdesi ve hedefte / eksik / fazla sayıları. Açan kişi
 *    kaydırmadan durumu okuyor.
 * 2. **Sahne** — ön ve arka vücut yan yana gece zemininde; çalışılan kas
 *    yanıyor. Yanında seçili kasın ayrıntısı: kaç set, hedefin yüzde kaçı,
 *    hedefe kaç set kaldı. Seçim yokken en geride kalan kas gösteriliyor —
 *    boş bir "bir kas seç" kutusu yerine zaten sorulacak olanın cevabı.
 * 3. **Liste** — kesin sayılar, orana göre sıralı.
 *
 * --------------------------------------------------------------------------
 * LİSTE NEDEN EŞİĞE GÖRE DEĞİL SIRAYA GÖRE
 * --------------------------------------------------------------------------
 * Önceki sürümde iki ayrı bölüm vardı: "hedefin yarısının altında" ve
 * "hedefin belirgin üstünde". Eşik tabanlı bu yaklaşımın iki sorunu çıktı:
 *
 * 1. Tek seans girilmiş bir hesapta ilk liste 15 tane sıfır çipiyle doluyordu
 *    ve "bu gruplar ihmal edilmiş" diyordu. Hiç çalışılmamış bir kas ihmal
 *    edilmiş değil; sadece henüz sıra gelmemiş. Gerçek sinyal (6/12 olan
 *    gruplar) o sıfır yığınında kayboluyordu.
 *
 * 2. Eşiğin iki yanında kalan gruplar hiç görünmüyordu — kullanıcı %60'ta
 *    olan bir kası göremiyordu.
 *
 * Şimdi tek liste, orana göre artan sırada. En eksik olan en üstte; sıfırlar
 * doğal olarak orada ama "ihmal" diye etiketlenmedikleri için panik
 * yaratmıyorlar, sadece sıranın başında duruyorlar.
 */

import { useState } from "react";
import { Meter } from "@/components/Charts";
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
import { HEAT_LABELS, HeatLegend, MuscleMap, heatColor, heatStep } from "@/components/MuscleMap";
import { ErrorBox, Empty, fmt } from "@/components/States";
import { useMuscleVolume } from "@/lib/queries";
import type { MuscleVolume } from "@overload/shared-types";

const RANGES = [
  { days: 7, label: "7 gün" },
  { days: 14, label: "14 gün" },
  { days: 30, label: "30 gün" },
] as const;

/**
 * Listede varsayılan olarak gösterilen satır sayısı.
 *
 * On sekiz kas grubunun tamamı vücutta zaten görünüyor — liste kesin sayı
 * için var. İlk sekiz satır orana göre en eksik olanlar, yani eylem
 * gerektirenler; gerisi merak edildiğinde açılıyor.
 */
const VISIBLE_ROWS = 8;

const ratioOf = (muscle: MuscleVolume) => muscle.sets / Math.max(muscle.target, 1);

export default function MuscleMapPage() {
  const [days, setDays] = useState<number>(7);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const volume = useMuscleVolume(days);

  // Hedef pencereye göre ölçekleniyor: 30 günlük görünümde haftalık hedefi
  // kullanmak her kası "fazla çalışılmış" gösterirdi.
  const scale = days / 7;
  const scaled: MuscleVolume[] = (volume.data ?? []).map((row) => ({
    slug: row.slug,
    nameTr: row.name_tr,
    svgId: row.svg_id,
    region: row.region,
    sets: row.sets,
    target: Math.max(1, Math.round(row.target * scale)),
  }));

  // Orana göre artan: en eksik olan en üstte, yani eylem gerektiren önce.
  const ranked = [...scaled].sort((a, b) => ratioOf(a) - ratioOf(b));
  const onTarget = scaled.filter((m) => ratioOf(m) >= 1).length;
  const over = scaled.filter((m) => ratioOf(m) > 1.5).length;
  const lagging = scaled.length - onTarget;
  const totalSets = scaled.reduce((sum, m) => sum + m.sets, 0);
  const balance = scaled.length > 0 ? Math.round((onTarget / scaled.length) * 100) : 0;

  const hasData = scaled.some((m) => m.sets > 0);
  const focus =
    scaled.find((m) => m.svgId === selected) ?? (hasData ? ranked[0] : undefined);

  const rangeLabel = RANGES.find((r) => r.days === days)!.label;

  // Ön / arka: itme ve çekme dengesinin kaba ama okunur bir karşılığı.
  const sides = (["front", "back"] as const).map((region) => {
    const rows = scaled.filter((m) => m.region === region);
    return {
      region,
      sets: rows.reduce((sum, m) => sum + m.sets, 0),
      target: rows.reduce((sum, m) => sum + m.target, 0),
    };
  });

  return (
    <Page>
      <Hero
        photo="app-dumbbells"
        position="center 60%"
        eyebrow="Vücut"
        title="Kas haritası"
        lead={
          hasData
            ? `Son ${rangeLabel.replace(" gün", "")} günde ${scaled.length} kas grubundan ${onTarget} tanesi hedefte.`
            : `Son ${rangeLabel.replace(" gün", "")} günün kas kas set hacmi.`
        }
        info={
          <>
            Efektif set hacmi gösteriliyor. Birincil kaslar 1.0, ikincil kaslar
            0.5 set sayılıyor; tek taraflı hareketler iki katı. Hipertrofi
            literatüründe yaygın olan bu ağırlıklandırma, &ldquo;bench press
            biceps çalıştırmaz ama triceps&apos;i yarım sayar&rdquo; sezgisini
            sayısallaştırıyor. Isınma setleri sayılmıyor. Hedefler seçilen
            pencereye göre ölçekleniyor.
          </>
        }
        actions={
          <div className="seg" role="group" aria-label="Zaman aralığı">
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                aria-pressed={days === range.days}
                onClick={() => setDays(range.days)}
                className="seg-item"
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      >
        {/* Yüklenirken de aynı yükseklik: sayılar gelince bant büyümüyor. */}
        <HeroStats>
          <HeroStat label="Denge" value={volume.data ? `%${balance}` : "—"} foot="hedefteki kaslar" />
          <HeroStat label="Hedefte" value={volume.data ? onTarget : "—"} unit="kas" />
          <HeroStat label="Eksik" value={volume.data ? lagging : "—"} unit="kas" />
          <HeroStat label="Fazla" value={volume.data ? over : "—"} unit="kas" />
          <HeroStat label="Toplam" value={volume.data ? fmt(totalSets, 0) : "—"} unit="set" />
        </HeroStats>
      </Hero>

      {volume.isError ? (
        <ErrorBox error={volume.error} onRetry={() => void volume.refetch()} />
      ) : volume.isLoading ? (
        /* Sahneyle aynı yükseklikte yer tutucu: veri gelince sayfa aşağı
           itilmiyor. */
        <div aria-busy className="tile-night min-h-[38rem] animate-pulse" />
      ) : !hasData ? (
        <Empty
          title="Henüz veri yok"
          hint="İlk antrenmanını tamamladığında kas grubu bazında hacim burada görünecek."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="tile-night flex flex-col p-6 lg:col-span-7 lg:p-10">
              <MuscleMap
                night
                pair
                volumes={scaled}
                highlight={hovered ?? focus?.svgId ?? null}
                onSelect={(svgId) => setSelected((current) => (current === svgId ? null : svgId))}
              />
              <div className="mt-auto flex justify-center pt-4">
                <HeatLegend night />
              </div>
            </div>

            {focus && (
              <FocusPanel
                muscle={focus}
                picked={selected !== null}
                rangeLabel={rangeLabel}
                sides={sides}
                next={ranked.filter((m) => m.svgId !== focus.svgId && ratioOf(m) < 1).slice(0, 3)}
                onPick={setSelected}
                onClear={() => setSelected(null)}
                className="lg:col-span-5"
              />
            )}
          </div>

          <Section
            title="En eksik kaslar"
            info="Orana göre artan sırada: eylem gerektiren en üstte. Bir satıra dokununca vücutta o bölge işaretleniyor. Hiç çalışılmamış bir kas 'ihmal edilmiş' değil, sadece sıra gelmemiş — o yüzden ayrı bir uyarı etiketi yok."
          >
            <ul className="grid gap-x-12 md:grid-cols-2">
              {(showAll ? ranked : ranked.slice(0, VISIBLE_ROWS)).map((muscle) => (
                <MuscleRow
                  key={muscle.slug}
                  muscle={muscle}
                  active={muscle.svgId === focus?.svgId}
                  onHover={(on) => setHovered(on ? muscle.svgId : null)}
                  onPick={() => {
                    setSelected(muscle.svgId);
                    // Dar ekranda harita listenin üstünde kalıyor; seçimin
                    // sonucu görünsün diye ayrıntıya dönülüyor.
                    document
                      .getElementById("kas-ayrinti")
                      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                />
              ))}
            </ul>

            {ranked.length > VISIBLE_ROWS && (
              <button
                type="button"
                className="btn btn-quiet mt-4 -ml-2.5"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Kısalt" : `Kalan ${ranked.length - VISIBLE_ROWS} kas grubu`}
              </button>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}

/* --- Seçili kas -------------------------------------------------------------- */

function FocusPanel({
  muscle,
  picked,
  rangeLabel,
  sides,
  next,
  onPick,
  onClear,
  className,
}: {
  muscle: MuscleVolume;
  picked: boolean;
  rangeLabel: string;
  sides: ReadonlyArray<{ region: "front" | "back"; sets: number; target: number }>;
  /** Sıradaki eksik kaslar — ayrıntıdan ayrılmadan geçilebilsin. */
  next: MuscleVolume[];
  onPick: (svgId: string) => void;
  onClear: () => void;
  className: string;
}) {
  const ratio = ratioOf(muscle);
  const step = heatStep(muscle.sets, muscle.target);
  const missing = Math.max(muscle.target - muscle.sets, 0);
  const percent = Math.round(ratio * 100);

  const advice =
    step === 0
      ? `Son ${rangeLabel} içinde hiç set yok. Bir sonraki antrenmana ${fmt(Math.min(missing, 4), 0)} set eklemek iyi bir başlangıç.`
      : step === 4
        ? `Hedefin %${percent - 100} üstünde. Ağrı ya da performans düşüşü varsa hacmi bir süre azalt.`
        : missing > 0
          ? `Hedefe ${fmt(missing, 1)} set kaldı.`
          : "Hedef tutturuldu. Bu hacmi korumak yeterli.";

  return (
    <section
      id="kas-ayrinti"
      aria-live="polite"
      className={`card-raised flex scroll-mt-24 flex-col p-6 lg:p-10 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="label">{picked ? "Seçili kas" : "En geride kalan"}</p>
        {picked && (
          <button type="button" className="btn btn-quiet -mr-2.5" onClick={onClear}>
            Seçimi kaldır
          </button>
        )}
      </div>

      <h2 className="display mt-3 text-3xl lg:text-4xl">{muscle.nameTr}</h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
        <span
          aria-hidden
          className="inline-block size-2.5"
          style={{ background: heatColor(step, true) }}
        />
        {HEAT_LABELS[step]} · {muscle.region === "front" ? "ön" : "arka"} vücut
      </p>

      <div className="mt-10 flex items-end gap-3">
        <span className="display tnum text-[4.5rem] leading-[0.85] lg:text-[6rem]">
          {fmt(muscle.sets, 1)}
        </span>
        <span className="tnum pb-1 text-lg text-[var(--color-ink-muted)]">
          / {muscle.target} set
        </span>
      </div>

      <div className="mt-6">
        <Meter
          value={muscle.sets}
          max={muscle.target}
          tone={step === 4 ? "warning" : "accent"}
        />
        <p className="tnum mt-2 flex justify-between text-xs text-[var(--color-ink-faint)]">
          <span>Hedef oranı %{percent}</span>
          <span>{rangeLabel}</span>
        </p>
      </div>

      <p className="mt-8 text-base leading-relaxed">{advice}</p>

      {next.length > 0 && (
        <div className="mt-10">
          <p className="label">Sonra gelenler</p>
          <ul className="mt-3 flex flex-col">
            {next.map((muscle) => (
              <li key={muscle.slug}>
                <button
                  type="button"
                  onClick={() => onPick(muscle.svgId)}
                  className="group flex w-full items-baseline justify-between gap-4 border-b border-[var(--color-border)] py-2.5 text-left"
                >
                  <span className="text-sm group-hover:underline">{muscle.nameTr}</span>
                  <span className="tnum text-xs text-[var(--color-ink-faint)]">
                    %{Math.round(ratioOf(muscle) * 100)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-6 pt-10">
        {sides.map((side) => {
          const sidePercent = Math.round((side.sets / Math.max(side.target, 1)) * 100);
          return (
            <div key={side.region}>
              <p className="label">{side.region === "front" ? "Ön vücut" : "Arka vücut"}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="display tnum text-2xl">%{sidePercent}</span>
                <span className="tnum text-xs text-[var(--color-ink-faint)]">
                  {fmt(side.sets, 0)} / {side.target} set
                </span>
              </p>
              <div className="mt-2">
                <Meter value={side.sets} max={side.target} tone="neutral" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --- Liste satırı ------------------------------------------------------------- */

function MuscleRow({
  muscle,
  active,
  onHover,
  onPick,
}: {
  muscle: MuscleVolume;
  active: boolean;
  onHover: (on: boolean) => void;
  onPick: () => void;
}) {
  const ratio = ratioOf(muscle);
  // Çubuk %150'de doluyor; ötesi "fazla" ve kehribara dönüyor.
  const width = Math.min(1, ratio / 1.5) * 100;
  const step = heatStep(muscle.sets, muscle.target);

  return (
    <li className="border-b border-[var(--color-border)]">
      <button
        type="button"
        onClick={onPick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-pressed={active}
        className="flex w-full items-center gap-4 py-3.5 text-left"
      >
        <span
          className={`w-[6.75rem] shrink-0 truncate text-sm sm:w-[8.5rem] ${active ? "font-medium" : ""}`}
        >
          {muscle.nameTr}
        </span>
        <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden bg-[var(--color-surface-raised)]">
          <span
            className="block h-full"
            style={{
              width: `${width}%`,
              background: step === 3 ? "var(--color-accent-deep)" : heatColor(step, true),
            }}
          />
          {/* Hedef çizgisi: çubuk %150'de dolduğu için hedef üçte ikide. */}
          <span
            aria-hidden
            className="absolute inset-y-0 w-px"
            style={{ left: "66.67%", background: "var(--color-ink-faint)" }}
          />
        </span>
        <span className="tnum w-[4.5rem] shrink-0 text-right text-xs text-[var(--color-ink-muted)]">
          {fmt(muscle.sets, 1)} / {muscle.target}
        </span>
      </button>
    </li>
  );
}
