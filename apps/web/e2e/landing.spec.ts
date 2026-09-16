import { expect, test, type Page } from "@playwright/test";

/**
 * Giriş ekranı (`/login`) — aynı zamanda tanıtım sayfası.
 *
 * Oturumu olmayan herkes buraya düşüyor, yani uygulamanın dış kapısı. İki işi
 * birden yapıyor ve ikisi birbirini engellememeli:
 *
 * * **Anlatmak** — kaydırdıkça bir günün dört ânı geçiyor.
 * * **Girdirmek** — geri gelen kullanıcı tanıtım izlemek istemiyor;
 *   üstteki çubuk her an forma inen bir yol bırakıyor.
 *
 * Anlatı burada oturum İSTEMİYOR: testler `signIn` çağırmıyor.
 */

/**
 * Sayfayı açar ve sahnenin basılmasını bekler.
 *
 * `networkidle` KULLANILMIYOR: video `preload="auto"` ile inmeye devam
 * ediyor ve ağ hiç boşa düşmüyor — bekleme zaman aşımına uğruyordu.
 */
async function openLanding(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.locator("[data-story]")).toBeVisible();
}

test.describe("tanıtım", () => {
  test("anlatı giriş ekranında", async ({ page }) => {
    await openLanding(page);

    await expect(page.locator("main video")).toHaveCount(1);
    // İlk fazın metni sahnede.
    await expect(
      page.getByRole("heading", { name: "Bugün ne yapacağını bilerek gir" }),
    ).toBeVisible();
  });

  test("fazların altında bölüm bağlantısı YOK", async ({ page }) => {
    await openLanding(page);

    // Hesabı olmayan birine `/workout` bağlantısı vermek, tıklandığında onu
    // buraya geri atmak demek. Çağrı bir tane ve formda.
    for (const href of ["/workout", "/programs", "/nutrition", "/progress"]) {
      await expect(page.locator(`main a[href="${href}"]`)).toHaveCount(0);
    }
  });

  test("anlatı ilerledikçe görünen metin ekranda kalıyor", async ({ page }) => {
    await openLanding(page);

    const scene = await page.evaluate(() => {
      const root = document.querySelector("[data-story]");
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
      await page.evaluate(
        (y) => window.scrollTo(0, y),
        scene!.top + scene!.height * fraction,
      );
      await page.waitForTimeout(900);

      const box = await page.evaluate(() => {
        const visible = Array.from(document.querySelectorAll("main h2")).find(
          (element) => {
            const cell = element.closest("[style*='opacity']");
            return cell !== null && getComputedStyle(cell).opacity === "1";
          },
        );
        return visible?.getBoundingClientRect().top ?? null;
      });

      expect(box).not.toBeNull();
      expect(box!).toBeGreaterThan(0);
      expect(box!).toBeLessThan(viewport);
    }
  });

  test("üstteki çubuk kaydırırken kayboluyor değil", async ({ page }) => {
    await openLanding(page);

    const cta = page.getByRole("link", { name: "Giriş yap" });
    await expect(cta).toBeVisible();

    // Anlatının ortasına in: çıkış yolu hâlâ görünür olmalı. Tanıtımı
    // zorunlu tutmak onu tanıtım olmaktan çıkarıp engele çevirirdi.
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await page.waitForTimeout(400);
    await expect(cta).toBeInViewport();
  });

  test("çubuktaki bağlantı forma iniyor", async ({ page }) => {
    await openLanding(page);

    await page.getByRole("link", { name: "Giriş yap" }).click();
    await page.waitForTimeout(600);

    await expect(page.getByLabel("E-posta")).toBeInViewport();
  });

  test("form anlatının SONUNDA", async ({ page }) => {
    await openLanding(page);

    const scene = await page
      .locator("[data-story]")
      .evaluate((element) => element.getBoundingClientRect().bottom);
    const form = await page
      .getByLabel("E-posta")
      .evaluate((element) => element.getBoundingClientRect().top);

    // Önce anlat, sonra iste.
    expect(form).toBeGreaterThan(scene);
  });

  test("hareket azaltmada anlatı düz kartlara düşüyor", async ({ browser }) => {
    // Sıkıştırılmış bir sahnede zorunlu kaydırma, hareket duyarlılığı olan
    // kullanıcı için kullanılamaz bir deneyim. Aynı içerik, kaydırmaya
    // bağlı olmadan.
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await openLanding(page);

    // Sahne yapışkan DEĞİL ve video yok: dört kart alt alta akıyor.
    // (Üstteki çubuk yapışkan kalıyor — o gezinme, anlatı değil.)
    await expect(page.locator("[data-story] .sticky")).toHaveCount(0);
    await expect(page.locator("main video")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Bugün ne yapacağını bilerek gir" }),
    ).toBeVisible();
    // Form yine erişilebilir.
    await expect(page.getByLabel("E-posta")).toBeVisible();

    await context.close();
  });
});
