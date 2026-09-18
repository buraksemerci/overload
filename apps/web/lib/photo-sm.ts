/**
 * Küçük varyantı (`<slug>-sm.jpg`) olan kareler.
 *
 * ÜRETİLEN DOSYA — elle düzenlenmiyor: `node scripts/photo-variants.mjs`.
 *
 * `Photo` bileşeni `srcset`i yalnızca buradaki kareler için veriyor. Yeni
 * bir fotoğraf klasöre atılıp betik koşulmadıysa liste dışında kalıyor ve tam
 * boy iniyor — ekran bozulmuyor, sadece dosya büyük oluyor.
 */

export const HAS_SMALL: ReadonlySet<string> = new Set([
  "app-body",
  "app-cable",
  "app-cafe",
  "app-chalk",
  "app-dumbbells",
  "app-entry",
  "app-grip",
  "app-gym-wide",
  "app-machine",
  "app-meal-bar",
  "app-plates",
  "app-review",
  "app-scale",
  "app-shoes",
  "app-squat",
  "app-stretch",
  "app-supplements",
  "story-entry",
  "story-gym",
  "story-meal",
  "story-phone",
]);
