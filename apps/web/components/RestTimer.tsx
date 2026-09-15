"use client";

/**
 * Dinlenme sayacı — zamanlama mantığı.
 *
 * Görsel sunum burada DEĞİL: antrenman akışında sayaç ekranın ortasında büyük
 * duruyor, köşede bir kart değil. Bu dosya yalnızca "kaç saniye kaldı" ve
 * "bitti" bildirimini üretiyor.
 *
 * --------------------------------------------------------------------------
 * NEDEN BİTİŞ ZAMANI TUTULUYOR, SAYAÇ AZALTILMIYOR
 * --------------------------------------------------------------------------
 * İlk uygulamada her saniye `remaining - 1` yapılıyordu. Telefonda bu
 * çalışmıyor: iOS uygulama arka plana atıldığında ya da ekran kilitlendiğinde
 * zamanlayıcıları donduruyor. Kullanıcı seti bitirip telefonu cebine koyuyor,
 * çıkardığında sayaç kaldığı yerde bekliyor — yani tam kullanıldığı anda
 * yanlış çalışıyordu.
 *
 * Şimdi tek gerçek kaynak `endsAt` zaman damgası. Ekran uyandığında kalan süre
 * `endsAt - Date.now()` ile yeniden hesaplanıyor, arka planda ne olduğu
 * önemsiz. Tarayıcıda 60 saniyelik donma simüle edilerek doğrulandı.
 *
 * --------------------------------------------------------------------------
 * NEDEN SES DE VAR
 * --------------------------------------------------------------------------
 * `navigator.vibrate` Safari'de HİÇ desteklenmiyor — Android'de çalışıyor,
 * iPhone'da sessizce hiçbir şey olmuyor. Uygulamanın kullanıcıları iPhone'da
 * olduğu için titreşim tek başına bildirim sayılamaz.
 *
 * Ses için WebAudio kullanılıyor ve bağlam kullanıcı dokunmasıyla açılıyor
 * (seti tamamlama düğmesi); iOS ses çalmayı kullanıcı etkileşimine bağlıyor,
 * sayfa yüklenirken oluşturulan bir bağlam sessiz kalıyor.
 */

import { useEffect, useRef, useState } from "react";

export interface RestState {
  endsAt: number;
  total: number;
}

/** Kullanıcı dokunması sırasında çağrılmalı; iOS ses iznini o an veriyor. */
export function createAudioUnlock(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const context = new Ctor();
    void context.resume();
    return context;
  } catch {
    return null;
  }
}

function beep(context: AudioContext | null): void {
  if (!context) return;
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    // Kısa bir yükselme/inme: ani başlayan ses "tık" gibi duyuluyor.
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, context.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.32);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.34);
  } catch {
    // Ses çalmamak akışı bozmamalı.
  }
}

/**
 * Kalan saniye ve ilerleme oranı. Süre dolduğunda `onDone` bir kez çağrılıyor,
 * titreşim ve ses denenerek.
 */
export function useRestCountdown(
  rest: RestState | null,
  audio: AudioContext | null,
  onDone: () => void,
): { remaining: number; progress: number } {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);

  useEffect(() => {
    if (rest === null) return;
    fired.current = false;
    setNow(Date.now());
    // 250ms: saniye değişimini gözle fark edilir gecikme olmadan yakalıyor.
    // Arka planda kısılsa bile `Date.now()` doğru kaldığı için sorun değil.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest]);

  const remaining = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (rest === null || remaining > 0 || fired.current) return;
    fired.current = true;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]); // Android; Safari'de sessizce yok sayılır
    }
    beep(audio);
    onDone();
  }, [rest, remaining, audio, onDone]);

  const progress = rest && rest.total > 0 ? (rest.total - remaining) / rest.total : 0;
  return { remaining, progress };
}

/** "2:28" biçiminde. */
export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
