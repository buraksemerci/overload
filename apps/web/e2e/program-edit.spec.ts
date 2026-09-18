import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Program düzenleyici.
 *
 * Buradaki tek kritik şey şu: ekranda yazan hareket, kayıtlı hareket olmak
 * zorunda. `/exercises` sunucuda varsayılan 50 satır döndürüyor ve programdaki
 * hareket o ellinin dışında kalabiliyor — o durumda `<select>`in değerine
 * karşılık gelen bir seçenek olmuyordu ve tarayıcı listedeki başka bir
 * hareketi gösteriyordu.
 */

const API = "http://localhost:8000";
const PROGRAM_ID = "77777777-7777-7777-7777-777777777777";

/** Kütüphanede OLMAYAN bir hareket. Gerçekte: 50'nin dışında kalmış bir satır. */
const OUTSIDE_LIBRARY = {
  id: "99999999-9999-9999-9999-999999999999",
  exercise_id: "88888888-8888-8888-8888-888888888888",
  exercise_name: "Pendlay Row",
  equipment: "barbell",
  order_index: 0,
  target_sets: 4,
  target_rep_min: 5,
  target_rep_max: 8,
  technique: "rir1",
  superset_group: null,
  rest_seconds: 180,
  notes: null,
  target_percent_1rm: null,
  target_label: "4 × 5-8",
};

const DETAIL = {
  id: PROGRAM_ID,
  name: "Kendi Programım",
  goal: "hypertrophy",
  days_per_week: 2,
  is_active: true,
  is_template: false,
  created_at: "2026-08-01T10:00:00Z",
  days: [
    {
      id: "aaaaaaaa-1111-1111-1111-111111111111",
      order_index: 0,
      label: "Pazartesi — Sırt",
      exercises: [OUTSIDE_LIBRARY],
    },
  ],
};

test.describe("program düzenleyici", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.route(`${API}/programs/${PROGRAM_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DETAIL),
      }),
    );
  });

  test("kütüphanede olmayan hareket kendi adıyla görünüyor", async ({ page }) => {
    await page.goto(`/programs/${PROGRAM_ID}/edit`);

    const select = page.getByLabel("1. hareket");
    await expect(select).toBeVisible();
    // Seçili seçeneğin METNİ. Değeri doğru olup ekranda başka bir ad
    // görünmesi, kullanıcıya yalan söyleyen bir alan demek.
    await expect(select.locator("option:checked")).toHaveText("Pendlay Row");
  });

  test("kütüphanedeki hareketler de seçilebiliyor", async ({ page }) => {
    await page.goto(`/programs/${PROGRAM_ID}/edit`);

    const select = page.getByLabel("1. hareket");
    await select.selectOption({ label: "Barbell Bench Press" });
    await expect(select.locator("option:checked")).toHaveText("Barbell Bench Press");
    // Değişiklik olunca kaydet açılıyor.
    await expect(page.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  });

  test("program adı değiştirilebiliyor", async ({ page }) => {
    /* `PATCH /programs/{id}` baştan vardı; arayüzde yolu yoktu. Gün ağacını
       kaydeden istek (`PUT .../days`) adı taşımıyor, o yüzden ayrı düğme. */
    let patched: Record<string, unknown> | null = null;
    await page.route(`http://localhost:8000/programs/${PROGRAM_ID}`, (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patched = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto(`/programs/${PROGRAM_ID}/edit`);
    await page.getByLabel("Program adı").fill("Üst/Alt 4 Gün");
    await page.getByRole("button", { name: "Adı güncelle" }).click();

    await expect.poll(() => patched).toMatchObject({ name: "Üst/Alt 4 Gün" });
  });

  test("program silme iki adımda soruluyor", async ({ page }) => {
    let deleted = false;
    await page.route(`http://localhost:8000/programs/${PROGRAM_ID}`, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto(`/programs/${PROGRAM_ID}/edit`);
    await page.getByRole("button", { name: "Programı sil" }).click();
    expect(deleted, "tek dokunuşta silinmemeli").toBe(false);
    await page.getByRole("button", { name: "Evet, programı sil" }).click();

    await expect.poll(() => deleted).toBe(true);
    await expect(page).toHaveURL(/\/programs$/);
  });
});
