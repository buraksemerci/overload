"use client";

/**
 * Sayfa ve bölüm iskeleti.
 *
 * --------------------------------------------------------------------------
 * AÇIKLAMALAR "?" ARKASINDA
 * --------------------------------------------------------------------------
 * Uygulamanın her ekranı bir açıklama paragrafıyla başlıyordu — *"Efektif set
 * hacmi. Birincil kaslar 1.0, ikincil kaslar 0.5 set sayılır; tek taraflı
 * hareketler iki katı."* Bunlar rastgele konulmamıştı: sayının nereden
 * geldiğini gizlememek için vardı ve bu doğru bir kaygı.
 *
 * Ama her açılışta okunmaları gerekmiyor. İlk seferinde öğretici olan metin
 * ellinci seferinde gürültü. `InfoTip` bunu çözüyor: ekran temiz kalıyor,
 * merak eden dokunup öğreniyor. Dürüstlük kaybolmuyor, sadece görünürlükten
 * çıkıyor.
 *
 * Kural: `Section` içindeki `info` metni ÖĞRETİCİ olmalı — yöntemi, eşiği,
 * kaynağı anlatmalı. "Bu bölümde antrenmanlarınızı görebilirsiniz" gibi
 * kendini tekrar eden cümleler info'ya da konmaz, hiçbir yere konmaz.
 */

import { useEffect, useRef, useState } from "react";

export function PageHeader({
  title,
  lead,
  info,
  actions,
}: {
  title: string;
  /** Tek satırlık, gerçekten bilgi taşıyan alt metin. Uzun açıklama `info`ya. */
  lead?: string;
  /** Yöntem açıklaması — "?" arkasında durur. */
  info?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl lg:text-2xl">{title}</h1>
          {info && <InfoTip label={`${title} nasıl hesaplanıyor`}>{info}</InfoTip>}
        </div>
        {lead && (
          <p className="mt-1 max-w-[58ch] text-sm text-[var(--color-ink-muted)]">{lead}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  info,
  actions,
  children,
  className = "",
  /** Kart yüzeyi olmadan, düz bölüm olarak. Geniş içerikler (ızgara, tablo) için. */
  bare = false,
}: {
  title?: string;
  info?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bare?: boolean;
}) {
  return (
    <section className={`${bare ? "" : "card p-6"} ${className}`}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <div className="flex items-center gap-2">
              <h2 className="text-base">{title}</h2>
              {info && <InfoTip label={`${title} hakkında`}>{info}</InfoTip>}
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Küçük "?" düğmesi ve açıklama baloncuğu.
 *
 * Tooltip DEĞİL, tıklamayla açılıyor: hover ile açılan baloncuklar dokunmatik
 * ekranda erişilemiyor ve klavyeyle gezinen kullanıcıyı dışarıda bırakıyor.
 */
export function InfoTip({
  children,
  label = "Açıklama",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="grid size-[18px] shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-[10px] font-semibold text-[var(--color-ink-faint)] transition-colors hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
        style={{ transitionDuration: "var(--dur-micro)" }}
      >
        ?
      </button>

      {open && (
        <span
          role="note"
          className="card-raised absolute top-6 left-0 w-[min(22rem,70vw)] p-4 text-xs leading-relaxed text-[var(--color-ink-muted)]"
          style={{
            zIndex: "var(--z-dropdown)",
            animation: "reveal var(--dur-short) var(--ease-out) forwards",
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * Ekranın ana içerik genişliği. Tek yerde tutuluyor ki ekranlar arası kaymasın.
 *
 * `flush`: yalnızca genişlik kabı, dikey ritim yok. Ana panel kendi ızgarasını
 * ve kendi kademeli açılış gecikmelerini kuruyor; `gap-6` onun aralıklarını
 * bozuyordu. Genişliğin tek kaynakta kalması için ayrı bir sarmalayıcı yazmak
 * yerine buraya bir kapı açıldı — `lib/design-tokens.test.ts` elle yazılmış
 * genişlikleri reddediyor.
 */
export function Page({
  children,
  flush = false,
}: {
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={`mx-auto max-w-[68rem] ${flush ? "" : "flex flex-col gap-6"}`}>
      {children}
    </div>
  );
}
