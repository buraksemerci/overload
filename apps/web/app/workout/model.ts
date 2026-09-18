"use client";

/**
 * Antrenman akışının paylaşılan modeli.
 *
 * Akış ekranı (sayfa), sahneler ve günün haritası aynı üç şeyi konuşuyor:
 * bir ADIM (hangi hareketin kaçıncı seti), bir TASLAK (alanlara yazılmış ama
 * kaydedilmemiş değerler) ve ağırlığın Türkçe biçimi. Üçü de burada; yoksa
 * dosyalar birbirinden tip almak için birbirine bağlanıyordu.
 */

import type { PlannedExercise } from "@/lib/queries";

/** Akışın tek adımı: belirli bir hareketin belirli bir seti. */
export interface Step {
  exercise: PlannedExercise;
  setNumber: number;
  exerciseIndex: number;
}

export interface Draft {
  weight: string;
  reps: string;
  rir: string;
  /**
   * Isınma seti mi?
   *
   * Isınma setleri hacme, rekora ve ilerleme motoruna GİRMİYOR (sunucu
   * `is_warmup` alanına bakıyor). Ekranda kaydedilebilmeleri gerekiyordu:
   * kullanıcı ısınmasını da yazmak istiyor ama o setler "bugün 5 set yaptım"
   * sayısını şişirmemeli. Eski taslaklarda alan yok — `?` o yüzden.
   */
  warmup?: boolean;
}

/** "100.00" -> "100", "42.50" -> "42,5". Alana geri yazılabilir biçim. */
export const weightText = (value: string | number) => {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isNaN(n) ? "" : String(n).replace(".", ",");
};

export const parseWeight = (value: string) => Number.parseFloat(value.replace(",", "."));

/* --- Taslak kalıcılığı ------------------------------------------------------ */

export const draftStorageKey = (sessionId: string) => `overload.drafts.${sessionId}`;

export function loadDrafts(sessionId: string): Record<string, Draft> {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(sessionId));
    return raw ? (JSON.parse(raw) as Record<string, Draft>) : {};
  } catch {
    return {};
  }
}

export function saveDrafts(sessionId: string, drafts: Record<string, Draft>): void {
  try {
    window.localStorage.setItem(draftStorageKey(sessionId), JSON.stringify(drafts));
  } catch {
    // Gizli sekme ya da dolu depolama: taslak yalnızca bellekte kalır.
  }
}
