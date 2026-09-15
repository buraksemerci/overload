"use client";

/** Kas Haritası — tam ekran, ön/arka (Bölüm 8, ekran 7). */

import { useState } from "react";
import { MuscleMap } from "@/components/MuscleMap";
import { PageHeader } from "@/components/Layout";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { useMuscleVolume } from "@/lib/queries";
import type { MuscleVolume } from "@overload/shared-types";

const RANGES = [
  { days: 7, label: "7 gün" },
  { days: 14, label: "14 gün" },
  { days: 30, label: "30 gün" },
] as const;

export default function MuscleMapPage() {
  const [days, setDays] = useState<number>(7);
  const volume = useMuscleVolume(days);

  const volumes: MuscleVolume[] = (volume.data ?? []).map((row) => ({
    slug: row.slug,
    nameTr: row.name_tr,
    svgId: row.svg_id,
    region: row.region,
    sets: row.sets,
    target: row.target,
  }));

  // Hedef pencereye göre ölçekleniyor: 30 günlük görünümde haftalık hedefi
  // kullanmak her kası "fazla çalışılmış" gösterirdi.
  const scale = days / 7;
  const scaled = volumes.map((v) => ({ ...v, target: Math.round(v.target * scale) }));

  const undertrained = scaled.filter((m) => m.sets < m.target * 0.5);
  const overtrained = scaled.filter((m) => m.sets > m.target * 1.5);

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Kas Haritası"
        info={
          <>
            Efektif set hacmi gösteriliyor. Birincil kaslar 1.0, ikincil kaslar
            0.5 set sayılıyor; tek taraflı hareketler iki katı. Hipertrofi
            literatüründe yaygın olan bu ağırlıklandırma, &ldquo;bench press
            biceps çalıştırmaz ama triceps&apos;i yarım sayar&rdquo; sezgisini
            sayısallaştırıyor. Isınma setleri sayılmıyor.
          </>
        }
      />

      {/* Görünüm seçicisi, aksiyon değil — bkz. `.seg` (globals.css). */}
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

      {volume.isLoading ? (
        <Loading />
      ) : volume.isError ? (
        <ErrorBox error={volume.error} onRetry={() => void volume.refetch()} />
      ) : scaled.every((m) => m.sets === 0) ? (
        <Empty
          title="Henüz veri yok"
          hint="İlk antrenmanını tamamladığında kas grubu bazında hacim burada görünecek."
        />
      ) : (
        <>
          <div className="card p-6">
            <MuscleMap volumes={scaled} />
          </div>

          {undertrained.length > 0 && (
            <section className="card p-6">
              <h2 className="text-base">Hedefin yarısının altında</h2>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Bu gruplar ihmal edilmiş. Programda dengelemek isteyebilirsin.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {undertrained.map((m) => (
                  <li
                    key={m.slug}
                    className="tnum rounded-[3px] border border-[var(--color-border-strong)] px-2 py-1 text-xs"
                  >
                    {m.nameTr} · {fmt(m.sets, 1)}/{m.target}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overtrained.length > 0 && (
            <section className="card p-6">
              <h2 className="text-base" style={{ color: "var(--color-warning)" }}>
                Hedefin belirgin üstünde
              </h2>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Fazla hacim bir hata değil, ama toparlanmanı zorlayabilir — özellikle
                bu gruplarda ilerleme durduysa.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {overtrained.map((m) => (
                  <li
                    key={m.slug}
                    className="tnum rounded-[3px] border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--color-warning)" }}
                  >
                    {m.nameTr} · {fmt(m.sets, 1)}/{m.target}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
