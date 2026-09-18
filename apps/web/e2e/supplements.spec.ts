import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Supplement ekranı.
 *
 * Üç durum ayrı tutuluyor: **alındı**, **atlandı**, **dokunulmadı**.
 * Atlamayı kaydetmemek uyum oranını hesaplanamaz kılıyor — boş bırakılan gün
 * "bilinmiyor", atlanan gün ise "alınmadı". Bu yüzden "atladım" da sunucuya
 * gidiyor ve testin işi tam olarak bunu sabitlemek.
 */

const API = "http://localhost:8000";

const row = (
  id: string,
  name: string,
  taken: boolean | null,
  due = true,
) => ({
  supplement: { id, name, dose: "5 g", schedule: "daily", is_active: true },
  taken,
  due_today: due,
});

test.describe("supplement", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.route(`${API}/supplements/today`, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          row("s1", "Kreatin", true),
          row("s2", "D Vitamini", null),
        ]),
      });
    });
  });

  test("sayaç yalnızca cevaplananları sayıyor", async ({ page }) => {
    await page.goto("/supplements");
    await page.waitForLoadState("networkidle");

    // İkisinden biri cevaplanmış: dokunulmamış olan sayılmıyor.
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("atlamak da sunucuya gidiyor", async ({ page }) => {
    const posted: Array<{ url: string; body: unknown }> = [];
    await page.route(`${API}/supplements/*/intake`, (route) => {
      posted.push({
        url: route.request().url(),
        body: route.request().postDataJSON(),
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/supplements");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Atladım" }).nth(1).click();

    await expect.poll(() => posted).toHaveLength(1);
    expect(posted[0]!.url).toContain("/supplements/s2/intake");
    // `taken: false` — kayıt SİLİNMİYOR, "alınmadı" olarak yazılıyor.
    expect(posted[0]!.body).toEqual({ taken: false });
  });

  test("ada dokunmak düzenleme panelini açıyor; doz güncelleniyor", async ({ page }) => {
    /* PATCH ve DELETE uç noktaları baştan vardı; arayüzde yalnızca ekleme
       vardı ve yanlış yazılan bir adı düzeltmenin yolu yoktu. */
    let patched: Record<string, unknown> | null = null;
    await page.route(`${API}/supplements/s1`, (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patched = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "s1", name: "Kreatin", dose: "10 g", schedule: "daily", is_active: true }),
      });
    });

    await page.goto("/supplements");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Kreatin ayarlarını düzenle" }).click();
    const sheet = page.getByRole("dialog", { name: "Kreatin" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Doz").fill("10 g");
    await sheet.getByRole("button", { name: "Kaydet" }).click();

    await expect.poll(() => patched).toMatchObject({ dose: "10 g" });
  });

  test("silme iki adımda soruluyor", async ({ page }) => {
    // Uyum geçmişi de gidiyor: tek dokunuşla olmamalı.
    let deleted = false;
    await page.route(`${API}/supplements/s1`, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/supplements");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Kreatin ayarlarını düzenle" }).click();
    await page.getByRole("button", { name: "Listeden sil" }).click();
    expect(deleted, "tek dokunuşta silinmemeli").toBe(false);

    await page.getByRole("button", { name: "Evet, sil" }).click();
    await expect.poll(() => deleted).toBe(true);
  });
});
