import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Programı gözden geçir ekranı (Bölüm 4.1).
 *
 * En kritik güvenlik davranışı burada: AI'nın önerdiği program **onaya kadar
 * kaydedilmiyor** ve kullanıcı satır satır düzenleyebiliyor.
 */

const API = "http://localhost:8000";
const ACTION_ID = "66666666-6666-6666-6666-666666666666";

const PROPOSAL = {
  name: "Üst/Alt Split",
  description: "Haftada 4 gün",
  goal: "hypertrophy",
  level: "intermediate",
  rationale: "4 gün ayırabildiğin için üst/alt bölünmesi haftada 2 frekans veriyor.",
  days: [
    {
      label: "Üst Vücut A",
      exercises: [
        {
          exercise_id: "aaaaaaaa-0000-0000-0000-000000000001",
          target_sets: 4,
          target_rep_min: 6,
          target_rep_max: 8,
          technique: "rir1",
          superset_group: null,
          rest_seconds: 150,
          notes: null,
          target_percent_1rm: null,
        },
        {
          exercise_id: "aaaaaaaa-0000-0000-0000-000000000002",
          target_sets: 3,
          target_rep_min: 8,
          target_rep_max: 12,
          technique: "failure",
          superset_group: null,
          rest_seconds: null,
          notes: null,
          target_percent_1rm: null,
        },
      ],
    },
    {
      label: "Alt Vücut A",
      exercises: [
        {
          exercise_id: "aaaaaaaa-0000-0000-0000-000000000003",
          target_sets: 4,
          target_rep_min: 5,
          target_rep_max: 5,
          technique: "straight",
          superset_group: null,
          rest_seconds: 180,
          notes: null,
          target_percent_1rm: 75,
        },
      ],
    },
  ],
};

const LIBRARY = [
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Barbell Bench Press",
    equipment: "barbell",
    is_custom: false,
    is_unilateral: false,
    primary_muscles: ["Göğüs"],
    secondary_muscles: ["Ön Omuz"],
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000002",
    name: "Lat Pulldown",
    equipment: "machine",
    is_custom: false,
    is_unilateral: false,
    primary_muscles: ["Kanat (Lat)"],
    secondary_muscles: [],
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000003",
    name: "Barbell Back Squat",
    equipment: "barbell",
    is_custom: false,
    is_unilateral: false,
    primary_muscles: ["Quadriceps"],
    secondary_muscles: [],
  },
];

test.describe("programı gözden geçir", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.route(`${API}/exercises**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(LIBRARY),
      }),
    );
  });

  async function mockAction(page: Parameters<typeof mockApi>[0], status = "pending") {
    await page.route(`${API}/chat/pending-actions/${ACTION_ID}`, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: ACTION_ID,
          action_type: "propose_program",
          summary: "«Üst/Alt Split» — 2 gün, 3 hareket",
          payload: PROPOSAL,
          status,
          created_at: new Date().toISOString(),
        }),
      });
    });
  }

  test("öneriyi tüm ayrıntısıyla gösterir", async ({ page }) => {
    await mockAction(page);
    await page.goto(`/programs/review/${ACTION_ID}`);

    await expect(page.getByRole("heading", { name: "Programı gözden geçir" })).toBeVisible();

    // Onaya kadar hiçbir şeyin kaydedilmediği açıkça yazmalı.
    await expect(page.getByText(/Onaylayana kadar hiçbir şey/)).toBeVisible();

    // Asistanın gerekçesi görünmeli.
    await expect(page.getByText(/üst\/alt bölünmesi haftada 2 frekans/)).toBeVisible();

    // Günler ve hareketler yüklenmeli.
    await expect(page.getByLabel("1. günün adı")).toHaveValue("Üst Vücut A");
    await expect(page.getByLabel("2. günün adı")).toHaveValue("Alt Vücut A");
    await expect(page.getByText("2 gün · 3 hareket")).toBeVisible();

    // Yüzde tabanlı satır yüzdeyi göstermeli (5/3/1 gibi programlar için kritik).
    await expect(page.getByText(/Antrenman maksimumunun %75/)).toBeVisible();
  });

  test("düzenleme kaydedilmeden onaylanamaz", async ({ page }) => {
    await mockAction(page);
    await page.goto(`/programs/review/${ACTION_ID}`);

    const approve = page.getByRole("button", { name: "Onayla ve kaydet" });
    await expect(approve).toBeEnabled();

    // Bir alanı değiştir — onay kilitlenmeli, önce kaydetmek gerekmeli.
    await page.getByLabel("Program adı").fill("Kendi Programım");

    await expect(page.getByText(/Kaydedilmemiş düzenlemen var/)).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(page.getByRole("button", { name: "Düzenlemeyi kaydet" })).toBeEnabled();
  });

  test("düzenleme PATCH ile gönderilir, sonra onay açılır", async ({ page }) => {
    await mockAction(page);
    // Dizi kullanılıyor, `let x = null` değil: TypeScript kapanış içindeki
    // atamayı izlemiyor ve değişkeni `never`'a daraltıyor.
    const patched: Array<{ payload?: { name?: string } }> = [];

    await page.route(`${API}/chat/pending-actions/${ACTION_ID}`, (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON() as { payload?: { name?: string } };
        patched.push(body);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: ACTION_ID,
            action_type: "propose_program",
            summary: "«Kendi Programım» — 2 gün, 3 hareket",
            payload: body.payload ?? PROPOSAL,
            status: "pending",
            created_at: new Date().toISOString(),
          }),
        });
      }
      return route.fallback();
    });

    await page.goto(`/programs/review/${ACTION_ID}`);
    await page.getByLabel("Program adı").fill("Kendi Programım");
    await page.getByRole("button", { name: "Düzenlemeyi kaydet" }).click();

    await expect.poll(() => patched.length).toBeGreaterThan(0);
    expect(patched[0]?.payload?.name).toBe("Kendi Programım");
    await expect(page.getByRole("button", { name: "Onayla ve kaydet" })).toBeEnabled();
  });

  test("hareket silinebilir ve sayaç güncellenir", async ({ page }) => {
    await mockAction(page);
    await page.goto(`/programs/review/${ACTION_ID}`);

    await expect(page.getByText("2 gün · 3 hareket")).toBeVisible();
    await page.getByRole("button", { name: "Hareketi sil" }).first().click();
    await expect(page.getByText("2 gün · 2 hareket")).toBeVisible();
  });

  test("çözülmüş öneri düzenlenemez", async ({ page }) => {
    await mockAction(page, "approved");
    await page.goto(`/programs/review/${ACTION_ID}`);

    await expect(page.getByText(/artık.*düzenlenemez/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Onayla ve kaydet" })).toHaveCount(0);
  });
});
