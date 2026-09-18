"use client";

/**
 * Gezinme panelinin fotoğraf örtüsü.
 *
 * Çubuğun ARKASINDAN başlıyor: üst bar fotoğrafın devamı. Önce panel çubuğun
 * altından başlıyordu ve bar, koyu fotoğrafın üstünde ayrı bir şerit gibi
 * duruyordu — ekranın en çok sırıtan yeri orasıydı.
 */

import Link from "next/link";
import { Photo } from "@/components/Photo";
import {
  BAR_HEIGHT,
  PANEL_HEIGHT,
  TONES,
  type Href,
  type NavGroup,
} from "@/components/nav/items";

/* --- Fotoğraf örtüsü ve panel --------------------------------------------- */

export function PhotoBackdrop({
  group,
  phase,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  phase: "in" | "out";
  isActive: (href: Href) => boolean;
  onNavigate: () => void;
}) {
  const tone = TONES[group.tone];

  return (
    <div
      className="absolute inset-x-0 top-0 hidden overflow-hidden md:block"
      style={{
        // Çubuğun üstünden başlayıp panelin altında bitiyor: tek yüzey,
        // iki bölge.
        height: `calc(${BAR_HEIGHT} + ${PANEL_HEIGHT})`,
        zIndex: 0,
        background: tone.surface,
        boxShadow: "0 18px 40px -24px oklch(21% 0.014 115 / 0.35)",
        /* Giriş perde gibi: görsel yerinde durur, açığa çıkan bölge yukarıdan
           aşağı büyür. `translateY` denendi ve çubuğun arkasındaki fotoğraf
           kayarken üst kenarda boşluk bırakıyordu.

           Çıkış sönerek: kırpmayı geri sarınca çubuğun arkasındaki fotoğraf
           en son kayboluyor ve o ana kadar açık renkli çubuk yazısı zeminini
           kaybediyordu. Sönme, yazı renginin dönüşüyle aynı anda bitiyor. */
        animation:
          phase === "in"
            ? "curtain-down var(--dur-long) var(--ease-out)"
            : "panel-fade var(--dur-short) var(--ease-out) forwards",
      }}
    >
      {/* --- Fotoğraf: soldan %75'e ------------------------------------------
          Sol kenarda geçiş YOK — görsel ekranın kenarına dayanıyor. Sağda
          panelin %60'ından %85'ine kadar zemine soluyor; kutu panelin %85'i
          olduğu için maske kutu-yerel koordinatta %70.6 ile %100 arasında
          çalışıyor.

          Menü yazısı %50'den başlıyor, yani solmanın ÖNÜNDE — bir bölümü
          tam opak görselin üstünde duruyor. Bilinçli: istenen "yazılar
          fotoğrafın üstünde olsun". Okunurluğu perde değil gölge taşıyor
          (bkz. `.on-photo-*`); perde fotoğrafı örterdi. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: "85%",
          maskImage:
            "linear-gradient(to right, #000 0%, #000 70.6%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, #000 0%, #000 70.6%, transparent 100%)",
        }}
      >
        {/* Kutu tam genişlik ama görsel PERDE ARKASI: üstünde karartma,
            sağında zemine soluş, önünde yazı. 1200 pikselik varyant 1440'lık
            bir ekranda 1,2 kat büyütülüyor ve fark görünmüyor — buna karşılık
            aynı kare panonun bölüm karolarında da kullanılıyor, yani dosya
            zaten önbellekte: panel sıfır bayta açılıyor.

            Retina ve 1600 üstü ekranlarda tam boy iniyor. */}
        <Photo
          slug={group.photo}
          fill
          sizes="(min-width: 1600px) 100vw, 1200px"
          className="size-full"
        />
      </div>

      {/* --- Menü: ekranın yarısından sonra, alt alta --------------------- */}
      <div
        className="absolute inset-y-0 right-0 left-1/2 flex flex-col justify-center pr-8 pl-6 xl:pr-16"
        style={{ paddingTop: BAR_HEIGHT }}
      >
        <p className={`label ${tone.shadow}`} style={{ color: tone.label }}>
          {group.title}
        </p>

        {/* Çerçevesiz: kutu, kenarlık, zemin yok — yalnızca tıklanabilir
            yazı. Kutulu bir liste fotoğrafın yanında ikinci bir yüzey
            kuruyor ve "fotoğraf baskın" fikrini bozuyordu. */}
        <ul className="mt-2 flex flex-col gap-0.5">
          {group.items.map((item, index) => {
            const active = isActive(item.href);
            return (
              <li
                key={String(item.href)}
                className="reveal"
                style={{ ["--i" as string]: index }}
              >
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`photo-link display ${tone.shadow} inline-block py-1 text-2xl leading-tight tracking-tight`}
                  style={{ color: tone.title }}
                >
                  {item.label}
                  <span aria-hidden className="rule" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
