import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Karşılama ekranı: üç katman.
 *
 * 1. Bugün — adla karşılama, o an yapılacak iş, üç gösterge
 * 2. Anlatı — bir günün dört ânı, her biri bir bölüme bağlı
 * 3. Bölümler — dört ana bölüme giden bento kartlar
 *
 * Sıra kasıtlı ve testler onu sabitliyor: her gün gelen kişi kaydırmak
 * zorunda kalmamalı.
 */

test.describe("karşılama", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("kullanıcıyı adıyla karşılıyor", async ({ page }) => {
    await page.goto("/");
    // Taklit kullanıcının adı "Test Kullanıcı". E-posta adresi ad yerine
    // KULLANILMIYOR: "Günaydın, a@b.com" karşılama değil, veritabanı çıktısı.
    await expect(
      page.getByRole("heading", { level: 1, name: /Test Kullanıcı/ }),
    ).toBeVisible();
  });

  test("adı olmayan kullanıcıda selamlama tek başına kalıyor", async ({ page }) => {
    await page.route("http://localhost:8000/users/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "test@example.com",
          display_name: null,
          timezone: "Europe/Istanbul",
          is_active: true,
          is_superuser: false,
          is_verified: true,
        }),
      }),
    );
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // "Hoş geldin, " diye biten bir cümle, boş bir ada işaret etmekten kötü.
    await expect(heading).not.toHaveText(/,\s*$/);
    await expect(heading).not.toHaveText(/@/);
  });

  test("günün işi kaydırmadan görünüyor", async ({ page }) => {
    await page.goto("/");
    // Her gün gelen kişi için ekranın tamamı bu; anlatı ONUN ALTINDA.
    const hero = page.getByRole("link", { name: "Antrenmanı başlat" });
    await expect(hero).toBeVisible();
    expect((await hero.boundingBox())!.y).toBeLessThan(
      page.viewportSize()!.height,
    );
  });

  test("anlatı dört bölüme de bağlanıyor", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Anlatı aynı zamanda gezinme: her fazın altında o bölüme giden bir
    // bağlantı var.
    const main = page.locator("main");
    for (const href of ["/workout", "/programs", "/nutrition", "/progress"]) {
      await expect(main.locator(`a[href="${href}"]`).first()).toHaveCount(1);
    }
  });

  test("bölüm kartları dört ana bölüme gidiyor", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const grid = page.getByRole("heading", { name: "Bölümler" });
    await expect(grid).toBeVisible();
    for (const title of ["Antrenman", "Beslenme", "Vücut", "Asistan"]) {
      await expect(
        page.locator("main").getByText(title, { exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("anlatı ilerledikçe görünen metin ekranda kalıyor", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Kaydırma konumu ANLATI BÖLÜMÜNE göre ölçülüyor, sayfanın tamamına
    // göre değil: üstündeki "bugün" katmanı mobilde daha uzun ve sabit bir
    // yüzde iki ekranda iki farklı sahneye denk geliyor.
    const scene = await page.evaluate(() => {
      const root = document.querySelector("main .sticky")?.parentElement ?? null;
      if (root === null) return null;
      return {
        top: root.getBoundingClientRect().top + window.scrollY,
        height: root.getBoundingClientRect().height,
      };
    });
    expect(scene).not.toBeNull();
    const viewport = page.viewportSize()!.height;

    // Dört metin aynı ızgara hücresini paylaşıyor. Kap ızgara olmazsa alt
    // alta diziliyorlar ve görünür olan ekranın dışına çıkıyor — bir kez
    // öyle oldu ve sahne sessizce yazısız kaldı.
    for (const fraction of [0.1, 0.35, 0.6]) {
      await page.evaluate((y) => window.scrollTo(0, y), scene!.top + scene!.height * fraction);
      await page.waitForTimeout(900);

      const box = await page.evaluate(() => {
        const visible = Array.from(document.querySelectorAll("main h2")).find((element) => {
          const cell = element.closest("[style*='opacity']");
          return cell !== null && getComputedStyle(cell).opacity === "1";
        });
        return visible?.getBoundingClientRect().top ?? null;
      });

      expect(box).not.toBeNull();
      expect(box!).toBeGreaterThan(0);
      expect(box!).toBeLessThan(viewport);
    }
  });

  test("hareket azaltmada anlatı düz kartlara düşüyor", async ({ browser }) => {
    // Sıkıştırılmış bir sahnede zorunlu kaydırma, hareket duyarlılığı olan
    // kullanıcı için kullanılamaz bir deneyim. Aynı içerik, kaydırmaya
    // bağlı olmadan.
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await signIn(page);
    await mockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Sahne `sticky` DEĞİL: dört kart alt alta akıyor.
    await expect(page.locator("main .sticky")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Gün bir kararla başlıyor" }),
    ).toBeVisible();

    await context.close();
  });
});
