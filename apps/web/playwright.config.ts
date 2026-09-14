import { defineConfig, devices } from "@playwright/test";

/**
 * Uçtan uca test yapılandırması.
 *
 * **Backend taklit ediliyor (route mocking), gerçek API çağrılmıyor.**
 * Gerekçe: bu testlerin işi frontend'in uçtan uca davranışını doğrulamak —
 * yönlendirme, oturum kontrolü, form akışları, hata durumları. Gerçek bir
 * Postgres + FastAPI ayağa kaldırmak testleri yavaşlatır, CI'ı kırılgan yapar
 * ve backend'in kendi 357 testinin zaten kapsadığı şeyi tekrarlar.
 *
 * Sözleşme kayması riski şuradan kapatılıyor: taklit yanıtlar OpenAPI'den
 * üretilen tiplerle yazılıyor, şema değişirse `pnpm typecheck` kırılıyor.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Salonda telefon kullanılacak; varsayılan görünüm mobil.
    ...devices["Pixel 7"],
  },

  projects: [
    { name: "mobil", use: { ...devices["Pixel 7"] } },
    { name: "masaüstü", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    // Üretim derlemesi test ediliyor: dev sunucusundaki React Strict Mode
    // çift render'ı ve kaynak haritaları gerçek davranışı gölgeliyor.
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
