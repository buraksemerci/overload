"use client";

/**
 * Kas ısı haritası — anatomik vücut üzerinde.
 *
 * Önceki sürüm şematik bloklar kullanıyordu ve bu bilinçli bir tercihti:
 * "dekorasyon yok, hız ve netlik var". Ama blokların bir maliyeti vardı —
 * hangi bloğun hangi kas olduğunu çıkarmak için etikete bakmak gerekiyordu.
 * Anatomik siluet o adımı ortadan kaldırıyor: şekil kendi adını söylüyor.
 *
 * Yollar `lib/bodyPaths.ts` içinde; kaynağı ve MIT bildirimi orada ve
 * THIRD-PARTY-NOTICES.md dosyasında.
 *
 * `svgId` değerleri backend'deki `muscle_group.svg_id` ile eşleşmek ZORUNDA
 * (bkz. seed/data.py). Birini değiştiren diğerini de değiştirmeli.
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
function heatColor(sets: number, target: number): string {
  if (sets <= 0) return "var(--color-heat-0)";
  const ratio = sets / Math.max(target, 1);
  if (ratio < 0.5) return "var(--color-heat-1)";
  if (ratio < 1) return "var(--color-heat-2)";
  if (ratio <= 1.5) return "var(--color-heat-4)";
  return "var(--color-heat-over)";
}

const HEAT_STEPS: ReadonlyArray<[string, string]> = [
  ["Çalışılmadı", "var(--color-heat-0)"],
  ["Eksik", "var(--color-heat-1)"],
  ["Yolda", "var(--color-heat-2)"],
  ["Hedefte", "var(--color-heat-4)"],
  ["Fazla", "var(--color-heat-over)"],
];

interface Props {
  volumes: MuscleVolume[];
  /** Tam ekran sayfada true; küçük gömülü haritada false. */
  interactive?: boolean;
  /** Dışarıdan (yandaki listeden) işaretlenen kas grubu. */
  highlight?: string | null;
  className?: string;
}

export function MuscleMap({ volumes, interactive = true, highlight, className }: Props) {
  const [region, setRegion] = useState<Region>("front");
  const [hovered, setHovered] = useState<MuscleVolume | null>(null);

  // Listede bir kasın üzerine gelindiğinde o kas hangi görünümdeyse ona geç.
  // Aksi halde "Kanat" satırına gelen kullanıcı ön görünümde hiçbir şeyin
  // değişmediğini görüyor ve işaretlemenin çalışmadığını sanıyor.
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

  const view = shown === "front" ? BODY_FRONT : BODY_BACK;

  return (
    <div className={className}>
      {interactive && (
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

      <BodySvg
        view={view}
        region={shown}
        bySvgId={bySvgId}
        interactive={interactive}
        highlight={highlight ?? null}
        onHover={setHovered}
      />

      {interactive && (
        <>
          {/* Sabit yükseklik: üzerine gelindiğinde altındaki açıklama
              zıplamasın. */}
          <div className="mt-4 min-h-[2.75rem] text-center">
            {hovered ? (
              <p className="text-sm">
                <span>{hovered.nameTr}</span>{" "}
                <span className="tnum text-[var(--color-ink-muted)]">
                  {hovered.sets.toFixed(1)} / {hovered.target} set
                </span>
              </p>
            ) : (
              <p className="text-xs text-[var(--color-ink-faint)]">
                Bir kas grubuna gel — haftalık set hacmini gösterir.
              </p>
            )}
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {HEAT_STEPS.map(([label, color]) => (
              <li
                key={label}
                className="flex items-center gap-1.5 text-2xs text-[var(--color-ink-muted)]"
              >
                <span
                  className="inline-block size-2.5 rounded-[2px] border border-[var(--color-border)]"
                  style={{ background: color }}
                />
                {label}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function BodySvg({
  view,
  region,
  bySvgId,
  interactive,
  highlight,
  onHover,
}: {
  view: BodyView;
  region: Region;
  bySvgId: Map<string, MuscleVolume>;
  interactive: boolean;
  highlight: string | null;
  onHover: (volume: MuscleVolume | null) => void;
}) {
  // `useId`: aynı sayfada iki harita bulunabiliyor ve clipPath kimlikleri
  // çakışırsa biri diğerinin kırpmasını kullanıyor.
  const uid = useId().replace(/:/g, "");

  const paint = (svgId: string | null) => {
    if (svgId === null) return "var(--color-surface-raised)";
    const volume = bySvgId.get(svgId);
    // Veri gelmeyen bölge ile "0 set" aynı görünmeli; farklı renk vermek
    // kullanıcıya olmayan bir ayrım gösterir.
    return volume ? heatColor(volume.sets, volume.target) : "var(--color-heat-0)";
  };

  const hoverProps = (svgId: string | null) => {
    if (!interactive || svgId === null) return {};
    const volume = bySvgId.get(svgId);
    if (!volume) return {};
    return {
      onMouseEnter: () => onHover(volume),
      onMouseLeave: () => onHover(null),
      className: "cursor-pointer",
    };
  };

  const titleFor = (svgId: string | null) => {
    if (svgId === null) return null;
    const volume = bySvgId.get(svgId);
    if (!volume) return null;
    return <title>{`${volume.nameTr}: ${volume.sets.toFixed(1)} / ${volume.target} set`}</title>;
  };

  // İşaretleme dolguyla DEĞİL konturla yapılıyor: dolguyu değiştirmek ısı
  // rengini bozar, yani kullanıcı tam da okumak istediği veriyi kaybeder.
  const strokeFor = (svgId: string | null) =>
    svgId !== null && svgId === highlight ? "var(--color-ink)" : "var(--color-border)";
  const widthFor = (svgId: string | null) =>
    svgId !== null && svgId === highlight ? 3 : 1.2;

  const split = view.splitDeltoid;

  return (
    <svg
      viewBox={view.viewBox}
      className="mx-auto block w-full max-w-[340px]"
      role="img"
      aria-label={`${region === "front" ? "Ön" : "Arka"} vücut kas hacmi haritası`}
    >
      {/* Ön omuz / yan omuz bölmesi. Kaynak veride omuz tek parça; anterior ve
          lateral başı ayırmak için aynı yol iki kez çizilip dikey orta
          çizgiden kırpılıyor. Dıştaki yarı yan omuz, içteki yarı ön omuz. */}
      {split && (
        <defs>
          {split.midX.map((mid, i) => (
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
      )}

      {view.regions.map((reg) => (
        <g
          key={reg.svgId ?? "neutral"}
          fill={paint(reg.svgId)}
          stroke={strokeFor(reg.svgId)}
          strokeWidth={widthFor(reg.svgId)}
          {...hoverProps(reg.svgId)}
        >
          {titleFor(reg.svgId)}
          {reg.paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ))}

      {split?.paths.map((d, i) => {
        // Sol ve sağ omuz aynı dizide sırayla; hangi orta çizgiye ait olduğu
        // sıraya göre belirleniyor.
        const half = i < split.paths.length / 2 ? 0 : 1;
        return (
          <g key={`delt-${i}`}>
            <g
              fill={paint("m-side-delts")}
              stroke={strokeFor("m-side-delts")}
              strokeWidth={widthFor("m-side-delts")}
              {...hoverProps("m-side-delts")}
            >
              {titleFor("m-side-delts")}
              <path d={d} clipPath={`url(#${uid}-lat-${half})`} />
            </g>
            <g
              fill={paint("m-front-delts")}
              stroke={strokeFor("m-front-delts")}
              strokeWidth={widthFor("m-front-delts")}
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
