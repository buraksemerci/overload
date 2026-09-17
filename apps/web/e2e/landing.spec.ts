import { expect, test, type Page } from "@playwright/test";
import { openAuthForm } from "./fixtures";

/**
 * Giriş ekranı (`/login`) — aynı zamanda tanıtım sayfası.
 *
 * Oturumu olmayan herkes buraya düşüyor, yani uygulamanın dış kapısı. İki işi
 * birden yapıyor ve ikisi birbirini engellememeli:
 *
 * * **Anlatmak** — kaydırdıkça bir günün dört ânı geçiyor.
 * * **Girdirmek** — form anlatının vardığı yer, videonun son karesinin
 *   üstünde. Geri gelen kullanıcı tanıtım izlemek istemiyor; üstteki çubuk
 *   her an oraya inen bir yol bırakıyor.
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

    const cta = page.locator("header").getByRole("button", { name: "Giriş yap" });
    await expect(cta).toBeVisible();

    // Anlatının ortasına in: çıkış yolu hâlâ görünür olmalı. Tanıtımı
    // zorunlu tutmak onu tanıtım olmaktan çıkarıp engele çevirirdi.
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await page.waitForTimeout(400);
    await expect(cta).toBeInViewport();
  });

  test("çubuktaki düğme forma iniyor ve form yazılabilir", async ({ page }) => {
    await openAuthForm(page);

    await page.getByLabel("E-posta").fill("deniz@example.com");
    await expect(page.getByLabel("E-posta")).toHaveValue("deniz@example.com");
  });

  test("form anlatının FİNALİNDE, videonun üstünde", async ({ page }) => {
    await openLanding(page);

    // Başta form sahnede ama kapalı: görünmüyor ve klavyeyle odaklanamıyor.
    // Opaklık tek başına yetmezdi — görünmeyen alanlara sekmeyle girilirdi.
    await expect(page.locator("[data-story] #giris")).toHaveCount(1);
    await expect(page.locator("[inert] #giris")).toHaveCount(1);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator("[inert] #giris")).toHaveCount(0);
    await expect(page.getByLabel("E-posta")).toBeInViewport();
    // Video arkada duruyor: form ayrı bir bölüm değil, anlatının sonu.
    await expect(page.locator("[data-story] video")).toBeInViewport();
    // Form ekrandayken çubuk çekiliyor — iki "Giriş yap" yan yana durmasın.
    await expect(page.locator("header")).toHaveCSS("opacity", "0");
  });

  test("finalde anlatı metni formla yarışmıyor", async ({ page }) => {
    await openLanding(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByLabel("E-posta")).toBeInViewport();
    await page.waitForTimeout(700);

    const visibleCaptions = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("[data-story] h2")).filter((element) => {
          const cell = element.closest("[style*='opacity']");
          return (
            cell !== null && !cell.contains(document.querySelector("#giris")) &&
            getComputedStyle(cell).opacity !== "0"
          );
        }).length,
    );
    expect(visibleCaptions).toBe(0);
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
