"use client";

/**
 * Tutarlılık ısı haritası — GitHub katkı ızgarası tarzı (Bölüm 4.1).
 *
 * Yoğunluk toplam tonaja göre, seans sayısına göre değil: iki kısa seans ile
 * bir ağır seans aynı renkte görünmemeli. Eşikler mutlak değil **göreli** —
 * kullanıcının kendi en yüksek gününe oranlanıyor. Sabit bir kg eşiği,
 * yeni başlayanın ızgarasını tamamen soluk, ileri seviyenin ızgarasını
 * tamamen dolu gösterirdi.
 */

import { useEffect, useMemo, useRef } from "react";
import type { ConsistencyDay } from "@/lib/queries";

const WEEKDAY_LABELS = ["Pzt", "", "Çar", "", "Cum", "", "Paz"];
const MONTH_LABELS = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

function levelOf(volume: number, max: number): number {
  if (volume <= 0) return 0;
  if (max <= 0) return 1;
  const ratio = volume / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

// Ortak ısı ölçeği (globals.css). Önceden volt, kart yüzeyiyle yüzdelik
// oranlarda karıştırılıyordu; volt %90 parlaklıkta olduğu için beş basamağın
// tamamı %90-99 aralığına sıkışıyor ve 11 piksellik karelerde ayırt
// edilemiyordu. Ölçek artık hem parlaklıkta hem doygunlukta ilerliyor.
const LEVEL_BACKGROUND = [
  "var(--color-heat-0)",
  "var(--color-heat-1)",
  "var(--color-heat-2)",
  "var(--color-heat-3)",
  "var(--color-heat-4)",
];

export function ConsistencyGrid({
  days,
  className,
  cell = 11,
}: {
  days: ConsistencyDay[];
  className?: string;
  /** Kare kenarı, piksel. Geniş ekranda ızgara satırı doldursun diye büyüyor. */
  cell?: number;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const gap = cell >= 14 ? 4 : 3;

  const { weeks, maxVolume, totalSessions } = useMemo(() => {
    const parsed = days.map((d) => ({
      date: new Date(`${d.date}T00:00:00`),
      sessions: d.sessions,
      volume: Number.parseFloat(d.total_volume_kg) || 0,
      iso: d.date,
    }));

    const max = parsed.reduce((m, d) => Math.max(m, d.volume), 0);
    const sessions = parsed.reduce((s, d) => s + d.sessions, 0);

    // Haftalara böl. İlk haftayı Pazartesi'ye hizalamak için baştan boşluk ekle
    // (getDay(): 0=Pazar, bizde hafta Pazartesi başlıyor).
    const grid: Array<Array<(typeof parsed)[number] | null>> = [];
    let current: Array<(typeof parsed)[number] | null> = [];

    if (parsed.length > 0) {
      const firstWeekday = (parsed[0]!.date.getDay() + 6) % 7;
      current = Array<null>(firstWeekday).fill(null);
    }
    for (const day of parsed) {
      current.push(day);
      if (current.length === 7) {
        grid.push(current);
        current = [];
      }
    }
    if (current.length > 0) {
      while (current.length < 7) current.push(null);
      grid.push(current);
    }

    return { weeks: grid, maxVolume: max, totalSessions: sessions };
  }, [days]);

  // Dar ekranda ızgara taşıyor ve en ESKİ aylar görünüyordu. Açılışta en
  // yeniye (sağ uca) kaydırılıyor: bakılan şey son haftalar.
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [weeks.length]);

  if (days.length === 0) return null;

  return (
    <div className={className}>
      {/* Izgara yatayda taşabilir; sayfanın tamamı değil SADECE burası kaysın. */}
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div className="flex gap-1">
          <div
            className="flex shrink-0 flex-col pr-1"
            style={{ gap, paddingTop: 12 + gap }}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="text-[9px] text-[var(--color-ink-faint)]"
                style={{ height: cell, lineHeight: `${cell}px` }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex" style={{ gap }}>
            {weeks.map((week, weekIndex) => {
              const firstReal = week.find((d) => d !== null);
              const showMonth =
                firstReal !== undefined &&
                firstReal !== null &&
                firstReal.date.getDate() <= 7;
              return (
                <div key={weekIndex} className="flex flex-col" style={{ gap }}>
                  <span className="h-3 text-[9px] leading-3 text-[var(--color-ink-faint)]">
                    {showMonth && firstReal ? MONTH_LABELS[firstReal.date.getMonth()] : ""}
                  </span>
                  {week.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      className="rounded-[2px]"
                      style={{
                        width: cell,
                        height: cell,
                        background: day
                          ? LEVEL_BACKGROUND[levelOf(day.volume, maxVolume)]
                          : "transparent",
                      }}
                      title={
                        day
                          ? `${day.iso}: ${day.sessions} antrenman, ${Math.round(day.volume)} kg tonaj`
                          : undefined
                      }
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-2xs text-[var(--color-ink-faint)]">
        <span className="tnum">{totalSessions} antrenman</span>
        <span className="flex items-center gap-1">
          Az
          {LEVEL_BACKGROUND.map((background, i) => (
            <span
              key={i}
              className="inline-block size-[11px] rounded-[2px]"
              style={{ background }}
            />
          ))}
          Çok
        </span>
      </div>
    </div>
  );
}
