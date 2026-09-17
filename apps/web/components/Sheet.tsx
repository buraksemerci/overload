"use client";

/**
 * Odaklanmış panel (modal).
 *
 * --------------------------------------------------------------------------
 * NEDEN AYRI BİR KATMAN, NEDEN SAYFA İÇİNE GÖMÜLÜ DEĞİL
 * --------------------------------------------------------------------------
 * Beslenme ekranında besin ekleme formu sayfanın ortasında bir kart olarak
 * duruyordu. İki sorun çıkarıyordu: form açıldığında sayfa aşağı doğru
 * büyüyordu (kullanıcı kaydırmak zorunda kalıyor, alan görünmüyor) ve arama
 * sonuçları listesi günün kayıtlarını ekrandan itiyordu.
 *
 * Panel olarak açılınca ekranda bir seferde tek iş oluyor — antrenman
 * akışındaki "Stage" fikrinin aynısı. Arkadaki gün görünümü yerinde kalıyor,
 * panel kapanınca kullanıcı bıraktığı yerde.
 *
 * Kapatma yolları KASITLI olarak üç tane: Escape, dışarı tıklama, kapat
 * düğmesi. Üçü de aynı şeyi yapıyor; hangisini deneyen olursa çalışıyor.
 *
 * --------------------------------------------------------------------------
 * NEDEN PORTAL
 * --------------------------------------------------------------------------
 * Panel `<body>`e taşınıyor. `main` üzerinde her zaman bir `filter` duruyor
 * (panel arkasını bulanıklaştıran sınıf, kapalıyken bile `blur(0)`), ve
 * filtreli bir öğe `position: fixed` torunları için KONUM KABI oluyor. Yani
 * sayfa aşağı kaydırılmışken panel ekranın ortasına değil, `main`in ortasına
 * yerleşiyordu: başlığı görünmeyen, yarısı ekranın dışında kalan bir kutu.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Sheet({
  title,
  onClose,
  children,
  footer,
  /** Panel genişliği. Onay paneli dar, arama sonuçları geniş olmalı. */
  width = "30rem",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Portal ancak istemcide kurulabiliyor (`document` gerekiyor). Panel zaten
  // bir etkileşimle açıldığı için ilk render'da görünmemesi sorun değil.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Panel kapanınca odak geldiği yere dönmeli; yoksa klavye kullanıcısı
  // sayfanın en başına atılıyor.
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;

      // Odak tuzağı: panel açıkken Tab arkadaki sayfaya kaçmamalı.
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select,textarea,[href],[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    // Arkadaki sayfanın kaydırılmasını kilitle: panel içinde kaydırmaya
    // çalışan kullanıcı yanlışlıkla sayfayı kaydırıyordu.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center"
      style={{ zIndex: "var(--z-modal)" }}
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(21%_0.014_115_/_0.28)] backdrop-blur-[2px]"
        style={{ animation: "fade-in var(--dur-short) var(--ease-out) forwards" }}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card-raised scroll-thin relative flex max-h-[90dvh] w-full flex-col overflow-hidden"
        style={{
          maxWidth: width,
          // Telefonda alttan, masaüstünde ortadan: ikisinde de en kısa
          // hareket. `sheet-in` her iki eksende de aynı eğriyi kullanıyor.
          animation: "sheet-in var(--dur-long) var(--ease-out) forwards",
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="btn-quiet -mr-2 grid size-9 place-items-center rounded-[var(--radius-md)] text-[var(--color-ink-faint)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-[var(--color-border)] px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
