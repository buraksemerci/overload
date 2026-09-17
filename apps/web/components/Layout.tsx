"use client";

/**
 * Sayfa ve bölüm iskeleti.
 *
 * --------------------------------------------------------------------------
 * HER EKRAN GİRİŞ EKRANININ DİLİYLE AÇILIYOR
 * --------------------------------------------------------------------------
 * Giriş ekranı karanlık bir salonda, sıcak ışıkta, büyük beyaz yazıyla
 * anlatıyor. İçeride ekranlar kırık beyaz bir kağıtta küçük bir başlıkla
 * açılıyordu ve iki taraf iki ayrı uygulama gibi duruyordu. Şimdi her ekran
 * aynı salondan bir kareyle açılıyor (`Hero`): üst çubuk onun üstünde cam,
 * başlık fotoğrafın içinde, ekranın en önemli bir iki sayısı da orada.
 * Okunacak içerik — listeler, formlar, grafikler — altında, açık zeminde.
 *
 * Fotoğraflar aynı dünyadan: giriş videosunun salonu, aynı pencereler, aynı
 * saat. Farklı stok karelerin yan yana gelmesi "şablon" hissi veriyordu.
 *
 * --------------------------------------------------------------------------
 * GENİŞLİK
 * --------------------------------------------------------------------------
 * İçerik 68rem'di ve geniş ekranda iki yanda çeyrek ekranlık boşluk
 * kalıyordu. 88rem: satırlar değil ızgaralar genişliyor — uzun metin kendi
 * `max-w-[..ch]` sınırını taşıyor.
 *
 * --------------------------------------------------------------------------
 * AÇIKLAMALAR "?" ARKASINDA
 * --------------------------------------------------------------------------
 * İlk seferinde öğretici olan metin ellinci seferinde gürültü. `InfoTip`
 * ekranı temiz tutuyor, merak eden dokunup öğreniyor.
 *
 * Kural: `info` metni ÖĞRETİCİ olmalı — yöntemi, eşiği, kaynağı anlatmalı.
 */

import { useEffect, useRef, useState } from "react";
import { Photo } from "@/components/Photo";

/** İçerik genişliği — `Page`, giriş bandının içi ve üst çubuk aynı çizgide. */
export const CONTENT_WIDTH = "max-w-[88rem]";

/* --- Giriş bandı ------------------------------------------------------------ */

const HERO_HEIGHT = {
  lg: "min(84svh, 54rem)",
  md: "min(64svh, 42rem)",
  sm: "min(46svh, 30rem)",
} as const;

/**
 * Perde ÜÇ yönlü: alttan (yazı), soldan (başlık bloğu) ve üstten (cam çubuk).
 * Giriş ekranındakiyle aynı değerler; üst şerit yeni — çubuk o sahnede
 * sabit ve yarı saydamdı, burada fotoğrafın içinde başlıyor.
 */
const HERO_SCRIM =
  "linear-gradient(to top, oklch(12% 0.01 115 / 0.86) 0%, oklch(12% 0.01 115 / 0.4) 42%, transparent 72%)," +
  "linear-gradient(to right, oklch(12% 0.01 115 / 0.62) 0%, oklch(12% 0.01 115 / 0.18) 42%, transparent 68%)," +
  "linear-gradient(to bottom, oklch(12% 0.01 115 / 0.55) 0%, transparent 24%)";

