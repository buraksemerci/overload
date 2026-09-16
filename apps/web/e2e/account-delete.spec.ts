import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Hesap silme.
 *
 * Geri alınamaz bir işlem üç kapının arkasında:
 *
 * 1. Ekranın en altında, kapalı duruyor.
 * 2. Açılınca ne silineceğini açıkça yazıyor.
 * 3. Parola istiyor — "emin misin?" diyen bir kutu, açık bir oturumu ele
 *    geçiren biri için hiçbir engel değil.
 */

const API = "http://localhost:8000";

test.describe("hesap silme", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("varsayılan olarak kapalı", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: "Hesabımı sil" })).toBeVisible();
    // Uyarı ve parola alanı henüz yok.
    await expect(page.getByText("Bu işlem geri alınamaz.")).toHaveCount(0);
    await expect(page.getByLabel("Parolan")).toHaveCount(0);
  });

  test("parola girilmeden silme düğmesi basılamıyor", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Hesabımı sil" }).click();
    await expect(page.getByText("Bu işlem geri alınamaz.")).toBeVisible();

    const confirm = page.getByRole("button", { name: "Hesabı kalıcı olarak sil" });
    await expect(confirm).toBeDisabled();

    await page.getByLabel("Parolan").fill("parolam");
    await expect(confirm).toBeEnabled();
  });

  test("silme isteği parolayı GÖVDEDE gönderiyor", async ({ page }) => {
    let body: unknown = null;
    await page.route(`${API}/users/me`, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      body = route.request().postDataJSON();
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/account");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Hesabımı sil" }).click();
    await page.getByLabel("Parolan").fill("parolam");
    await page.getByRole("button", { name: "Hesabı kalıcı olarak sil" }).click();

    // Sorgu dizesinde DEĞİL: orası sunucu günlüklerine yazılıyor.
    await expect.poll(() => body).toEqual({ password: "parolam" });
    // Silindikten sonra oturum kapanıyor ve giriş ekranına dönülüyor.
    await expect(page).toHaveURL(/\/login$/);
  });

  test("vazgeçmek paneli kapatıyor", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Hesabımı sil" }).click();
    await page.getByRole("button", { name: "Vazgeç" }).click();

    await expect(page.getByText("Bu işlem geri alınamaz.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hesabımı sil" })).toBeVisible();
  });
});
