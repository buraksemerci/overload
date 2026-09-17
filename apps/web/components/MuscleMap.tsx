"use client";

/**
 * Kas ısı haritası — anatomik vücut üzerinde.
 *
 * --------------------------------------------------------------------------
 * GECE SAHNESİ
 * --------------------------------------------------------------------------
 * Harita kırık beyaz bir kartta açık yeşil tonlarla çiziliyordu; "çalışılmış"
 * ile "çalışılmamış" arasındaki fark, zemine yakın iki açık rengin farkıydı.
 * Koyu sahnede tersine: vücut karanlık bir heykel, çalışılan kas YANIYOR.
 * Hedefe ulaşmış kas voltla ve hafif bir ışımayla, hedefin çok üstündeki
 * kehribarla. Göz ekranı açtığı anda nerenin çalışıp nerenin sönük kaldığını
 * görüyor — lejanta bakmadan.
 *
 * Açık tema hâli (`night={false}`) gömülü küçük haritalar için duruyor.
 *
 * --------------------------------------------------------------------------
 * ÖN VE ARKA BİRLİKTE
 * --------------------------------------------------------------------------
 * `pair`: iki görünüm yan yana. Önce bir sekmeyle geçiliyordu ve sırt günü
 * yapmış biri ilk bakışta boş bir ön vücut görüyordu. Denge sorusu (ön mü
 * geride, arka mı) ancak ikisi aynı anda görününce cevaplanıyor.
 *
 * Yollar `lib/bodyPaths.ts` içinde; kaynağı ve MIT bildirimi orada ve
 * THIRD-PARTY-NOTICES.md dosyasında. `svgId` değerleri backend'deki
 * `muscle_group.svg_id` ile eşleşmek ZORUNDA (bkz. seed/data.py).
 */

import { useId, useMemo, useState } from "react";
import { BODY_BACK, BODY_FRONT, type BodyView } from "@/lib/bodyPaths";
import type { MuscleVolume } from "@overload/shared-types";

type Region = "front" | "back";

/**
 * Hacim oranını ısı basamağına çevirir.
 *
 * Eşikler keyfi değil: 0 = hiç çalışılmamış, <%50 = eksik, %50-100 = yolda,
 * %100-150 = hedef tutturulmuş, >%150 = fazla (kehribar — toparlanma riski).
 * Kırmızı BİLİNÇLİ olarak kullanılmıyor; fazla hacim bir hata değil, bir uyarı.
 */
export function heatStep(sets: number, target: number): 0 | 1 | 2 | 3 | 4 {
  if (sets <= 0) return 0;
  const ratio = sets / Math.max(target, 1);
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  if (ratio <= 1.5) return 3;
  return 4;
}

const LIGHT_HEAT = [
  "var(--color-heat-0)",
  "var(--color-heat-1)",
  "var(--color-heat-2)",
  "var(--color-heat-4)",
  "var(--color-heat-over)",
] as const;

const NIGHT_HEAT = [
  "var(--color-heat-night-0)",
  "var(--color-heat-night-1)",
  "var(--color-heat-night-2)",
  "var(--color-accent)",
  "var(--color-warning)",
] as const;

export const HEAT_LABELS = ["Çalışılmadı", "Eksik", "Yolda", "Hedefte", "Fazla"] as const;

export function heatColor(step: number, night: boolean): string {
  return (night ? NIGHT_HEAT : LIGHT_HEAT)[step]!;
}

/**
 * Ağrı ölçeği — hacimden AYRI bir renk ailesi. Hacim "iyi iş" (volt), ağrı
 * bir uyarı: sıcak kehribar tonlarında koyulaşıyor. Aynı haritada iki kavram
 * aynı renkle çizilseydi "yanan kas" hem hedefte hem ağrıyor okunurdu.
 */
export const SORENESS_LABELS = ["Yok", "Hafif", "Orta", "Belirgin", "Kısıtlayıcı"] as const;

const SORENESS_NIGHT = [
  "var(--color-heat-night-0)",
  "oklch(40% 0.06 62)",
  "oklch(54% 0.1 62)",
  "oklch(67% 0.13 62)",
  "var(--color-warning)",
] as const;

export function sorenessColor(level: number): string {
  return SORENESS_NIGHT[Math.max(0, Math.min(4, Math.round(level)))]!;
}

interface Props {
  volumes: MuscleVolume[];
  /** Üzerine gelince açıklama, tıklayınca seçim. Küçük gömülü haritada false. */
  interactive?: boolean;
  /** Dışarıdan (yandaki listeden) işaretlenen kas grubu. */
  highlight?: string | null;
  /** Koyu sahne. */
  night?: boolean;
  /** Ön ve arka yan yana. */
  pair?: boolean;
  /** Bir kas grubuna tıklandı. Seçimi kaldırmak çağıranın kararı. */
  onSelect?: (svgId: string) => void;
  /**
   * `soreness`: `sets` alanı 0-4 ağrı seviyesi, `target` kullanılmıyor.
   * Renk ailesi ve açıklama metni ona göre.
   */
  scale?: "volume" | "soreness";
  className?: string;
}

