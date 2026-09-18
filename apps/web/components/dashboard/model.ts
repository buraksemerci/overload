/**
 * Panonun küçük yardımcıları.
 *
 * Pano sayfası ve karoları aynı iki soruyu soruyor: bu programda gün başına
 * kaç set var ve bu tarih bugüne mi denk geliyor?
 */

import type Link from "next/link";
import type { TodayWorkout } from "@/lib/queries";

// Next 16 rotaları tipliyor: `href` gelişigüzel bir string olamaz.
export type Href = React.ComponentProps<typeof Link>["href"];


export function totalSets(workout: TodayWorkout): number {
  return workout.exercises.reduce((sum, e) => sum + e.target_sets, 0);
}

/** ISO tarih/zaman damgasının kullanıcının yerel gününe denk gelip gelmediği. */
export function isToday(iso: string): boolean {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
