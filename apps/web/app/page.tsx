import Link from "next/link";
import { MuscleMap } from "@/components/MuscleMap";
import type { MuscleVolume } from "@overload/shared-types";

/**
 * Ana panel (Bölüm 8, ekran 2): bugünkü antrenman, streak, hacim özeti,
 * mini kas haritası.
 *
 * Şu an örnek verilerle render ediyor — backend bağlandığında
 * `GET /dashboard` çağrısıyla değişecek. Örnek veriyi bilerek burada
 * bırakıyorum ki tasarım dili ve bileşenler backend olmadan da gözden
 * geçirilebilsin.
 */

const SAMPLE_VOLUMES: MuscleVolume[] = [
  { slug: "chest", nameTr: "Göğüs", svgId: "m-chest", region: "front", sets: 10, target: 12 },
  { slug: "lats", nameTr: "Kanat (Lat)", svgId: "m-lats", region: "back", sets: 13, target: 12 },
  { slug: "quads", nameTr: "Quadriceps", svgId: "m-quads", region: "front", sets: 6, target: 12 },
  { slug: "side_delts", nameTr: "Yan Omuz", svgId: "m-side-delts", region: "front", sets: 19, target: 12 },
  { slug: "biceps", nameTr: "Biceps", svgId: "m-biceps", region: "front", sets: 12, target: 12 },
  { slug: "triceps", nameTr: "Triceps", svgId: "m-triceps", region: "back", sets: 8, target: 12 },
  { slug: "hamstrings", nameTr: "Arka Bacak", svgId: "m-hamstrings", region: "back", sets: 3, target: 10 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Bugün</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Pazartesi — Göğüs / Omuz / Triceps
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Seri" value="12" unit="gün" />
        <Stat label="Bu hafta" value="3" unit="/ 5 antrenman" />
        <Stat label="Haftalık hacim" value="14.2" unit="ton" />
      </div>

      {/* Bugünkü antrenman — birincil aksiyon, tek vurgu rengi burada */}
      <section className="card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium">Bugünkü antrenman</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              6 hareket · tahmini 55 dk
            </p>
          </div>
          <Link href="/workout" className="btn btn-primary shrink-0">
            Başla
          </Link>
        </div>

        <ul className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
          {[
            { name: "Plate Loaded Chest Press", target: "2x5-6", hint: "42.5kg x 6 dene" },
            { name: "Smith Machine Low Incline Row", target: "1x6-8", hint: "60kg x 8 (failure)" },
            { name: "Chest Fly Machine", target: "2x6-8", hint: "35kg x 8" },
            { name: "Shoulder Press Machine", target: "3x8-10", hint: "30kg x 10 (failure)" },
            { name: "Lateral Raise", target: "2x6-8", hint: "10kg x 8" },
            { name: "Triceps Pushdown", target: "2x8-10", hint: "25kg x 10 (failure)" },
          ].map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm">{row.name}</p>
                <p className="tnum text-xs text-[var(--color-ink-faint)]">{row.target}</p>
              </div>
              <p className="tnum shrink-0 text-xs text-[var(--color-ink-muted)]">{row.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Haftalık kas hacmi</h2>
          <Link
            href="/muscle-map"
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Tam ekran →
          </Link>
        </div>
        <MuscleMap volumes={SAMPLE_VOLUMES} className="mt-4" />
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1">
        <span className="tnum text-xl font-semibold">{value}</span>{" "}
        <span className="text-xs text-[var(--color-ink-faint)]">{unit}</span>
      </p>
    </div>
  );
}