/**
 * Set sayısı — VİRGÜLLE. `toFixed(1)` her zaman nokta üretiyor ve haritanın
 * üstündeki sayı "10.0", yanındaki listede duran aynı sayı "10,0" oluyordu.
 */
export const setText = (value: number): string =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function MuscleMap({
  volumes,
  interactive = true,
  highlight,
  night = false,
  pair = false,
  onSelect,
  scale = "volume",
  className,
}: Props) {
  const describe = (volume: MuscleVolume) =>
    scale === "soreness"
      ? SORENESS_LABELS[Math.max(0, Math.min(4, Math.round(volume.sets)))]!
      : `${setText(volume.sets)} / ${volume.target} set`;
  const [region, setRegion] = useState<Region>("front");
  const [hovered, setHovered] = useState<MuscleVolume | null>(null);

  // Listede bir kasın üzerine gelindiğinde o kas hangi görünümdeyse ona geç.
  const highlightRegion = highlight
    ? BODY_BACK.regions.some((r) => r.svgId === highlight)
      ? "back"
      : "front"
    : null;
  const shown: Region = highlightRegion ?? region;

  const bySvgId = useMemo(() => {
    const map = new Map<string, MuscleVolume>();
    for (const v of volumes) map.set(v.svgId, v);
    return map;
  }, [volumes]);

  const bodies = pair
    ? ([
        ["front", BODY_FRONT],
        ["back", BODY_BACK],
      ] as const)
    : ([[shown, shown === "front" ? BODY_FRONT : BODY_BACK]] as const);

  const muted = night ? "var(--color-on-night-faint)" : "var(--color-ink-faint)";

  return (
    <div className={className}>
      {interactive && !pair && (
        <div className="seg mb-5" role="tablist" aria-label="Vücut görünümü">
          {(["front", "back"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={shown === r}
              onClick={() => setRegion(r)}
              className="seg-item"
            >
              {r === "front" ? "Ön" : "Arka"}
            </button>
          ))}
        </div>
      )}

      {/* `items-end`: arka görünümün çizimi öndekinden uzun; alta
          hizalanmayınca "Ön" ve "Arka" yazıları farklı yükseklikte kalıyordu. */}
      <div className={pair ? "grid grid-cols-2 items-end gap-2 sm:gap-6" : ""}>
        {bodies.map(([key, view]) => (
          <figure key={key} className="m-0">
            <BodySvg
              view={view}
              region={key}
              bySvgId={bySvgId}
              interactive={interactive}
              // Haritanın kendi üzerindeki imleç önce: dışarıdan gelen işaret
              // (seçili kas) imlecin gezdiği kası gölgelemesin.
              highlight={hovered?.svgId ?? highlight ?? null}
              night={night}
              onHover={setHovered}
              onSelect={onSelect}
              scale={scale}
              describe={describe}
            />
            {pair && (
              <figcaption
                className="label mt-2 text-center"
                style={{ color: muted }}
              >
                {key === "front" ? "Ön" : "Arka"}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {interactive && (
        <div className="mt-4 min-h-[2.75rem] text-center" aria-live="polite">
          {hovered ? (
            <p className="text-sm" style={{ color: night ? "var(--color-on-night)" : undefined }}>
              <span>{hovered.nameTr}</span>{" "}
              <span className="tnum" style={{ color: muted }}>
                {describe(hovered)}
              </span>
            </p>
          ) : (
            <p className="text-xs" style={{ color: muted }}>
              {scale === "soreness"
                ? "Ağrıyan bölgeye dokun — seviyesini seç."
                : "Bir kas grubuna gel ya da dokun — haftalık set hacmini gösterir."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Isı ölçeği — renk ve adıyla, tek satır. */
export function HeatLegend({ night = false }: { night?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {HEAT_LABELS.map((label, step) => (
        <li
          key={label}
          className="flex items-center gap-1.5 text-2xs"
          style={{ color: night ? "var(--color-on-night-muted)" : "var(--color-ink-muted)" }}
        >
          <span
            className="inline-block h-2.5 w-4"
            style={{
              background: heatColor(step, night),
              boxShadow: night && step === 3 ? "0 0 8px oklch(90% 0.19 118 / 0.7)" : undefined,
            }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

function BodySvg({
  view,
  region,
  bySvgId,
  interactive,
  highlight,
  night,
  onHover,
  onSelect,
  scale,
  describe,
}: {
  view: BodyView;
  region: Region;
  bySvgId: Map<string, MuscleVolume>;
  interactive: boolean;
  highlight: string | null;
  night: boolean;
  onHover: (volume: MuscleVolume | null) => void;
  onSelect?: (svgId: string) => void;
  scale: "volume" | "soreness";
  describe: (volume: MuscleVolume) => string;
}) {
  // `useId`: aynı sayfada iki harita bulunabiliyor ve kimlikler çakışırsa
  // biri diğerinin kırpmasını ya da ışımasını kullanıyor.
  const uid = useId().replace(/:/g, "");

  const stepOf = (svgId: string) => {
    const volume = bySvgId.get(svgId);
    if (!volume) return 0;
    return scale === "soreness"
      ? Math.max(0, Math.min(4, Math.round(volume.sets)))
      : heatStep(volume.sets, volume.target);
  };

  const paint = (svgId: string | null) => {
    if (svgId === null) return night ? "var(--color-silhouette)" : "var(--color-surface-raised)";
    // Veri gelmeyen bölge ile "0 set" aynı görünmeli.
    return scale === "soreness" ? sorenessColor(stepOf(svgId)) : heatColor(stepOf(svgId), night);
  };

  // Hedefteki kas gece sahnesinde hafifçe ışıyor.
  const glow = (svgId: string | null) => {
    if (!night || svgId === null) return undefined;
    if (scale === "soreness") return stepOf(svgId) === 4 ? `url(#${uid}-glow-warm)` : undefined;
    return stepOf(svgId) === 3 ? `url(#${uid}-glow)` : undefined;
  };

  const hoverProps = (svgId: string | null) => {
    if (!interactive || svgId === null) return {};
    const volume = bySvgId.get(svgId);
    if (!volume) return {};
    return {
      onMouseEnter: () => onHover(volume),
      onMouseLeave: () => onHover(null),
      onClick: onSelect ? () => onSelect(svgId) : undefined,
      className: "cursor-pointer",
      style: { transition: "opacity var(--dur-micro) var(--ease-out)" },
    };
  };

  const titleFor = (svgId: string | null) => {
    if (svgId === null) return null;
    const volume = bySvgId.get(svgId);
    if (!volume) return null;
    return <title>{`${volume.nameTr}: ${describe(volume)}`}</title>;
  };

  // İşaretleme dolguyla DEĞİL konturla: dolguyu değiştirmek ısı rengini
  // bozar, kullanıcı tam da okumak istediği veriyi kaybeder.
  const baseStroke = night ? "oklch(12% 0.01 115)" : "var(--color-border)";
  const markStroke = night ? "oklch(99% 0 0)" : "var(--color-ink)";
  const strokeFor = (svgId: string | null) =>
    svgId !== null && svgId === highlight ? markStroke : baseStroke;
  const widthFor = (svgId: string | null) => (svgId !== null && svgId === highlight ? 4 : 1.4);

  const split = view.splitDeltoid;

  return (
    <svg
      viewBox={view.viewBox}
      className="mx-auto block w-full max-w-[340px]"
      role="img"
      aria-label={`${region === "front" ? "Ön" : "Arka"} vücut ${scale === "soreness" ? "ağrı" : "kas hacmi"} haritası`}
    >
      <defs>
        {night && (
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.82  0 0 0 0 0.95  0 0 0 0 0.25  0 0 0 0.75 0"
              result="tint"
            />
            <feMerge>
              <feMergeNode in="tint" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        {night && scale === "soreness" && (
          <filter id={`${uid}-glow-warm`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.95  0 0 0 0 0.68  0 0 0 0 0.25  0 0 0 0.7 0"
              result="tint"
            />
            <feMerge>
              <feMergeNode in="tint" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        {/* Ön omuz / yan omuz bölmesi. Kaynak veride omuz tek parça; aynı
            yol iki kez çizilip dikey orta çizgiden kırpılıyor. */}
        {split?.midX.map((mid, i) => (
          <g key={i}>
            <clipPath id={`${uid}-lat-${i}`}>
              <rect x={mid - 500} y={0} width={500} height={2000} />
            </clipPath>
            <clipPath id={`${uid}-ant-${i}`}>
              <rect x={mid} y={0} width={500} height={2000} />
            </clipPath>
          </g>
        ))}
      </defs>

      {view.regions.map((reg) => (
        <g
          key={reg.svgId ?? "neutral"}
          fill={paint(reg.svgId)}
          stroke={strokeFor(reg.svgId)}
          strokeWidth={widthFor(reg.svgId)}
          filter={glow(reg.svgId)}
          {...hoverProps(reg.svgId)}
        >
          {titleFor(reg.svgId)}
          {reg.paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ))}

      {split?.paths.map((d, i) => {
        const half = i < split.paths.length / 2 ? 0 : 1;
        return (
          <g key={`delt-${i}`}>
            <g
              fill={paint("m-side-delts")}
              stroke={strokeFor("m-side-delts")}
              strokeWidth={widthFor("m-side-delts")}
              filter={glow("m-side-delts")}
              {...hoverProps("m-side-delts")}
            >
              {titleFor("m-side-delts")}
              <path d={d} clipPath={`url(#${uid}-lat-${half})`} />
            </g>
            <g
              fill={paint("m-front-delts")}
              stroke={strokeFor("m-front-delts")}
              strokeWidth={widthFor("m-front-delts")}
              filter={glow("m-front-delts")}
              {...hoverProps("m-front-delts")}
            >
              {titleFor("m-front-delts")}
              <path d={d} clipPath={`url(#${uid}-ant-${half})`} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
