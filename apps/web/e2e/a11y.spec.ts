import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Erişilebilirlik denetimi — axe.
 *
 * `design-rules` dosyası projenin KENDİ kurallarını sayıyor (volt bütçesi,
 * kontrast, dokunma alanı). Bu dosya ise WCAG'in sayılabilir kısmını: eksik
 * ad, yanlış rol, bozuk başlık sırası, form etiketi olmayan alan, aynı
 * `id`'den iki tane.
 *
 * Otomatik tarama erişilebilirliğin tamamını ölçmüyor — klavyeyle gezinme ve
 * ekran okuyucu akışı ayrı testlerde (`smoke`, `design-rules`). Ama bu
 * kategorideki hatalar elle bakarken GÖRÜNMÜYOR: ekran gayet düzgün duruyor,
 * yalnızca ekran okuyucu kullanan kişi için bozuk.
 */

const SCREENS = [
  "/",
  "/workout",
  "/nutrition",
  "/body",
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
  "/onboarding",
] as const;

const PUBLIC_SCREENS = ["/login", "/forgot-password"] as const;

/** WCAG 2.1 A ve AA. Deneysel kurallar dışarıda: yanlış alarm üretiyorlar. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Kontrast BU TARAMADA kapalı.
 *
 * İki sebep: (1) projenin kendi kontrast taraması `design-rules` içinde ve
 * oklch renkleri tuvale çizerek çözüyor; (2) bant yazıları fotoğrafın
 * üstünde duruyor, axe oradaki zemini bilemediği için her bantta "belirsiz"
 * dönüyor ve gerçek bulguları gömüyor.
 */
async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).disableRules(["color-contrast"]).analyze();
}

function report(violations: Awaited<ReturnType<typeof scan>>["violations"]): string {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join("\n    ")}`,
    )
    .join("\n  ");
}

async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.describe("erişilebilirlik", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  for (const path of SCREENS) {
    test(`${path} — axe ihlali yok`, async ({ page }) => {
      await openScreen(page, path);
      const { violations } = await scan(page);
      expect(violations.length, `\n  ${report(violations)}`).toBe(0);
    });
  }
});

test.describe("erişilebilirlik — oturumsuz ekranlar", () => {
  for (const path of PUBLIC_SCREENS) {
    test(`${path} — axe ihlali yok`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const { violations } = await scan(page);
      expect(violations.length, `\n  ${report(violations)}`).toBe(0);
    });
  }
});

/**
 * Açılan katmanlar ayrı taranıyor.
 *
 * Panel, çekmece ve alt sayfa varsayılan taramada DOM'da bile değil; oysa
 * erişilebilirlik hatalarının çıkmaya en meyilli olduğu yer tam olarak
 * burası — odak, rol ve ad orada elle kuruluyor.
 */
test.describe("erişilebilirlik — açılan katmanlar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("gezinme paneli", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, "dokunmatikte hover yok");
    await openScreen(page, "/");
    await page
      .getByRole("navigation", { name: "Ana gezinme" })
      .getByRole("link", { name: "Antrenman", exact: true })
      .hover();
    await expect(page.locator("header").getByRole("link", { name: /^Programlar/ })).toBeVisible();
    const { violations } = await scan(page);
    expect(violations.length, `\n  ${report(violations)}`).toBe(0);
  });

  test("alt sayfa (Sheet)", async ({ page }) => {
    /* Alt sayfa `<body>`ye portal ediliyor, yani `main` taramasının dışında
       kalıyor. Rol, ad ve odak orada elle kuruluyor. */
    await openScreen(page, "/soreness");
    await page.getByRole("button", { name: "Sakatlık ekle" }).click();
    await expect(page.getByRole("dialog", { name: "Sakatlık ekle" })).toBeVisible();
    const { violations } = await scan(page);
    expect(violations.length, `\n  ${report(violations)}`).toBe(0);
  });

  test("telefon çekmecesi", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 768, "çekmece yalnızca dar ekranda");
    await openScreen(page, "/");
    await page.getByRole("button", { name: "Menüyü aç" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const { violations } = await scan(page);
    expect(violations.length, `\n  ${report(violations)}`).toBe(0);
  });
});
