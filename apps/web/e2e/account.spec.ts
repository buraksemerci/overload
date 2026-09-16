import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Hesap ekranı.
 *
 * İki şeyi sabitliyor:
 *
 * 1. **Kaydet düğmesi değişiklik olana kadar yok.** Hiçbir şey değişmemişken
 *    duran bir kaydet düğmesi ya yanıltıyor ya da gürültü.
 * 2. **Kilo bu ekrandan değiştirilemiyor.** Yalnızca gösteriliyor; tek bir
 *    sayıyı iki yerden düzenlenebilir yapmak hangisinin doğru olduğunu
 *    belirsizleştirir.
 */

const API = "http://localhost:8000";

test.describe("hesap", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("kaydet çubuğu ancak bir alan değişince beliriyor", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Hesap", level: 1 })).toBeVisible();

    const save = page.getByRole("button", { name: "Kaydet" });
    await expect(save).toHaveCount(0);

    await page.getByLabel("Ad", { exact: true }).fill("Yeni Ad");
    await expect(save).toBeVisible();
    await expect(page.getByText("Kaydedilmemiş değişiklik var")).toBeVisible();

    await page.route(`${API}/users/me`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
        : route.fallback(),
    );
    await save.click();

    await expect(page.getByRole("status")).toHaveText("Kaydedildi");
    // Kaydedilen hâl artık "ilk hâl": düğme geri çekiliyor.
    await expect(save).toHaveCount(0);
  });

  test("geri al formu ilk hâline döndürüyor", async ({ page }) => {
    await page.goto("/account");

    const name = page.getByLabel("Ad", { exact: true });
    await name.fill("Silinecek");
    await page.getByRole("button", { name: "Geri al" }).click();

    await expect(name).toHaveValue("Test Kullanıcı");
    await expect(page.getByRole("button", { name: "Kaydet" })).toHaveCount(0);
  });

  test("son tartı gösteriliyor ama buradan değiştirilemiyor", async ({ page }) => {
    await page.route(`${API}/bodyweight/trend**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { date: "2026-09-10", weight_kg: "80.40", moving_average: "80.50" },
          { date: "2026-09-14", weight_kg: "79.80", moving_average: "80.10" },
        ]),
      }),
    );
    await page.goto("/account");

    // Son kayıt gösteriliyor — ilk değil.
    await expect(page.getByText("79,8")).toBeVisible();
    await expect(page.getByText("14 Eylül")).toBeVisible();
    // Düzenlenebilir bir kilo alanı YOK: kilo Tartı ekranında tutuluyor ve
    // tek bir sayıyı iki yerden düzenlenebilir yapmak hangisinin doğru
    // olduğunu belirsizleştirir.
    await expect(page.getByLabel(/^Kilo/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Tartı geçmişi" })).toBeVisible();
  });

  test("tartı kaydı yokken davet duruyor", async ({ page }) => {
    await page.goto("/account");
    // Boş durum bir davet: sayı yerine oraya götüren bağlantı.
    await expect(page.getByRole("link", { name: "İlk tartını gir" })).toBeVisible();
  });
});

test.describe("AI sınırı", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("bugünün kullanımı sınırıyla birlikte görünüyor", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // Sınırın VARLIĞI gizlenmiyor: sınıra takılan kullanıcı "uygulama bozuldu"
    // sanmamalı.
    await expect(page.getByRole("heading", { name: "AI sınırı" })).toBeVisible();
    await expect(page.getByText("4 / 60")).toBeVisible();
    await expect(page.getByText("12.500 / 300.000")).toBeVisible();
  });

  test("sınır dolunca ne zaman açılacağı yazıyor", async ({ page }) => {
    await page.route(`${API}/users/me/ai-usage`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requests: 60,
          request_limit: 60,
          tokens: 41_000,
          token_limit: 300_000,
        }),
      }),
    );
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // "Kota doldu" tek başına kullanıcıyı çıkmazda bırakıyor.
    await expect(page.getByText(/Yarın sıfırlanıyor/)).toBeVisible();
  });
});

test.describe("e-posta doğrulama uyarısı", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("doğrulanmış hesapta uyarı yok", async ({ page }) => {
    // "Doğrulandı ✓" satırı her gün hesap ekranını açan kişi için bir kez
    // bile işe yaramıyor.
    await page.goto("/account");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("E-posta adresin doğrulanmadı")).toHaveCount(0);
  });

  test("doğrulanmamış hesapta ne kaybedildiği yazıyor", async ({ page }) => {
    await page.route(`${API}/users/me`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "yeni@ornek.test",
          display_name: "Yeni",
          timezone: "Europe/Istanbul",
          is_active: true,
          is_superuser: false,
          is_verified: false,
        }),
      }),
    );
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("E-posta adresin doğrulanmadı")).toBeVisible();
    // Kaybedilen şey ASİSTAN; uygulamanın geri kalanı çalışıyor.
    await expect(page.getByText(/asistan kapalı/)).toBeVisible();
    await expect(page.getByText("yeni@ornek.test").first()).toBeVisible();
  });

  test("tekrar gönder isteği adresi taşıyor", async ({ page }) => {
    await page.route(`${API}/users/me`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "yeni@ornek.test",
          display_name: "Yeni",
          timezone: "Europe/Istanbul",
          is_active: true,
          is_superuser: false,
          is_verified: false,
        }),
      }),
    );
    let body: unknown = null;
    await page.route(`${API}/auth/request-verify-token`, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 202, body: "" });
    });

    await page.goto("/account");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Bağlantıyı tekrar gönder" }).click();

    await expect.poll(() => body).toEqual({ email: "yeni@ornek.test" });
    await expect(page.getByText(/Gelen kutunu kontrol et/)).toBeVisible();
  });
});
