import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Backend'in OpenAPI şeması TS tiplerine çevriliyor (bölüm 6.1). Şema
  // değiştiğinde `pnpm gen:types` çalıştırmak gerekir; CI bunu doğrular.
  typedRoutes: true,
  experimental: {
    // Salonda telefon üzerinden kullanılacak: ilk yükleme ne kadar küçükse o kadar iyi.
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
