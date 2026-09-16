/**
 * ESLint yapılandırması.
 *
 * --------------------------------------------------------------------------
 * NEDEN VAR
 * --------------------------------------------------------------------------
 * `pnpm lint` uzun süre kırıktı: `next lint` Next 16'da kaldırıldı ve komut
 * "lint" adında bir klasör arıyordu. Tipler `tsc` ile, davranış e2e ile
 * denetleniyordu; arada kalan şeyler — kullanılmayan değişken, eksik hook
 * bağımlılığı, yanlış `<img>` kullanımı — hiçbir yerde yakalanmıyordu.
 *
 * --------------------------------------------------------------------------
 * `<img>` KURALI KAPALI
 * --------------------------------------------------------------------------
 * `@next/next/no-img-element` `next/image` kullanmayı şart koşuyor.
 * `components/Photo.tsx` bilerek düz `<img>` kullanıyor ve gerekçesi o
 * dosyanın başında yazılı: fotoğraflar çalışma zamanında yolla çözülüyor ve
 * **olmayabilirler**; statik içe aktarma eksik dosyada derlemeyi kırıyor.
 * Kuralı orada tek tek susturmak yerine kapatmak, kararın tek bir yerde
 * yazılı kalmasını sağlıyor.
 */

/* Next 16'da `eslint-config-next` DÜZ (flat) yapılandırma dizisi olarak
   geliyor. `FlatCompat` ile sarmalamak gerekmiyor — denendi ve eski şema
   doğrulayıcısı döngüsel yapıya girip patlıyor. */
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/* Yapılandırma dosyaları adsız dışa aktarım uyarısı alıyor. Kural JS
   modüllerinde adlandırılmış dışa aktarımı teşvik ediyor ama bu iki dosyanın
   biçimini araçlar belirliyor: ESLint bir dizi, PostCSS bir nesne bekliyor. */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@next/next/no-img-element": "off",
      // Alt çizgiyle başlayan değişken "bilerek kullanılmıyor" demek —
      // nesne ayrıştırmasında bir alanı dışarıda bırakmanın yolu bu.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["eslint.config.mjs", "postcss.config.mjs", "next.config.*"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
];

export default config;
