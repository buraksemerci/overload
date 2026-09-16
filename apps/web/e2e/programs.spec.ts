import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Programlar ekranı.
 *
 * İki davranış sabitleniyor:
 *
 * 1. **Tek aktif program.** Ekranın tepesindeki kart o an geçerli olan
 *    program; diğerleri açılır bölümün arkasında. Hangi programın geçerli
 *    olduğu belirsizse antrenman ekranı da belirsiz.
 * 2. **Şablon önce KOPYALANIYOR, sonra aktif ediliyor.** Şablonun kendisi
 *    aktif edilseydi kullanıcının düzenlemesi herkesin şablonunu değiştirirdi.
 */

const API = "http://localhost:8000";

const OTHER = {
  id: "55555555-5555-5555-5555-555555555555",
  name: "Üst/Alt Split",
  description: null,
  goal: "hypertrophy",
  level: "intermediate",
  days_per_week: 4,
  is_template: false,
  is_active: false,
  source_name: null,
  source_url: null,
};

const TEMPLATE = {
  id: "66666666-6666-6666-6666-666666666666",
  name: "Başlangıç Full Body",
  description: "Haftada 3 gün",
  goal: "general_fitness",
  level: "beginner",
  days_per_week: 3,
  is_template: true,
  is_active: false,
  source_name: null,
  source_url: null,
};

test.describe("programlar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("aktif program üstte, diğerleri açılır bölümde", async ({ page }) => {
    await page.route(`${API}/programs`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "44444444-4444-4444-4444-444444444444",
            name: "5 Günlük Split",
            description: null,
            goal: "hypertrophy",
            level: "beginner",
            days_per_week: 5,
            is_template: false,
            is_active: true,
            source_name: null,
            source_url: null,
          },
          OTHER,
        ]),
      }),
    );
    await page.goto("/programs");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    await expect(main.getByText("5 Günlük Split").first()).toBeVisible();
    // Diğer program KAPALI: ekran açılınca yalnızca o an geçerli olan görünüyor.
    await expect(main.getByText("Üst/Alt Split")).toHaveCount(0);

    await main.getByRole("button", { name: /Diğer programlarım/ }).click();
    await expect(main.getByText("Üst/Alt Split")).toBeVisible();
  });

  test("şablon başlatınca önce kopya çıkıyor, sonra aktif ediliyor", async ({ page }) => {
    await page.route(`${API}/programs/templates`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([TEMPLATE]),
      }),
    );

    const calls: string[] = [];
    await page.route(`${API}/programs/*/clone`, (route) => {
      calls.push("clone");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...TEMPLATE, id: "77777777-7777-7777-7777-777777777777", is_template: false }),
      });
    });
    await page.route(`${API}/programs/*/activate`, (route) => {
      calls.push(`activate:${new URL(route.request().url()).pathname.split("/")[2]}`);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...TEMPLATE, id: "77777777-7777-7777-7777-777777777777", is_active: true }),
      });
    });

    await page.goto("/programs");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Şablon kütüphanesi" }).click();
    await page.getByRole("button", { name: "Başlat" }).first().click();

    await expect.poll(() => calls).toEqual([
      "clone",
      // Aktif edilen ŞABLON DEĞİL, kopyası. Şablonun kendisi aktif edilseydi
      // kullanıcının düzenlemesi herkesin şablonunu değiştirirdi.
      "activate:77777777-7777-7777-7777-777777777777",
    ]);
  });
});
