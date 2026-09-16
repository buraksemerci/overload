import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Ağrı ekranı.
 *
 * Kayıt iki adımda: önce hangi kas, sonra hangi seviye. Tek bir listede
 * "kas × 5 seviye" göstermek onlarca düğme demek olurdu.
 *
 * **Sıfır da bir cevap.** Dün ağrıyan bir kasın bugün iyileştiğini kaydetmek,
 * hiç kaydetmemekten farklı — asistan ikisini ayırt edebilmeli.
 */

const API = "http://localhost:8000";

const GROUPS = [
  { id: "g1", slug: "chest", name_tr: "Göğüs", region: "front", svg_id: "m-chest" },
  { id: "g2", slug: "lats", name_tr: "Kanat (Lat)", region: "back", svg_id: "m-lats" },
];

test.describe("ağrı", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.route(`${API}/muscle-groups`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(GROUPS),
      }),
    );
  });

  test("kas seçilip seviye işaretleniyor", async ({ page }) => {
    const posted: Array<Record<string, unknown>> = [];
    await page.route(`${API}/soreness`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posted.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/soreness");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Ağrı işaretle" }).click();
    await page.getByRole("button", { name: "Göğüs" }).click();
    await page.getByRole("button", { name: "Orta" }).click();

    await expect.poll(() => posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ muscle_group_slug: "chest", level: 2 });
  });

  test("sıfır seviyesi de kaydediliyor", async ({ page }) => {
    // "Yok" bir silme değil, bir kayıt: dün ağrıyan kasın bugün iyileştiğini
    // söylemek, hiç bir şey söylememekten farklı.
    const posted: Array<Record<string, unknown>> = [];
    await page.route(`${API}/soreness`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posted.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/soreness");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Ağrı işaretle" }).click();
    await page.getByRole("button", { name: "Kanat (Lat)" }).click();
    await page.getByRole("button", { name: "Yok" }).click();

    await expect.poll(() => posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ muscle_group_slug: "lats", level: 0 });
  });
});
