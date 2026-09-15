import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Tasarım kurallarının mekanik denetimi.
 *
 * Bu dosya görsel bir "güzel mi" testi değil — göze bakmak insanın işi.
 * Burada sayılabilir olan şeyler sayılıyor, çünkü gözden kaçtıklarında
 * sessizce bozuluyorlar ve bozuldukları anda tasarım dağılıyor.
 */

const SCREENS = [
  "/",
  "/workout",
  "/nutrition",
  "/progress",
  "/programs",
  "/exercises",
  "/history",
  "/muscle-map",
  "/weight",
  "/supplements",
  "/soreness",
  "/coach",
  "/chat",
  "/account",
] as const;

/**
 * Sayfadaki volt DOLGULU öğeleri sayar.
 *
 * Yalnızca arka plan rengine bakıyor, SVG `fill`'e bakmıyor: ısı haritası ve
 * grafikler ölçek olarak volt kullanıyor, bunlar aksan bütçesine girmiyor.
 * İç içe geçmiş öğeler bir kez sayılıyor — volt bir düğmenin içindeki volt bir
 * span iki öğe değil.
 */
function countVoltFills(): number {
  const probe = document.createElement("div");
  probe.style.background = "var(--color-accent)";
  document.body.appendChild(probe);
  const volt = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const matches = [...document.querySelectorAll("main *, header *")].filter((el) => {
    if (getComputedStyle(el).backgroundColor !== volt) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 6 && rect.height > 6;
  });

  return matches.filter((el) => !matches.some((other) => other !== el && other.contains(el)))
    .length;
}

/** Zemin üzerinde volt RENKLİ metin — okunmadığı için hiç olmaması gerekiyor. */
function findVoltText(): string[] {
  const probe = document.createElement("div");
  probe.style.color = "var(--color-accent)";
  document.body.appendChild(probe);
  const volt = getComputedStyle(probe).color;
  probe.remove();

  return [...document.querySelectorAll("main *, header *")]
    .filter(
      (el) =>
        getComputedStyle(el).color === volt && (el.textContent ?? "").trim().length > 0,
    )
    .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().slice(0, 30)}`);
}

test.describe("tasarım kuralları", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  for (const path of SCREENS) {
    test(`${path} — en fazla iki volt öğesi`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();

      const count = await page.evaluate(countVoltFills);

      // Volt %90 parlaklıkta bir vurgu rengi. Ekranda iki yerden fazla
      // görününce vurgu olmaktan çıkıp zemin rengine dönüşüyor. Bütçe:
      // o ekranın tek birincil aksiyonu + bir başarı işareti.
      //
      // Bu sınır gerçekten bir kez aşıldı: kas haritasında iki segmentli
      // kontrolün seçili sekmeleri `btn-primary` olduğu için yan yana iki volt
      // dolgu çıkıyordu. Segmentli kontrol kendi nötr desenine taşındı.
      expect(count, `${path} ekranında ${count} volt dolgu var`).toBeLessThanOrEqual(2);
    });
  }

  test("volt hiçbir yerde metin rengi olarak kullanılmıyor", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();

    // Volt kırık beyaz zemin üzerinde ~1.3:1 kontrast veriyor; metin olarak
    // okunmuyor. Görünür olması gereken ince işaretler için `accent-deep` var.
    expect(await page.evaluate(findVoltText)).toEqual([]);
  });
});
