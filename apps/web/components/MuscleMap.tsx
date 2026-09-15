"use client";

/**
 * Kas ısı haritası (Bölüm 4.1).
 *
 * Şematik bir vücut kullanıyor, anatomik çizim değil. Gerekçe tasarım dilinin
 * kendisi: "dekorasyon yok, hız ve netlik var". Detaylı bir anatomi çizimi
 * telefonda 200px genişlikte okunmaz hâle gelir ve dosya boyutunu şişirir;
 * şematik bloklar hangi bölgenin ne kadar çalıştığını bir bakışta gösterir.
 *
 * `svgId` değerleri backend'deki `muscle_group.svg_id` ile eşleşmek ZORUNDA
 * (bkz. seed/data.py). Birini değiştiren diğerini de değiştirmeli.
 */

import { useMemo, useState } from "react";
import type { MuscleVolume } from "@overload/shared-types";

type Region = "front" | "back";

interface Shape {
  svgId: string;
  /** Simetrik kaslar için ayna: verilen şekil bir de x ekseninde yansıtılır. */
  mirror?: boolean;
  d: string;
}

/** viewBox 0 0 200 420 — sol yarıda çizilir, mirror ile sağa yansıtılır. */
const FRONT_SHAPES: Shape[] = [
  { svgId: "m-front-delts", mirror: true, d: "M62 96 q-14 2 -18 16 q-2 12 4 18 l16 -6 q-4 -16 -2 -28 Z" },
  { svgId: "m-side-delts", mirror: true, d: "M44 112 q-10 6 -10 20 q0 12 6 18 l12 -8 q-8 -14 -8 -30 Z" },
  { svgId: "m-chest", mirror: true, d: "M66 98 q22 -4 32 2 l0 42 q-20 8 -36 0 q-4 -24 4 -44 Z" },
  { svgId: "m-biceps", mirror: true, d: "M40 152 q-10 8 -10 30 q0 20 6 30 l14 -6 q-8 -26 -4 -52 Z" },
  { svgId: "m-forearms", mirror: true, d: "M34 216 q-8 14 -6 38 q2 22 8 30 l14 -6 q-10 -32 -4 -60 Z" },
  { svgId: "m-abs", mirror: true, d: "M76 146 l22 0 l0 66 q-14 6 -26 0 q0 -36 4 -66 Z" },
  { svgId: "m-obliques", mirror: true, d: "M62 150 q-8 24 -4 58 l14 4 q-4 -32 -2 -62 Z" },
  { svgId: "m-quads", mirror: true, d: "M64 222 q-8 34 -4 74 q2 20 10 26 l24 -4 q4 -50 2 -96 Z" },
  { svgId: "m-adductors", mirror: true, d: "M86 226 q-6 30 -4 54 l12 2 q2 -30 2 -56 Z" },
];

const BACK_SHAPES: Shape[] = [
  { svgId: "m-traps", mirror: true, d: "M78 84 q14 -6 22 -2 l0 40 q-18 6 -30 -2 q2 -22 8 -36 Z" },
  { svgId: "m-rear-delts", mirror: true, d: "M58 98 q-16 4 -20 18 q-2 12 4 18 l16 -6 q-4 -16 0 -30 Z" },
  { svgId: "m-lats", mirror: true, d: "M62 124 q-6 26 0 52 l36 6 l0 -62 q-20 -4 -36 4 Z" },
  { svgId: "m-mid-back", mirror: true, d: "M80 122 l20 0 l0 48 l-22 -2 q-2 -24 2 -46 Z" },
  { svgId: "m-lower-back", mirror: true, d: "M80 176 l20 0 l0 34 q-14 4 -24 -2 q0 -18 4 -32 Z" },
  { svgId: "m-triceps", mirror: true, d: "M38 150 q-10 10 -10 32 q0 20 6 28 l14 -6 q-8 -26 -4 -54 Z" },
  { svgId: "m-forearms", mirror: true, d: "M32 214 q-8 14 -6 38 q2 22 8 30 l14 -6 q-10 -32 -4 -60 Z" },
  { svgId: "m-glutes", mirror: true, d: "M68 212 q-6 20 0 34 q12 10 30 6 l0 -44 q-18 -4 -30 4 Z" },
  { svgId: "m-hamstrings", mirror: true, d: "M68 254 q-6 32 -2 62 q2 14 8 18 l24 -4 q2 -42 0 -80 Z" },
  { svgId: "m-calves", mirror: true, d: "M72 340 q-6 24 -2 46 q2 12 8 14 l18 -4 q2 -32 -2 -58 Z" },
];

