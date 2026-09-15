"use client";

/**
 * Dinlenme sayacı.
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
 * önemsiz.
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
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

export function RestTimer({
  rest,
  audio,
  onDone,
  onSkip,
}: {
  rest: RestState;
  audio: AudioContext | null;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    setNow(Date.now());
    // 250ms: saniye değişimini gözle fark edilir gecikme olmadan yakalıyor.
    // Arka planda kısılsa bile `Date.now()` doğru kaldığı için sorun değil.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest.endsAt]);

  const remaining = Math.max(0, Math.ceil((rest.endsAt - now) / 1000));

  useEffect(() => {
    if (remaining > 0 || fired.current) return;
    fired.current = true;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]); // Android; Safari'de sessizce yok sayılır
    }
    beep(audio);
    onDone();
  }, [remaining, audio, onDone]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = rest.total > 0 ? (rest.total - remaining) / rest.total : 0;
  const circumference = 2 * Math.PI * 16;

  return (
    <div
      role="timer"
      aria-live="off"
      className="card-raised fixed right-6 bottom-6 flex items-center gap-4 p-4"
      style={{
        zIndex: "var(--z-sticky)",
        animation: "reveal var(--dur-short) var(--ease-out) forwards",
      }}
    >
      <div className="relative size-12 shrink-0">
        <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-border)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="var(--color-accent-deep)"
            strokeWidth="3"
            strokeDasharray={`${progress * circumference} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="min-w-[4.5rem]">
        <p className="label">Dinlenme</p>
        <p className="figure tnum mt-0.5 text-md">
          {minutes}:{String(seconds).padStart(2, "0")}
        </p>
      </div>

      <button type="button" className="btn btn-ghost" onClick={onSkip}>
        Atla
      </button>
    </div>
  );
}
