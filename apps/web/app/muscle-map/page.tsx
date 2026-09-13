import { MuscleMap } from "@/components/MuscleMap";
import type { MuscleVolume } from "@overload/shared-types";

/** Kas Haritası — tam ekran, ön/arka (Bölüm 8, ekran 7). */

const SAMPLE: MuscleVolume[] = [
  { slug: "chest", nameTr: "Göğüs", svgId: "m-chest", region: "front", sets: 10, target: 12 },
  { slug: "front_delts", nameTr: "Ön Omuz", svgId: "m-front-delts", region: "front", sets: 9, target: 8 },
  { slug: "side_delts", nameTr: "Yan Omuz", svgId: "m-side-delts", region: "front", sets: 19, target: 12 },
  { slug: "rear_delts", nameTr: "Arka Omuz", svgId: "m-rear-delts", region: "back", sets: 4, target: 10 },
  { slug: "lats", nameTr: "Kanat (Lat)", svgId: "m-lats", region: "back", sets: 13, target: 12 },
  { slug: "mid_back", nameTr: "Orta Sırt", svgId: "m-mid-back", region: "back", sets: 8, target: 10 },
  { slug: "traps", nameTr: "Trapez", svgId: "m-traps", region: "back", sets: 2, target: 6 },
  { slug: "lower_back", nameTr: "Bel", svgId: "m-lower-back", region: "back", sets: 1, target: 6 },
  { slug: "biceps", nameTr: "Biceps", svgId: "m-biceps", region: "front", sets: 12, target: 12 },
  { slug: "triceps", nameTr: "Triceps", svgId: "m-triceps", region: "back", sets: 8, target: 12 },
  { slug: "forearms", nameTr: "Ön Kol", svgId: "m-forearms", region: "front", sets: 4, target: 6 },
  { slug: "abs", nameTr: "Karın", svgId: "m-abs", region: "front", sets: 0, target: 8 },
  { slug: "obliques", nameTr: "Yan Karın", svgId: "m-obliques", region: "front", sets: 0, target: 6 },
  { slug: "quads", nameTr: "Quadriceps", svgId: "m-quads", region: "front", sets: 6, target: 12 },
  { slug: "hamstrings", nameTr: "Arka Bacak", svgId: "m-hamstrings", region: "back", sets: 3, target: 10 },
  { slug: "glutes", nameTr: "Kalça", svgId: "m-glutes", region: "back", sets: 2, target: 10 },
  { slug: "calves", nameTr: "Baldır", svgId: "m-calves", region: "back", sets: 0, target: 8 },
  { slug: "adductors", nameTr: "İç Bacak", svgId: "m-adductors", region: "front", sets: 0, target: 4 },
];

export default function MuscleMapPage() {
  const undertrained = SAMPLE.filter((m) => m.sets < m.target * 0.5);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Kas Haritası</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Son 7 günün efektif set hacmi. Birincil kaslar 1.0, ikincil kaslar 0.5 set sayılır.
        </p>
      </header>

      <div className="card p-6">
        <MuscleMap volumes={SAMPLE} />
      </div>

      {undertrained.length > 0 && (
        <section className="card p-4">
          <h2 className="text-base font-medium">Hedefin yarısının altında</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Bu gruplar bu hafta ihmal edilmiş. Programda dengelemek isteyebilirsin.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {undertrained.map((m) => (
              <li
                key={m.slug}
                className="tnum rounded-[3px] border border-[var(--color-border-strong)] px-2 py-1 text-xs"
              >
                {m.nameTr} · {m.sets}/{m.target}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