export function Hero({
  photo,
  position = "center",
  eyebrow,
  title,
  lead,
  info,
  actions,
  children,
  size = "md",
  quietTitle = false,
}: {
  /** `public/photos/<photo>.jpg`. */
  photo: string;
  position?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  info?: React.ReactNode;
  actions?: React.ReactNode;
  /** Başlığın altında, fotoğrafın içinde: ekranın ana sayıları. */
  children?: React.ReactNode;
  size?: keyof typeof HERO_HEIGHT;
  /**
   * Başlık küçük: bandın odağı başlık değil, altındaki içerik. Panelde
   * selamlama `h1` ama asıl büyük yazı günün antrenmanı.
   */
  quietTitle?: boolean;
}) {
  const height = HERO_HEIGHT[size];
  return (
    <section
      className="relative isolate overflow-hidden"
      style={{
        // Tam genişlik: `Page` ortalanmış bir kap ve bant onun dışına,
        // ekranın kenarına kadar taşıyor. Yatay taşmayı `html` kesiyor.
        width: "100vw",
        marginInline: "calc(50% - 50vw)",
        minHeight: height,
        background: "var(--color-night)",
        color: "var(--color-on-night)",
      }}
    >
      <div aria-hidden className="hero-media absolute inset-0">
        <Photo slug={photo} fill position={position} className="size-full" />
      </div>
      <div aria-hidden className="absolute inset-0" style={{ background: HERO_SCRIM }} />
      {/* Dar ekranda yazı fotoğrafın tam genişliğinde; soldan gelen perde
          onu örtmüyor ve parlak pencerelerin üstünde okunmuyordu. */}
      <div aria-hidden className="absolute inset-0 sm:hidden" style={{ background: "oklch(12% 0.01 115 / 0.34)" }} />

      <div
        className={`relative mx-auto flex w-full flex-col justify-end px-5 sm:px-8 ${CONTENT_WIDTH}`}
        style={{
          minHeight: height,
          paddingTop: "calc(var(--bar-height) + 2rem)",
          paddingBottom: size === "sm" ? "2rem" : "3rem",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="reveal min-w-0 max-w-[48rem]">
            {eyebrow && (
              <p className="label on-photo-dark" style={{ color: "var(--color-on-night-muted)" }}>
                {eyebrow}
              </p>
            )}
            <div className={`${eyebrow ? "mt-2" : ""} flex items-start gap-3`}>
              <h1
                className={`display on-photo-dark ${
                  quietTitle ? "text-lg lg:text-xl" : "text-2xl sm:text-3xl lg:text-4xl"
                }`}
                style={{ color: "var(--color-on-night)" }}
              >
                {title}
              </h1>
              {info && (
                <span className="mt-2">
                  <InfoTip
                    label={typeof title === "string" ? `${title} nasıl hesaplanıyor` : "Nasıl hesaplanıyor"}
                    onDark
                  >
                    {info}
                  </InfoTip>
                </span>
              )}
            </div>
            {lead && (
              <p
                className="on-photo-dark mt-3 max-w-[58ch] text-sm sm:text-base"
                style={{ color: "var(--color-on-night-muted)" }}
              >
                {lead}
              </p>
            )}
          </div>
          {actions && (
            <div
              className="reveal flex flex-wrap items-center gap-2"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {actions}
            </div>
          )}
        </div>
        {children && (
          <div
            className={`reveal ${quietTitle ? "mt-4" : "mt-8"}`}
            style={{ "--i": 2 } as React.CSSProperties}
          >
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Bandın içindeki büyük sayı. Cam bir çipin içinde değil, doğrudan
 * fotoğrafın üstünde — giriş ekranının başlıkları gibi. Aralarını ince bir
 * çizgi ayırıyor.
 */
export function HeroStats({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-y-6 border-t pt-6 sm:flex sm:flex-wrap sm:gap-x-12"
      style={{ borderColor: "oklch(99% 0 0 / 0.18)" }}
    >
      {children}
    </div>
  );
}

export function HeroStat({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  foot?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="label on-photo-dark" style={{ color: "var(--color-on-night-faint)" }}>
        {label}
      </p>
      <p className="on-photo-dark mt-1 flex items-baseline gap-1.5">
        <span className="display tnum text-2xl lg:text-3xl" style={{ color: "var(--color-on-night)" }}>
          {value}
        </span>
        {unit && (
          <span className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            {unit}
          </span>
        )}
      </p>
      {foot && (
        <p className="on-photo-dark mt-0.5 text-xs" style={{ color: "var(--color-on-night-muted)" }}>
          {foot}
        </p>
      )}
    </div>
  );
}

/* --- Başlık ----------------------------------------------------------------- */

/**
 * Ekranın başlığı. Fotoğraf verilirse giriş bandı olarak basılıyor; bütün
 * ekranlar fotoğrafla açılıyor, fotoğrafsız hâl bir ekranın İÇİNDEKİ ikinci
 * düzey başlıklar (ör. sayfanın alt bölümleri) için.
 */
export function PageHeader({
  title,
  lead,
  info,
  actions,
  photo,
  position,
  eyebrow,
  size,
  children,
}: {
  title: string;
  /** Tek satırlık, gerçekten bilgi taşıyan alt metin. Uzun açıklama `info`ya. */
  lead?: string;
  /** Yöntem açıklaması — "?" arkasında durur. */
  info?: React.ReactNode;
  actions?: React.ReactNode;
  photo?: string;
  position?: string;
  eyebrow?: React.ReactNode;
  size?: keyof typeof HERO_HEIGHT;
  children?: React.ReactNode;
}) {
  if (photo) {
    return (
      <Hero
        photo={photo}
        position={position}
        eyebrow={eyebrow}
        title={title}
        lead={lead}
        info={info}
        actions={actions}
        size={size}
      >
        {children}
      </Hero>
    );
  }

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

/* --- Bölüm ------------------------------------------------------------------- */

export function Section({
  title,
  info,
  actions,
  children,
  className = "",
  /** Kart yüzeyi olmadan, düz bölüm olarak. Geniş içerikler (ızgara, tablo) için. */
  bare = false,
  /** Gece karosu: grafikler ve büyük sayılar için koyu zemin. */
  night = false,
}: {
  title?: string;
  info?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bare?: boolean;
  night?: boolean;
}) {
  const surface = bare ? "" : night ? "tile-night p-6 lg:p-8" : "card p-6 lg:p-8";
  return (
    <section className={`${surface} ${className}`}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <div className="flex items-center gap-2">
              <h2
                className="display text-lg lg:text-xl"
                style={night ? { color: "var(--color-on-night)" } : undefined}
              >
                {title}
              </h2>
              {info && (
                <InfoTip label={`${title} hakkında`} onDark={night}>
                  {info}
                </InfoTip>
              )}
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
  onDark = false,
}: {
  children: React.ReactNode;
  label?: string;
  /** Fotoğrafın ya da gece karosunun üstünde. */
  onDark?: boolean;
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
        /* Görünen daire 18px ama DOKUNMA ALANI 38px: `after` ile görünmez bir
           halka. Parmakla 18 piksellik bir hedefe vurmak kumar; daireyi
           büyütmek ise başlığın yanında bir düğme gibi durup metnin önüne
           geçiyordu. */
        className={`after:absolute after:-inset-2.5 after:content-[''] relative grid size-[18px] shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors ${
          onDark
            ? "border-[oklch(99%_0_0_/_0.4)] text-[var(--color-on-night-muted)] hover:border-[oklch(99%_0_0_/_0.8)] hover:text-[var(--color-on-night)]"
            : "border-[var(--color-border-strong)] text-[var(--color-ink-faint)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
        }`}
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
 * ve kendi kademeli açılış gecikmelerini kuruyor.
 */
export function Page({
  children,
  flush = false,
}: {
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={`mx-auto ${CONTENT_WIDTH} ${flush ? "" : "flex flex-col gap-8"}`}>
      {children}
    </div>
  );
}
