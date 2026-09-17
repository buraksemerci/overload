import { expect, test } from "@playwright/test";
import { openAuthForm } from "./fixtures";

/**
 * Parola kurtarma ve e-posta doğrulama.
 *
 * Bu akış uzun süre YARIM duruyordu: sunucu token üretiyor ama kimseye
 * göndermiyordu ve token'ın gideceği ekranlar yoktu. Testler üç şeyi
 * sabitliyor:
 *
 * 1. Yanıt, adres kayıtlı olsun olmasın AYNI. Farklı bir şey söylemek, bir
 *    adresin bu uygulamada kayıtlı olup olmadığını dışarıdan öğrenmenin yolu
 *    olurdu.
 * 2. Sıfırlama ekranı parolayı iki kez soruyor — yazdığını göremeyen
 *    kullanıcı yanlış yazarsa hesabına bir daha giremez.
 * 3. Doğrulama sayfa açılır açılmaz kendiliğinden yapılıyor: bağlantıya
 *    tıklamak onayın kendisi.
 */

const API = "http://localhost:8000";

test.describe("parola kurtarma", () => {
  test("giriş ekranından ulaşılıyor", async ({ page }) => {
    await openAuthForm(page);
    await page.getByRole("link", { name: "Parolamı unuttum" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("kayıtlı olmayan adres için de aynı cümle çıkıyor", async ({ page }) => {
    // Sunucu var olmayan adres için de 202 dönüyor; ekran bunu bozmamalı.
    await page.route(`${API}/auth/forgot-password`, (route) =>
      route.fulfill({ status: 202, body: "" }),
    );
    await page.goto("/forgot-password");
    await page.getByLabel("E-posta").fill("yok@ornek.test");
    await page.getByRole("button", { name: "Bağlantıyı gönder" }).click();

    await expect(page.getByText(/Bu adres kayıtlıysa/)).toBeVisible();
  });

  test("sunucu hata dönse bile aynı cümle çıkıyor", async ({ page }) => {
    await page.route(`${API}/auth/forgot-password`, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "böyle bir kullanıcı yok" }),
      }),
    );
    await page.goto("/forgot-password");
    await page.getByLabel("E-posta").fill("yok@ornek.test");
    await page.getByRole("button", { name: "Bağlantıyı gönder" }).click();

    // Sunucunun sızdırdığı ayrıntı ekrana ÇIKMIYOR.
    await expect(page.getByText(/Bu adres kayıtlıysa/)).toBeVisible();
    await expect(page.getByText(/böyle bir kullanıcı yok/)).toHaveCount(0);
  });
});

test.describe("yeni parola", () => {
  test("kodsuz adreste form gösterilmiyor", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Bağlantı geçersiz")).toBeVisible();
    await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveCount(0);
  });

  test("iki parola tutmazsa istek gönderilmiyor", async ({ page }) => {
    let sent = false;
    await page.route(`${API}/auth/reset-password`, (route) => {
      sent = true;
      return route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto("/reset-password?token=abc");
    await page.getByLabel("Yeni parola", { exact: true }).fill("parola-bir");
    await page.getByLabel("Yeni parola (tekrar)").fill("parola-iki");
    await page.getByRole("button", { name: "Parolayı değiştir" }).click();

    await expect(page.getByText("İki parola aynı değil.")).toBeVisible();
    expect(sent).toBe(false);
  });

  test("token ve parola birlikte gönderiliyor", async ({ page }) => {
    let body: unknown = null;
    await page.route(`${API}/auth/reset-password`, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto("/reset-password?token=abc123");
    await page.getByLabel("Yeni parola", { exact: true }).fill("yeni-parola-1");
    await page.getByLabel("Yeni parola (tekrar)").fill("yeni-parola-1");
    await page.getByRole("button", { name: "Parolayı değiştir" }).click();

    await expect.poll(() => body).toEqual({ token: "abc123", password: "yeni-parola-1" });
    // Kendiliğinden yönlendirilmiyor: kullanıcı "oldu" cümlesini görmeli.
    await expect(page.getByText("Parolan değişti")).toBeVisible();
  });

  test("süresi dolmuş kod açıklanıyor", async ({ page }) => {
    await page.route(`${API}/auth/reset-password`, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "RESET_PASSWORD_BAD_TOKEN" }),
      }),
    );

    await page.goto("/reset-password?token=eski");
    await page.getByLabel("Yeni parola", { exact: true }).fill("yeni-parola-1");
    await page.getByLabel("Yeni parola (tekrar)").fill("yeni-parola-1");
    await page.getByRole("button", { name: "Parolayı değiştir" }).click();

    // Ham kod DEĞİL, okunabilir cümle. `getByRole("alert")` kapsamı `main`:
    // Next kendi rota duyurucusuna da `role="alert"` veriyor.
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(/süresi dolmuş/);
    await expect(alert).not.toHaveText(/RESET_PASSWORD/);
  });
});

test.describe("e-posta doğrulama", () => {
  test("sayfa açılır açılmaz doğrulanıyor", async ({ page }) => {
    let calls = 0;
    await page.route(`${API}/auth/verify`, (route) => {
      calls += 1;
      return route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto("/verify?token=tok");
    await expect(page.getByText("E-postan doğrulandı")).toBeVisible();
    // Token TEK KULLANIMLIK: ikinci istek her zaman başarısız olurdu.
    expect(calls).toBe(1);
  });

  test("geçersiz kod ne yapılacağını söylüyor", async ({ page }) => {
    await page.route(`${API}/auth/verify`, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "VERIFY_USER_BAD_TOKEN" }),
      }),
    );

    await page.goto("/verify?token=eski");
    await expect(page.getByText("Doğrulanamadı")).toBeVisible();
    await expect(page.getByText(/yeni bir doğrulama e-postası/)).toBeVisible();
  });
});
