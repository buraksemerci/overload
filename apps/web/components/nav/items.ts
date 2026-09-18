/**
 * Gezinmenin içeriği: bölümler, ekranlar ve panel tonları.
 *
 * Kabuk (`AppShell`), telefon çekmecesi ve profil menüsü aynı listeyi
 * okuyor. Veri ayrı durunca bir ekran eklemek tek dosyaya dokunuyor.
 */

import type Link from "next/link";
import {
  IconAche,
  IconBody,
  IconChat,
  IconDumbbell,
  IconHistory,
  IconLibrary,
  IconNutrition,
  IconPanel,
  IconProgram,
  IconProgress,
  IconReport,
  IconScale,
  IconSupplement,
} from "@/components/Icons";

// Next 16 rotaları tipliyor: `href` gelişigüzel bir string olamaz, projede
// gerçekten var olan bir rota olmak zorunda. Bu tip onu `Link`'ten türetiyor,
// yani rota adı yanlış yazılırsa derleme zamanında yakalanıyor.
export type Href = React.ComponentProps<typeof Link>["href"];

export type NavItem = {
  href: Href;
  label: string;
  /** Tek satırlık ne işe yaradığı. Panelde adın altında duruyor. */
  hint: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

export type NavGroup = {
  title: string;
  /** `public/photos/<photo>.jpg`. Yoksa nötr dokuya düşüyor. */
  photo: string;
  /**
   * Panelin zemin tonu. Fotoğrafın kendi rengine göre seçiliyor: görsel
   * sağa doğru bu renge soluyor, yani yanlış ton seçilirse fotoğraf zemine
   * karışmak yerine ondan kopuyor.
   *
   * Kahvaltı karesi aydınlık; onu koyuya soldurmak fotoğrafı kesiyormuş
   * gibi duruyordu. Diğer üçü karanlık salon kareleri.
   */
  tone: "dark" | "light";
  items: readonly NavItem[];
};

/** Zemin ve metin renkleri tona göre. */
export const TONES = {
  dark: {
    surface: "oklch(14% 0.008 115)",
    title: "oklch(99% 0 0)",
    label: "oklch(86% 0.01 115 / 0.75)",
    bar: "oklch(99% 0 0)",
    barDim: "oklch(99% 0 0 / 0.6)",
    divider: "oklch(99% 0 0 / 0.26)",
    shadow: "on-photo-dark",
  },
  light: {
    surface: "oklch(96.5% 0.006 115)",
    title: "oklch(18% 0.014 115)",
    label: "oklch(40% 0.011 115)",
    bar: "oklch(18% 0.014 115)",
    barDim: "oklch(18% 0.014 115 / 0.55)",
    divider: "oklch(18% 0.014 115 / 0.2)",
    shadow: "on-photo-light",
  },
} as const;

/**
 * Panel AYRI BİR SEKME DEĞİL: marka yazısı oraya gidiyor.
 *
 * Neredeyse her sitede logo ana sayfaya gider ve kullanıcı bunu öğrenmek
 * zorunda değil — zaten biliyor. Ayrıca sekme olarak dururken "Panel"
 * diğer dördüyle aynı ağırlıktaydı, oysa o bir bölüm değil giriş noktası.
 *
 * Telefon çekmecesinde yine bir satır olarak duruyor: orada marka yazısı
 * küçük ve dokunma hedefi olarak belirsiz.
 */
export const PANEL: NavItem = {
  href: "/",
  label: "Panel",
  hint: "Bugünün özeti",
  Icon: IconPanel,
};

export const GROUPS: readonly NavGroup[] = [
  {
    title: "Antrenman",
    photo: "app-grip",
    tone: "dark",
    items: [
      { href: "/workout", label: "Bugün", hint: "Set set akış", Icon: IconDumbbell },
      { href: "/programs", label: "Programlar", hint: "Aktif program ve şablonlar", Icon: IconProgram },
      { href: "/exercises", label: "Hareketler", hint: "Kütüphane ve kas eşlemesi", Icon: IconLibrary },
      { href: "/history", label: "Geçmiş", hint: "Tamamlanan antrenmanlar", Icon: IconHistory },
    ],
  },
  {
    title: "Beslenme",
    photo: "app-meal-bar",
    tone: "dark",
    items: [
      { href: "/nutrition", label: "Günlük", hint: "Kalan kalori ve öğünler", Icon: IconNutrition },
      { href: "/supplements", label: "Supplement", hint: "Bugün alınacaklar", Icon: IconSupplement },
    ],
  },
  {
    title: "Vücut",
    photo: "app-body",
    tone: "dark",
    items: [
      { href: "/body", label: "Özet", hint: "Vücudun şu an ne durumda", Icon: IconPanel },
      { href: "/progress", label: "İlerleme", hint: "Güç seviyesi ve rekorlar", Icon: IconProgress },
      { href: "/muscle-map", label: "Kas Haritası", hint: "Haftalık hacim dengesi", Icon: IconBody },
      { href: "/weight", label: "Kilo", hint: "Trend ve hareketli ortalama", Icon: IconScale },
      { href: "/soreness", label: "Ağrı", hint: "Günlük check-in", Icon: IconAche },
    ],
  },
  {
    title: "Asistan",
    photo: "app-review",
    tone: "dark",
    items: [
      { href: "/chat", label: "Sohbet", hint: "Sor, anlat, fotoğraf gönder", Icon: IconChat },
      { href: "/coach", label: "Haftalık Rapor", hint: "Pazartesi değerlendirmesi", Icon: IconReport },
    ],
  },
];

/* Gezinme çubuğunun GÖRÜNMEDİĞİ yollar: oturumu olmayan kişinin geldiği
   ekranlar. Menüyü göstermek, tıklandığında giriş ekranına atan bağlantılar
   sunmak demek olurdu. */

/** Üst çubuğun yüksekliği. Fotoğraf örtüsü bu kadar yukarıdan başlıyor. */
export const BAR_HEIGHT = "4.5rem";

/** Panelin kendi yüksekliği (çubuk hariç). */
export const PANEL_HEIGHT = "clamp(19rem, 40vh, 25rem)";
