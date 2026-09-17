"use client";

/**
 * Antrenman sırasında cihazın kendisiyle ilgili küçük yardımcılar.
 *
 * Hepsi "varsa kullan, yoksa sessizce geç": tarayıcı desteklemiyorsa ya da
 * izin vermiyorsa akış bozulmamalı.
 */

import { useEffect, useRef, useState } from "react";

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

/**
 * Ekran genelinde klavye kısayolları.
 *
 * Bir alana yazarken ÇALIŞMIYOR: antrenman ekranında "+" tuşu ağırlığı
 * artırıyor ama kilo alanına "+" yazmak isteyen biri de var. Aynı sebeple
 * Ctrl/Cmd/Alt basılıyken devre dışı — onlar tarayıcının kısayolları.
 *
 * Kısayollar fareye ya da dokunmaya ALTERNATİF, tek yol değil: her birinin
 * ekranda görünen bir düğmesi var.
 */
export function useHotkeys(handlers: Record<string, () => void>, active = true): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const handler = latest.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
