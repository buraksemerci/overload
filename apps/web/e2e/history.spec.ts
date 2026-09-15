import { expect, test, type Page } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Geçmiş ekranı: birikim, aya göre gruplama ve seans detay paneli.
 *
 * Buradaki iddialar ekranın iki işini karşılıyor: yapılan işi TANINABİLİR
 * kılmak (hangi hareket, hangi setler) ve BİRİKİMİ göstermek (kaç seans, kaç
 * ton, hangi günler rekor).
 */

const API = "http://localhost:8000";

function session(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    day_label: "Pazartesi — Göğüs / Omuz",
    program_name: "5 Günlük Split",
    started_at: "2026-09-14T18:00:00",
    completed_at: "2026-09-14T19:05:00",
    notes: null,
    is_deload: false,
    duration_min: 65,
    total_sets: 6,
    volume_kg: "4200.00",
    exercises: [
      {
        exercise_id: "bbbbbbbb-0000-0000-0000-000000000001",
        name: "Barbell Bench Press",
        volume_kg: "2560.00",
        top_weight_kg: "80.00",
        top_reps: 8,
        sets: [
          {
            id: "cccccccc-0000-0000-0000-000000000001",
            set_number: 1,
            weight_kg: "40.00",
            reps: 12,
            rir: null,
            is_warmup: true,
            technique: "straight",
          },
          {
            id: "cccccccc-0000-0000-0000-000000000002",
            set_number: 2,
            weight_kg: "80.00",
            reps: 8,
            rir: 2,
            is_warmup: false,
            technique: "straight",
          },
        ],
      },
    ],
    records: [],
    ...over,
  };
}

async function mockHistory(page: Page, rows: Array<Record<string, unknown>>): Promise<void> {
  await page.route(`${API}/workouts/history**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows),
    }),
  );
}

test.describe("geçmiş", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("hiç antrenman yoksa yol gösteren bir boş durum çıkıyor", async ({ page }) => {
    await mockHistory(page, []);
    await page.goto("/history");

    // "Veri yok" demek kullanıcıyı çıkmaza sokar; burada ne yapacağı yazıyor.
    await expect(page.getByText("Henüz tamamlanmış antrenmanın yok")).toBeVisible();
    await expect(page.getByRole("link", { name: "Antrenmana başla" })).toBeVisible();
  });

  test("tonaj ton cinsinden yazılıyor", async ({ page }) => {
    // "18.400 kg" bir ölçüm, "18,4 ton" bir başarı.
    await mockHistory(page, [
      session({ volume_kg: "10000.00" }),
      session({ id: "aaaaaaaa-0000-0000-0000-000000000002", volume_kg: "8400.00" }),
    ]);
    await page.goto("/history");

    await expect(page.getByText("18,4")).toBeVisible();
    await expect(page.getByText("ton")).toBeVisible();
  });

  test("seanslar aya göre gruplanıyor", async ({ page }) => {
    await mockHistory(page, [
      session(),
      session({
        id: "aaaaaaaa-0000-0000-0000-000000000002",
        started_at: "2026-08-20T18:00:00",
      }),
    ]);
    await page.goto("/history");

    await expect(page.getByRole("heading", { name: "Eylül 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ağustos 2026" })).toBeVisible();
  });

  test("rekor kırılan seans işaretli", async ({ page }) => {
    await mockHistory(page, [
      session({
        records: [
          { exercise_id: "bbbbbbbb-0000-0000-0000-000000000001", type: "max_weight", value: "80.00", reps: 8 },
        ],
      }),
    ]);
    await page.goto("/history");

    await expect(page.getByText("REKOR", { exact: true })).toBeVisible();
  });

  test("birden fazla rekor sayıyla yazılıyor", async ({ page }) => {
    const record = {
      exercise_id: "bbbbbbbb-0000-0000-0000-000000000001",
      type: "max_weight",
      value: "80.00",
      reps: 8,
    };
    await mockHistory(page, [session({ records: [record, { ...record, type: "max_reps" }] })]);
    await page.goto("/history");

    await expect(page.getByText("2 REKOR")).toBeVisible();
  });

  test("deload seansı ayrı işaretle gösteriliyor", async ({ page }) => {
    await mockHistory(page, [session({ is_deload: true })]);
    await page.goto("/history");
    await expect(page.getByText("deload")).toBeVisible();
  });

  test("sıfır dakikalık seansta süre yazılmıyor", async ({ page }) => {
    // Aynı dakika içinde kapatılan seansta "0 dk" bilgi taşımıyor.
    await mockHistory(page, [session({ duration_min: 0 })]);
    await page.goto("/history");

    await expect(page.getByText("1 hareket · 6 set")).toBeVisible();
    await expect(page.getByText("0 dk")).toBeHidden();
  });
});

test.describe("seans detayı", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("satıra dokunmak detay panelini açıyor", async ({ page }) => {
    await mockHistory(page, [session()]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Özetler: set, tonaj, süre.
    await expect(dialog.getByText("4.200")).toBeVisible();
    await expect(dialog.getByText("65")).toBeVisible();
  });

  test("setler HAREKET ADI altında gruplu", async ({ page }) => {
    // Önceki sürümde detay "Set 1 / Set 2 / Set 3" diyordu — hangi harekete
    // ait olduğu yazmadan. Kullanıcının tanıyamadığı kaydın değeri yok.
    await mockHistory(page, [session()]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Barbell Bench Press")).toBeVisible();
    // Zirve set: "o gün ne kaldırdım" sorusunun yanıtı.
    await expect(dialog.getByText("80,0 kg × 8")).toBeVisible();
  });

  test("ısınma seti listede ama işaretli", async ({ page }) => {
    await mockHistory(page, [session()]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();

    await expect(page.getByRole("dialog").getByText(/ısınma/)).toBeVisible();
  });

  test("vücut ağırlığı hareketinde kilo yazılmıyor", async ({ page }) => {
    // "0 kg × 12" saçma olurdu; ağırlık yoksa tekrar sayısı tek başına.
    await mockHistory(page, [
      session({
        exercises: [
          {
            exercise_id: "bbbbbbbb-0000-0000-0000-000000000009",
            name: "Pull-up",
            volume_kg: "0.00",
            top_weight_kg: "0.00",
            top_reps: 12,
            sets: [
              {
                id: "cccccccc-0000-0000-0000-000000000009",
                set_number: 1,
                weight_kg: "0.00",
                reps: 12,
                rir: null,
                is_warmup: false,
                technique: "straight",
              },
            ],
          },
        ],
      }),
    ]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("12 tekrar")).toBeVisible();
    await expect(dialog.getByText("0,0 kg")).toBeHidden();
  });

  test("o gün kırılan rekorlar panelde adlarıyla duruyor", async ({ page }) => {
    await mockHistory(page, [
      session({
        records: [
          { exercise_id: "bbbbbbbb-0000-0000-0000-000000000001", type: "max_weight", value: "80.00", reps: 8 },
        ],
      }),
    ]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("O gün kırılan rekorlar")).toBeVisible();
    // Ham `max_weight` değil, okunabilir ad.
    await expect(dialog.getByText("En ağır set")).toBeVisible();
  });

  test("Escape paneli kapatıyor", async ({ page }) => {
    await mockHistory(page, [session()]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("not varsa panelde görünüyor", async ({ page }) => {
    await mockHistory(page, [session({ notes: "Sol omuzda hafif sıkışma." })]);
    await page.goto("/history");
    await page.getByRole("button", { name: /Pazartesi — Göğüs/ }).click();

    await expect(page.getByText("Sol omuzda hafif sıkışma.")).toBeVisible();
  });
});
