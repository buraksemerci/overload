import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Koç raporu.
 *
 * Rapor haftalık ve GECE ÜRETİLİYOR; ekran açıldığında olmayabilir. O
 * durumda "rapor yok" demek yerine bu haftanın canlı sayıları öne geçiyor —
 * eli boş dönmeyen bir ekran.
 *
 * Haftanın ayrıntısı (rekorlar, hedefin altında kalan kaslar) açılır
 * bölümde: her açılışta okunması gereken şey değil.
 */

const API = "http://localhost:8000";

test.describe("koç raporu", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("rapor yokken haftanın sayıları duruyor", async ({ page }) => {
    await page.goto("/coach");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Henüz rapor üretilmedi", { exact: false })).toBeVisible();
    // Sayılar yerinde: ekran eli boş dönmüyor.
    await expect(page.getByText("Seans")).toBeVisible();
    await expect(page.getByText("9.400")).toBeVisible();

    // Kullanıcıya verilemeyecek bir komut satırı talimatı YOK: uygulamayı
    // kullanan kişinin sunucuda komut çalıştırma imkânı yok.
    await expect(page.getByText(/python -m/)).toHaveCount(0);
  });

  test("haftanın ayrıntısı isteğe bağlı açılıyor", async ({ page }) => {
    await page.route(`${API}/coach/current-week`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          metrics: {
            sessions: 4,
            total_sets: 62,
            total_volume_kg: 18400,
            new_records: ["Bench Press — 100 kg"],
            undertrained_muscles: ["Quadriceps"],
          },
          has_report: false,
        }),
      }),
    );
    await page.goto("/coach");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Bench Press — 100 kg")).toHaveCount(0);
    await page.getByRole("button", { name: "Haftanın ayrıntısı" }).click();
    await expect(page.getByText("Bench Press — 100 kg")).toBeVisible();
    await expect(page.getByText("Quadriceps")).toBeVisible();
  });
});
