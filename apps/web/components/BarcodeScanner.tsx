"use client";

/**
 * Barkod okuyucu (Bölüm 4.2).
 *
 * **Tarayıcının yerleşik `BarcodeDetector` API'si kullanılıyor, kütüphane değil.**
 * ZXing ya da QuaggaJS gibi JS çözümleyiciler 200-400 KB ekliyor ve telefonda
 * kare kare çözümleme yaptıkları için pili hızla tüketiyorlar. `BarcodeDetector`
 * işi işletim sistemine devrediyor: sıfır bayt, donanım hızlandırmalı.
 *
 * Bedeli: Safari desteklemiyor (2026 itibarıyla Chrome/Android ve Edge var).
 * Bu yüzden **elle giriş her zaman açık** — desteklenmeyen tarayıcıda bileşen
 * kamerayı hiç açmıyor, doğrudan elle giriş gösteriyor ve sebebini yazıyor.
 *
 * Kamera izni kullanıcıdan isteniyor; reddedilirse yine elle girişe düşülüyor.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** `BarcodeDetector` henüz standart TS lib'inde yok. */
interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** Paketli gıdalarda kullanılan biçimler. QR/DataMatrix kasıtlı olarak dışarıda. */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return ctor ?? null;
}

interface Props {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<
    "checking" | "scanning" | "unsupported" | "denied" | "error"
  >("checking");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    const Detector = getDetectorCtor();
    if (Detector === null) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    let frame = 0;
    const detector = new Detector({ formats: FORMATS });

    async function start() {
      try {
        // `environment`: telefonun arka kamerası. Ön kamera barkod okumaz.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("scanning");
        scan();
      } catch (error) {
        if (cancelled) return;
        const name = (error as { name?: string }).name;
        setStatus(name === "NotAllowedError" ? "denied" : "error");
      }
    }

    function scan() {
      frame = requestAnimationFrame(async () => {
        const video = videoRef.current;
        if (cancelled || !video || video.readyState < 2) {
          if (!cancelled) scan();
          return;
        }
        try {
          const found = await detector.detect(video);
          const first = found[0];
          if (first) {
            onDetected(first.rawValue);
            return; // bulundu, döngüyü durdur
          }
        } catch {
          // Tek karenin çözümlenememesi normal — bir sonraki karede tekrar dene.
        }
        if (!cancelled) scan();
      });
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop();
    };
  }, [onDetected, stop]);

  const explanation =
    status === "unsupported"
      ? "Bu tarayıcı barkod okumayı desteklemiyor (Safari'de yok). Barkodu elle girebilirsin."
      : status === "denied"
        ? "Kamera izni verilmedi. Barkodu elle girebilirsin."
        : status === "error"
          ? "Kamera açılamadı. Barkodu elle girebilirsin."
          : null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">Barkod oku</h3>
        <button
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="Kapat"
          className="text-sm text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          ✕
        </button>
      </div>

      {status === "checking" && (
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">Kamera hazırlanıyor…</p>
      )}

      {status === "scanning" && (
        <>
          <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)]">
            {/* `playsInline` iOS'ta zorunlu: olmadan video tam ekrana atlıyor. */}
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full bg-black object-cover"
            />
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Barkodu çerçeveye getir — otomatik okunacak.
          </p>
        </>
      )}

      {explanation && (
        <p className="mt-3 text-xs" style={{ color: "var(--color-warning)" }}>
          {explanation}
        </p>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = manual.trim();
          if (value) {
            stop();
            onDetected(value);
          }
        }}
      >
        <input
          inputMode="numeric"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Barkodu elle gir"
          aria-label="Barkod numarası"
          className="field tnum h-11 min-w-0 flex-1 px-3 text-sm"
        />
        <button type="submit" className="btn btn-ghost" disabled={!manual.trim()}>
          Ara
        </button>
      </form>
    </div>
  );
}
