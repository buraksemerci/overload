import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Kas haritası.
 *
 * İki davranış sabitleniyor:
 *
 * 1. **Sıralama orana göre**, mutlak sete göre değil. Ekranın işi "hangi kas
 *    eksik kaldı" sorusunu yanıtlamak; 13/12 yapılmış bir kas, 3/12 yapılmış
 *    olanın üstünde durursa liste yanlış şeyi söylüyor.
 * 2. **Hedef pencereye göre ölçekleniyor.** 30 günlük görünümde haftalık
 *    hedefi kullanmak her kası "fazla çalışılmış" gösterirdi.
 */

const API = "http://localhost:8000";

test.describe("kas haritası", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("en eksik kas en üstte", async ({ page }) => {
    await page.goto("/muscle-map");
    await page.waitForLoadState("networkidle");

    // Taklit veri: Quadriceps 3/12, Göğüs 10/12, Kanat 13/12.
    const list = page.locator("section").filter({
      has: page.getByRole("heading", { name: "En eksik kaslar" }),
    });
    const names = (await list.locator("li").allTextContents())
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
    expect(names[0]).toContain("Quadriceps");
    expect(names.at(-1)).toContain("Kanat");
  });

  test("pencere değişince hedef de ölçekleniyor", async ({ page }) => {
    await page.goto("/muscle-map");
    await page.waitForLoadState("networkidle");

    // Liste bölümüne kapsamlı: aynı sayı haritadaki SVG `<title>`lerinde de
    // geçiyor ve onlar görünür değil.
    const list = page.locator("section").filter({
      has: page.getByRole("heading", { name: "En eksik kaslar" }),
    });
    await expect(list.getByText("3,0 / 12", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "30 gün" }).click();
    // Haftalık 12'lik hedef 30 günlük pencerede 51 oluyor. Ölçeklenmeseydi
    // aynı 12 kalır ve her kas "fazla çalışılmış" görünürdü.
    await expect(list.getByText("3,0 / 51", { exact: true })).toBeVisible();
  });

  test("zaman aralığı sunucuya gidiyor", async ({ page }) => {
    const windows: string[] = [];
    await page.route(`${API}/workouts/muscle-volume**`, async (route) => {
      windows.push(new URL(route.request().url()).searchParams.get("days") ?? "?");
      return route.fallback();
    });

    await page.goto("/muscle-map");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "14 gün" }).click();

    await expect.poll(() => windows).toContain("14");
  });
});
