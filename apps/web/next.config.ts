import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Backend'in OpenAPI şeması TS tiplerine çevriliyor (bölüm 6.1). Şema
  // değiştiğinde `pnpm gen:types` çalıştırmak gerekir; CI bunu doğrular.
  typedRoutes: true,
  // Boş `turbopack` bloğu ZORUNLU, süs değil.
  //
  // Serwist yapılandırmaya bir `webpack` fonksiyonu ekliyor. Next 16'da
  // Turbopack varsayılan ve "webpack config var ama turbopack config yok"
  // durumunu HATA sayıp `next dev`'i tamamen durduruyor. Geliştirmede servis
  // worker zaten `disable` ile kapalı, yani o webpack config hiçbir şey
  // yapmıyor — ama varlığı yeterli.
  //
  // Bu blok "Turbopack'i bilerek kullanıyorum" demek. Üretim derlemesi
  // `--webpack` bayrağıyla koşuyor (Serwist'in gerçekten çalışması için).
  turbopack: {},
  experimental: {
    // Salonda telefon üzerinden kullanılacak: ilk yükleme ne kadar küçükse o kadar iyi.
    optimizePackageImports: ["recharts"],
  },
};

/**
 * NOT — `build` betiği `--webpack` bayrağıyla koşuyor.
 *
 * Next 16'da Turbopack varsayılan, ama Serwist servis worker'ı bir **webpack
 * eklentisi** olarak üretiyor. Turbopack altında eklenti çalışmıyor ve
 * `public/sw.js` hiç oluşmuyor — üstelik hata vermek yerine sessizce
 * atlanabiliyordu, bu yüzden Next 16 bu durumda derlemeyi durduruyor.
 *
 * Geliştirmede Turbopack kullanılmaya devam ediyor (`next dev`): orada servis
 * worker zaten `disable` ile kapalı, dolayısıyla kayıp yok ve dev sunucusu
 * hızlı kalıyor.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Geliştirmede kapalı: servis worker, kod değişikliklerini eski önbellekle
  // gölgeleyip "neden değişmiyor" saatleri yaratıyor.
  disable: process.env.NODE_ENV === "development",
  // Uygulama kabuğu önbelleğe alınıyor; API yanıtları alınmıyor (bkz. app/sw.ts).
  reloadOnOnline: true,
});

export default withSerwist(nextConfig);
