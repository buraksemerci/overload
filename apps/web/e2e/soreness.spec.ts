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

  test("vücutta kasa dokunmak seviye panelini açıyor", async ({ page }) => {
    const posted: Array<Record<string, unknown>> = [];
    await page.route(`${API}/soreness`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posted.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/soreness");
    await page.waitForLoadState("networkidle");

    // Adı bilinmeyen kası listede aramak yerine yerine dokunmak.
    await page
      .getByRole("img", { name: "Ön vücut ağrı haritası" })
      .locator("g", { has: page.locator("title", { hasText: "Göğüs" }) })
      .locator("path")
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "Göğüs" })).toBeVisible();
    await page.getByRole("button", { name: "Belirgin" }).click();

    await expect.poll(() => posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ muscle_group_slug: "chest", level: 3 });
  });

  test("sakatlık eklenip iyileşti diye kapatılıyor", async ({ page }) => {
    /* Sakatlık ağrıdan farklı: haftalarca sürüyor ve antrenman modunda o
       bölgeyi birincil çalıştıran hareketler uyarı alıyor. Uç nokta baştan
       vardı ama arayüzde yolu yoktu — uyarı sistemi beslenemiyordu. */
    let created: Record<string, unknown> | null = null;
    let resolved = false;
    const injury = {
      id: "i1",
      muscle_group_slug: "chest",
      muscle_group_name: "Göğüs",
      description: "Sıkışma hissi; bench press ağrıtıyor",
      started_on: "2026-09-10",
      resolved_on: null,
      is_active: true,
    };

    await page.route(`${API}/injuries`, (route) => {
      if (route.request().method() === "POST") {
        created = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(injury) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(created === null ? [] : [injury]),
      });
    });
    await page.route(`${API}/injuries/i1/resolve`, (route) => {
      resolved = true;
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/soreness");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Sakatlık ekle" }).click();
    await page.getByLabel("Ne oldu?").fill("Sıkışma hissi; bench press ağrıtıyor");
    await page.getByRole("button", { name: "Sakatlığı kaydet" }).click();

    await expect.poll(() => created).toMatchObject({ muscle_group_slug: "chest" });
    await expect(page.getByText("Sıkışma hissi; bench press ağrıtıyor")).toBeVisible();

    await page.getByRole("button", { name: "İyileşti" }).click();
    await expect.poll(() => resolved).toBe(true);
  });
});