/** Vücut silueti — kasların altında duran nötr taban. */
const SILHOUETTE =
  "M100 56 q-16 0 -20 16 q-4 14 4 22 q-22 4 -34 20 q-10 14 -14 40 q-6 34 -10 62 " +
  "q-2 14 8 16 q10 2 14 -10 l8 -34 l0 44 q-4 30 0 56 q4 30 10 66 q4 20 14 20 " +
  "q10 0 10 -18 l4 -58 l4 58 q0 18 10 18 q10 0 14 -20 q6 -36 10 -66 q4 -26 0 -56 " +
  "l0 -44 l8 34 q4 12 14 10 q10 -2 8 -16 q-4 -28 -10 -62 q-4 -26 -14 -40 " +
  "q-12 -16 -34 -20 q8 -8 4 -22 q-4 -16 -20 -16 Z";

/**
 * Hacim oranını renge çevirir.
 *
 * Eşikler keyfi değil: 0 = hiç çalışılmamış, <%50 = eksik, %50-100 = yolda,
 * >=%100 = hedef tutturulmuş, >%150 = fazla (uyarı rengi — toparlanma riski).
 * Kırmızı BİLİNÇLİ olarak kullanılmıyor; fazla hacim bir hata değil, bir uyarı.
 */
function volumeColor(sets: number, target: number): string {
  if (sets <= 0) return "var(--color-heat-0)";
  const ratio = sets / Math.max(target, 1);
  if (ratio < 0.5) return "var(--color-heat-1)";
  if (ratio < 1) return "var(--color-heat-2)";
  if (ratio <= 1.5) return "var(--color-heat-4)";
  return "var(--color-heat-over)";
}

interface Props {
  volumes: MuscleVolume[];
  /** Tam ekran sayfada true; ana paneldeki mini haritada false. */
  interactive?: boolean;
  className?: string;
}

export function MuscleMap({ volumes, interactive = true, className }: Props) {
  const [region, setRegion] = useState<Region>("front");
  const [hovered, setHovered] = useState<MuscleVolume | null>(null);

  const bySvgId = useMemo(() => {
    const map = new Map<string, MuscleVolume>();
    for (const v of volumes) map.set(v.svgId, v);
    return map;
  }, [volumes]);

  const shapes = region === "front" ? FRONT_SHAPES : BACK_SHAPES;

  return (
    <div className={className}>
      {interactive && (
        <div className="mb-4 flex gap-1" role="tablist" aria-label="Vücut görünümü">
          {(["front", "back"] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={region === r}
              onClick={() => setRegion(r)}
              className={`btn ${region === r ? "btn-primary" : "btn-ghost"}`}
            >
              {r === "front" ? "Ön" : "Arka"}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox="0 0 200 420"
        className="w-full max-w-[280px] mx-auto block"
        role="img"
        aria-label={`${region === "front" ? "Ön" : "Arka"} vücut kas hacmi haritası`}
      >
        <path d={SILHOUETTE} fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />

        {shapes.map((shape) => {
          const volume = bySvgId.get(shape.svgId);
          const fill = volume
            ? volumeColor(volume.sets, volume.target)
            : "var(--color-surface-raised)";

          const parts = [
            <path key="l" d={shape.d} />,
            shape.mirror ? (
              <path key="r" d={shape.d} transform="translate(200,0) scale(-1,1)" />
            ) : null,
          ];

          return (
            <g
              key={shape.svgId}
              fill={fill}
              stroke="var(--color-border)"
              strokeWidth="0.75"
              onMouseEnter={() => volume && setHovered(volume)}
              onMouseLeave={() => setHovered(null)}
              className={interactive ? "cursor-pointer" : undefined}
            >
              {volume && <title>{`${volume.nameTr}: ${volume.sets.toFixed(1)} / ${volume.target} set`}</title>}
              {parts}
            </g>
          );
        })}
      </svg>

      {interactive && (
        <div className="mt-4 min-h-[2.5rem] text-center">
          {hovered ? (
            <p className="text-sm">
              <span className="text-ink">{hovered.nameTr}</span>{" "}
              <span className="tnum text-ink-muted">
                {hovered.sets.toFixed(1)} / {hovered.target} set
              </span>
            </p>
          ) : (
            <p className="text-xs text-ink-faint">
              Bir kas grubuna gel — haftalık set hacmini gösterir.
            </p>
          )}
        </div>
      )}

      {interactive && <Legend />}
    </div>
  );
}

function Legend() {
  // `volumeColor` ile AYNI basamaklar; ikisi ayrışırsa açıklama yanlış olur.
  const steps: Array<[string, string]> = [
    ["Çalışılmadı", "var(--color-heat-0)"],
    ["Eksik", "var(--color-heat-1)"],
    ["Yolda", "var(--color-heat-2)"],
    ["Hedefte", "var(--color-heat-4)"],
    ["Fazla", "var(--color-heat-over)"],
  ];
  return (
    <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {steps.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span
            className="inline-block size-2.5 rounded-[2px] border border-[var(--color-border)]"
            style={{ background: color }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
