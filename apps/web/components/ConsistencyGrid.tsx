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

import { useMemo } from "react";
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

const LEVEL_BACKGROUND = [
  "var(--color-surface-raised)",
  "color-mix(in oklab, var(--color-accent) 25%, var(--color-surface))",
  "color-mix(in oklab, var(--color-accent) 50%, var(--color-surface))",
  "color-mix(in oklab, var(--color-accent) 75%, var(--color-surface))",
  "var(--color-accent)",
];

export function ConsistencyGrid({
  days,
  className,
}: {
  days: ConsistencyDay[];
  className?: string;
}) {
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

  if (days.length === 0) return null;

  return (
    <div className={className}>
      {/* Izgara yatayda taşabilir; sayfanın tamamı değil SADECE burası kaysın. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1">
          <div className="flex shrink-0 flex-col gap-[3px] pr-1 pt-[15px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="h-[11px] text-[9px] leading-[11px] text-[var(--color-ink-faint)]"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((week, weekIndex) => {
              const firstReal = week.find((d) => d !== null);
              const showMonth =
                firstReal !== undefined &&
                firstReal !== null &&
                firstReal.date.getDate() <= 7;
              return (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  <span className="h-3 text-[9px] leading-3 text-[var(--color-ink-faint)]">
                    {showMonth && firstReal ? MONTH_LABELS[firstReal.date.getMonth()] : ""}
                  </span>
                  {week.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      className="size-[11px] rounded-[2px]"
                      style={{
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
