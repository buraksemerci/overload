"use client";

/**
 * Antrenman sırasında cihazın kendisiyle ilgili küçük yardımcılar.
 *
 * Hepsi "varsa kullan, yoksa sessizce geç": tarayıcı desteklemiyorsa ya da
 * izin vermiyorsa akış bozulmamalı.
 */

import { useEffect, useState } from "react";

/**
 * Ekran açık kalsın.
 *
 * Set arasında telefon masada duruyor ve 30 saniyede kararan ekran dinlenme
 * sayacını gizliyordu; her set sonunda kilidi açmak gerekiyordu. Kilit, sekme
 * arka plana geçince tarayıcı tarafından bırakılıyor — öne dönünce yeniden
 * isteniyor.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Pil tasarrufu ya da izin: ekranın kararması akışı bozmuyor.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Kısa bir titreşim. Destek yoksa (iOS Safari) hiçbir şey yapmıyor. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Yok say.
  }
}

/** Her `interval` milisaniyede güncellenen şimdiki zaman. */
export function useNow(interval = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [interval, active]);
  return now;
}

/** "12:05" ya da "1:02:40". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
