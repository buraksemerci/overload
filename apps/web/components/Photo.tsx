"use client";

/**
 * Fotoğraf yuvası.
 *
 * --------------------------------------------------------------------------
 * NEDEN YUVASI, NEDEN DOĞRUDAN <img>
 * --------------------------------------------------------------------------
 * Fotoğraflar `public/photos/<slug>.jpg` içinde duruyor ve **olmayabilirler**.
 * Bu bileşen dosya yokken de düzgün görünüyor: altında her zaman bir işlem
 * katmanı var ve görsel yüklenemezse yalnızca o katman kalıyor. Yani yeni bir
 * fotoğraf eklemek dosyayı klasöre atmaktan ibaret — kod değişmiyor.
 *
 * `next/image` KULLANILMIYOR. İki sebebi var:
 *
 *   1. Statik içe aktarma (`import hero from "./hero.jpg"`) boyutları ve blur
 *      yer tutucusunu bedavaya veriyor ama dosya **derleme zamanında** var
 *      olmak zorunda. Eksik bir dosya derlemeyi kırıyor; "klasöre at, çalışsın"
 *      özelliği kayboluyor.
 *   2. Runtime `src` ile kullanıldığında optimize edici her istekte devreye
 *      giriyor. Buradaki fotoğraflar elle optimize edilmiş, sabit ve sayıları
 *      az; ek bir katmana ihtiyaç yok.
 *
 * Bedeli: srcset yok. Karşılığı: davranış öngörülebilir ve dosya eklemek
 * kod değişikliği gerektirmiyor. `public/photos/README.md` hangi dosyanın
 * hangi boyutta olması gerektiğini yazıyor.
 *
 * --------------------------------------------------------------------------
 * METİN HER ZAMAN PERDE ÜSTÜNDE
 * --------------------------------------------------------------------------
 * Fotoğraf üstüne yazı konacaksa `scrim` şart. Fotoğrafın açık mı koyu mu
 * olduğu bilinmiyor; perdesiz yazı bazı fotoğraflarda okunuyor, bazılarında
 * kayboluyor. Kural: metin varsa perde var.
 */

import { useState } from "react";

export function Photo({
  slug,
  alt = "",
  ratio = "16 / 9",
  className = "",
  children,
  scrim = false,
  /** Görsel kırpılırken hangi bölge korunacak. İnsan fotoğraflarında üst. */
  position = "center",
}: {
  slug: string;
  /** Dekoratif fotoğrafta BOŞ kalır — ekran okuyucu gereksiz yere okumasın. */
  alt?: string;
  ratio?: string;
  className?: string;
  /** Fotoğrafın üstüne gelen içerik. Varsa `scrim` da açılmalı. */
  children?: React.ReactNode;
  scrim?: boolean;
  position?: string;
}) {
  /**
   * Görsel YÜKLENENE kadar görünmez.
   *
   * `onError` ile gizlemek denendi ve yetmedi: dosya yokken tarayıcı, hata
   * olayı tetiklenene kadar kırık görsel simgesini çiziyor. Bir kartta o
   * simge ekran görüntüsüne bile yakalandı. Tersine çevirmek sorunu tümden
   * kaldırıyor — görsel yalnızca gerçekten yüklendiğinde beliriyor, yoksa
   * altındaki işlem katmanı kalıyor ve hiçbir an kırık bir şey görünmüyor.
   */
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        aspectRatio: ratio,
        // İşlem katmanı: fotoğraf yoksa görünen şey bu. Volt DEĞİL — nötr
        // bir taş dokusu, çünkü volt bütçesi ekran başına bir öğe.
        background:
          "linear-gradient(145deg, var(--color-surface-raised), var(--color-border))",
      }}
    >
      <img
        src={`/photos/${slug}.jpg`}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 size-full object-cover"
        style={{
          objectPosition: position,
          opacity: loaded ? 1 : 0,
          transition: "opacity var(--dur-long) var(--ease-out)",
        }}
      />

      {/* Perde görsel OLMASA DA duruyor. Fotoğraf yokken kaldırmak denendi:
          üstündeki açık renkli yazı nötr dokunun üzerinde zeminsiz kalıyor ve
          okunmuyor. Perde karartınca kart, fotoğrafsız hâlinde de tutarlı
          görünüyor. */}
      {scrim && (
        <div
          aria-hidden
          className="absolute inset-0"
          // Alttan yukarı koyulaşan perde. Nike kartlarındaki yazının
          // okunmasını sağlayan şey tam olarak bu.
          style={{
            background:
              "linear-gradient(to top, oklch(21% 0.014 115 / 0.72) 0%, oklch(21% 0.014 115 / 0.28) 45%, transparent 100%)",
          }}
        />
      )}

      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}
