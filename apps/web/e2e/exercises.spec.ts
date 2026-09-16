import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Hareket kütüphanesi.
 *
 * Ekran açılınca LİSTE YOK: yalnızca ekipman kartları var. Yüzlerce satırlık
 * bir listeyi ilk ekranda göstermek "az göster, isteyince aç" kuralının tam
 * tersi — kullanıcı önce nereye bakacağını seçiyor.
 */

const API = "http://localhost:8000";

test.describe("hareket kütüphanesi", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("ekran açılınca liste değil ekipman kartları var", async ({ page }) => {
    await page.goto("/exercises");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /Barbell/ })).toBeVisible();
    // Hareket satırı YOK: seçim yapılmadan liste açılmıyor.
    await expect(
      page.getByRole("button", { name: /Barbell Bench Press/ }),
    ).toHaveCount(0);
  });

  test("ekipman kartı listeyi açıyor, ikinci dokunuş kapatıyor", async ({ page }) => {
    await page.goto("/exercises");
    await page.waitForLoadState("networkidle");

    const card = page.getByRole("button", { name: /Barbell/ }).first();
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Barbell Bench Press")).toBeVisible();

    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Barbell Bench Press")).toHaveCount(0);
  });

  test("arama ekipman filtresini es geçiyor", async ({ page }) => {
    // Aramada ekipman filtresi GÖNDERİLMİYOR: kullanıcı bir hareketin adını
    // yazdığında onu bütün kütüphanede arıyor, seçili karta hapsolmuyor.
    const queries: string[] = [];
    await page.route(`${API}/exercises**`, async (route) => {
      queries.push(new URL(route.request().url()).search);
      return route.fallback();
    });

    await page.goto("/exercises");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Barbell/ }).first().click();
    await page.getByLabel("Hareket ara").fill("squat");

    await expect
      .poll(() => queries.some((search) => search.includes("q=squat")))
      .toBe(true);
    const withQuery = queries.filter((search) => search.includes("q=squat"));
    for (const search of withQuery) {
      expect(search).not.toContain("equipment=");
    }
  });
});
