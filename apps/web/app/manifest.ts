import type { MetadataRoute } from "next";

/**
 * PWA manifesti (Bölüm 6.1: "ana ekrana ekle" + offline).
 *
 * `display: "standalone"` — salonda tarayıcı çubuğu ekran alanı yiyor ve
 * yanlışlıkla geri/yenile basmayı kolaylaştırıyor.
 *
 * `orientation` bilerek KİLİTLENMEDİ: telefonu sehpaya yatay koyup set girmek
 * yaygın; dikeye zorlamak kullanıcıyı engellerdi.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "overload — Antrenman & Sağlık",
    short_name: "overload",
    description:
      "Progresif overload merkezli antrenman, beslenme ve sağlık takip sistemi.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#17171A",
    theme_color: "#17171A",
    lang: "tr",
    dir: "ltr",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android ikonu daire/kare maskelerle kırpıyor; maskable sürümde glif
      // merkezdeki güvenli bölgede tutuluyor.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Antrenmana başla",
        short_name: "Antrenman",
        url: "/workout",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Beslenme kaydı",
        short_name: "Beslenme",
        url: "/nutrition",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
