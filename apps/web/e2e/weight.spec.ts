import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Kilo ekranı.
 *
 * Buradaki kritik şey eksen etiketleri. Grafiğin sol boşluğu NEGATİFTİ ve
 * ekseni sola çekiyordu; sığmayan etiketin ilk karakteri kırpılıyor, "80,7"
 * ekranda "0,7" olarak duruyordu. Sayı yanlış değil, YANLIŞ OKUNUYORdu —
 * bir kilo takip ekranında bundan kötüsü az.
 */

const API = "http://localhost:8000";

/** Yirmi gün: haftalık eğilim 14 günden az veriyle hesaplanmıyor. */
const TREND = Array.from({ length: 20 }, (_, index) => ({
  date: `2026-08-${String(index + 10).padStart(2, "0")}`,
  weight_kg: (80.6 - index * 0.07).toFixed(2),
  moving_average: (80.5 - index * 0.06).toFixed(2),
}));

test.describe("kilo", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.route(`${API}/bodyweight/trend**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TREND),
      }),
    );
  });

  test("eksen etiketleri kırpılmadan okunuyor", async ({ page }) => {
    await page.goto("/weight");
    await page.waitForLoadState("networkidle");

    // SVG `<text>` için `allInnerTexts` boş dönüyor; `textContent` gerekiyor.
    const all = await page
      .locator(".recharts-cartesian-axis-tick-value")
      .allTextContents();

    /* Biçimlendirilmemiş eksen değeri "80.7166666" gibi çıkıyor: hem nokta
       hem altı basamak. Uzun etiket eksenin `width`ine sığmıyor, taşan kısmı
       SVG'nin dışında kalıyor ve KIRPILIYOR — ekranda "0,7" görünüyordu. */
    const raw = all.filter((text) => /\d\.\d/.test(text));
    expect(raw, `biçimlendirilmemiş eksen değeri: ${raw.join(", ")}`).toHaveLength(0);

    // Yatay eksen tarih yazıyor ("11 Ağu"); sayı olanlar dikey eksenin.
    const ticks = all.filter((text) => /^\d+(,\d+)?$/.test(text.trim()));
    expect(ticks, `dikey eksende sayı yok: ${all.join(", ")}`).not.toHaveLength(0);

    for (const tick of ticks) {
      const value = Number(tick.replace(",", "."));
      // Veri 79,3-80,6 aralığında; eksen pay bırakıyor.
      expect(value).toBeGreaterThan(70);
      expect(value).toBeLessThan(90);
    }

    /* Kırpılma METİNDE değil ÇİZİMDE oluyor: `textContent` "80,7" diyor,
       ekranda "0,7" görünüyor çünkü harfler SVG'nin sol kenarının dışına
       taşıyor ve orada kesiliyor. Bu yüzden metni okumak yetmiyor —
       kutuların nerede durduğuna bakmak gerekiyor. */
    const chart = await page.locator(".recharts-wrapper").first().boundingBox();
    expect(chart).not.toBeNull();

    const labels = page.locator(".recharts-cartesian-axis-tick-value");
    for (let index = 0; index < (await labels.count()); index += 1) {
      const text = (await labels.nth(index).textContent()) ?? "";
      if (!/^\d+(,\d+)?$/.test(text.trim())) continue;
      const box = await labels.nth(index).boundingBox();
      expect(box, `"${text}" ölçülemedi`).not.toBeNull();
      expect(box!.x, `"${text}" grafiğin sol kenarından taşıyor`).toBeGreaterThanOrEqual(
        chart!.x - 0.5,
      );
    }

  });

  test("güncel kilo ve haftalık eğilim görünüyor", async ({ page }) => {
    await page.goto("/weight");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("GÜNCEL")).toBeVisible();
    // Son kayıt: 80,6 - 19 × 0,07 = 79,27 → 79,3
    await expect(page.getByText("79,3")).toBeVisible();
    await expect(page.getByText("kg/hafta")).toBeVisible();
  });
});
