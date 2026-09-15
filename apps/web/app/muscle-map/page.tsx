"use client";

/**
 * Kas Haritası.
 *
 * İki kolon: solda anatomik vücut, sağda kas grupları listesi. Tek kolonda
 * vücudun iki yanında ~350 piksel boş alan kalıyordu ve masaüstü genişliği
 * boşa gidiyordu.
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
import { PageHeader, Section } from "@/components/Layout";
import { MuscleMap } from "@/components/MuscleMap";
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
  const [highlight, setHighlight] = useState<string | null>(null);
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
  const scaled = volumes.map((v) => ({
    ...v,
    target: Math.max(1, Math.round(v.target * scale)),
  }));

  // Orana göre artan: en eksik olan en üstte, yani eylem gerektiren önce.
  const ranked = [...scaled].sort((a, b) => a.sets / a.target - b.sets / b.target);

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Kas Haritası"
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
      />

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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div className="card p-6">
            <MuscleMap volumes={scaled} highlight={highlight} />
          </div>

          <Section title="Kas grupları" className="min-w-0">
            <p className="-mt-3 mb-4 text-xs text-[var(--color-ink-faint)]">
              En eksik olan üstte. Bir satıra gel — vücutta o bölge işaretlenir.
            </p>
            <ul className="divide-y divide-[var(--color-border)]">
              {ranked.map((muscle) => (
                <MuscleRow
                  key={muscle.slug}
                  muscle={muscle}
                  onHover={() => setHighlight(muscle.svgId)}
                  onLeave={() => setHighlight(null)}
                />
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}

function MuscleRow({
  muscle,
  onHover,
  onLeave,
}: {
  muscle: MuscleVolume;
  onHover: () => void;
  onLeave: () => void;
}) {
  const ratio = muscle.sets / Math.max(muscle.target, 1);
  // Çubuk %150'de doluyor; ötesi "fazla" ve kehribara dönüyor.
  const width = Math.min(1, ratio / 1.5) * 100;
  const color =
    muscle.sets <= 0
      ? "var(--color-heat-0)"
      : ratio < 0.5
        ? "var(--color-heat-1)"
        : ratio < 1
          ? "var(--color-heat-2)"
          : ratio <= 1.5
            ? "var(--color-heat-4)"
            : "var(--color-heat-over)";

  return (
    <li onMouseEnter={onHover} onMouseLeave={onLeave} className="flex items-center gap-4 py-2.5">
      <span className="w-[8.5rem] shrink-0 truncate text-sm">{muscle.nameTr}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, background: color }}
        />
      </span>
      <span className="tnum w-[4.5rem] shrink-0 text-right text-xs text-[var(--color-ink-muted)]">
        {fmt(muscle.sets, 1)} / {muscle.target}
      </span>
    </li>
  );
}
