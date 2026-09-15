import { expect, test, type Page } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * İlerleme ekranı: güç seviyesi, tutarlılık ve kupa rafı.
 *
 * En çok yer tutan iddia rekor listesiyle ilgili: önce hangi harekete ait
 * olduğu yazmıyordu ve aynı hareketin eski rekorları da listedeydi.
 */

const API = "http://localhost:8000";

const RECORDS = [
  {
    exercise_id: "dddddddd-0000-0000-0000-000000000001",
    name: "Barbell Bench Press",
    last_achieved_at: "2026-09-10T19:00:00",
    records: [
      { type: "max_weight", value: "90.00", reps: 5, achieved_at: "2026-09-10T19:00:00" },
      { type: "estimated_1rm", value: "105.00", reps: null, achieved_at: "2026-09-10T19:00:00" },
      { type: "max_reps", value: "12.00", reps: null, achieved_at: "2026-08-01T19:00:00" },
      { type: "session_volume", value: "4200.00", reps: null, achieved_at: "2026-09-10T19:00:00" },
    ],
  },
  {
    exercise_id: "dddddddd-0000-0000-0000-000000000002",
    name: "Barbell Deadlift",
    last_achieved_at: "2026-07-04T19:00:00",
    records: [
      { type: "max_weight", value: "140.00", reps: 3, achieved_at: "2026-07-04T19:00:00" },
    ],
  },
];

async function mockRecords(page: Page, rows: unknown[]): Promise<void> {
  await page.route(`${API}/workouts/records/best`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows),
    }),
  );
}

test.describe("ilerleme", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("güç seviyesi ekranın başlığı", async ({ page }) => {
    await page.goto("/progress");

    // Sayfadaki İLK bölüm güç standartları: "daha güçlü müyüm" sorusu
    // ekranın tek başlığı.
    //
    // `allInnerTexts()[0]` denendi ve kırılgandı: liste henüz bütün
    // başlıklar basılmadan okunabiliyor. Konum karşılaştırması ise iki
    // başlık da görünür olduktan sonra yapılıyor.
    const strength = page.getByRole("heading", { name: "Güç standartları" });
    const consistency = page.getByRole("heading", { name: "Tutarlılık" });
    await expect(strength).toBeVisible();
    await expect(consistency).toBeVisible();

    const top = async (locator: typeof strength) => (await locator.boundingBox())!.y;
    expect(await top(strength)).toBeLessThan(await top(consistency));
  });

  test("1RM tahmini olduğu açıkça yazıyor", async ({ page }) => {
    await page.goto("/progress");
    // Dürüstlük "?" arkasında duruyor ama duruyor: Epley bir tahmin,
    // gerçek tek tekrar testi değil.
    await page.getByRole("button", { name: "Güç standartları hakkında" }).click();
    await expect(page.getByText(/Epley formülüyle tahmin/)).toBeVisible();
  });

  test("bir sonraki seviye adıyla yazılıyor", async ({ page }) => {
    await page.goto("/progress");
    // Ham `advanced` değil, Türkçe etiket — ve "İleri için" değil
    // "İleri seviye için".
    await expect(page.getByText("İleri seviye için 140,0 kg")).toBeVisible();
  });

  test("tahmini vücut ağırlığı olduğunu söylüyor", async ({ page }) => {
    await page.goto("/progress");
    await expect(page.getByText(/Vücut ağırlığı tahmini/)).toBeVisible();
  });
});

test.describe("kişisel rekorlar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("her rekor hareket adıyla birlikte", async ({ page }) => {
    // Eski liste "En ağır set / En ağır set / Tahmini 1RM" diyordu; hangi
    // harekete ait olduğu hiç yazmıyordu.
    await mockRecords(page, RECORDS);
    await page.goto("/progress");

    await expect(page.getByText("Barbell Bench Press")).toBeVisible();
    await expect(page.getByText("Barbell Deadlift")).toBeVisible();
  });

  test("bir hareketin dört türü tek kartta", async ({ page }) => {
    await mockRecords(page, RECORDS);
    await page.goto("/progress");

    const card = page.getByRole("listitem").filter({ hasText: "Barbell Bench Press" });
    await expect(card.getByText("En ağır set")).toBeVisible();
    await expect(card.getByText("Tahmini 1RM")).toBeVisible();
    await expect(card.getByText("En çok tekrar")).toBeVisible();
    await expect(card.getByText("Seans hacmi")).toBeVisible();
  });

  test("en ağır sette tekrar bağlamı da var", async ({ page }) => {
    // "100kg x 1" ile "100kg x 8" aynı rekor değil.
    await mockRecords(page, RECORDS);
    await page.goto("/progress");

    await expect(page.getByText("90,0 kg × 5")).toBeVisible();
  });

  test("tekrar rekoru kg ile yazılmıyor", async ({ page }) => {
    await mockRecords(page, RECORDS);
    await page.goto("/progress");

    const card = page.getByRole("listitem").filter({ hasText: "Barbell Bench Press" });
    // Birim türe göre değişiyor: tekrar rekorunu "kg" ile yazmak saçma olurdu.
    await expect(card.getByText("12 tekrar")).toBeVisible();
  });

  test("hiç rekor yoksa yol gösteren boş durum", async ({ page }) => {
    await mockRecords(page, []);
    await page.goto("/progress");

    await expect(page.getByText("Henüz rekor yok")).toBeVisible();
    await expect(page.getByText(/dört tür rekor takip edilmeye başlar/)).toBeVisible();
  });
});

test.describe("hareket grafiği", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.route(`${API}/exercises**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "eeeeeeee-0000-0000-0000-000000000001",
            name: "Barbell Bench Press",
            equipment: "barbell",
            is_unilateral: false,
            primary_muscles: [],
            secondary_muscles: [],
            owner_id: null,
          },
        ]),
      }),
    );
  });

  test("hareket seçilmeden grafik çizilmiyor", async ({ page }) => {
    await page.goto("/progress");
    await expect(page.getByLabel("Hareket seç")).toBeVisible();
    // Boş bir grafik göstermek yerine hiç göstermemek: tek noktadan eğilim
    // çıkmaz, boş eksen de bilgi taşımaz.
    await expect(page.locator(".recharts-surface")).toHaveCount(0);
  });

  test("hareket seçilince grafik geliyor", async ({ page }) => {
    await page.route(`${API}/progress/exercise/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { date: "2026-08-01", top_weight_kg: "80.00", volume_kg: "1920.00", estimated_1rm: "96.00" },
          { date: "2026-08-08", top_weight_kg: "82.50", volume_kg: "1980.00", estimated_1rm: "99.00" },
        ]),
      }),
    );

    await page.goto("/progress");
    await page.getByLabel("Hareket seç").selectOption({ label: "Barbell Bench Press" });

    await expect(page.locator(".recharts-surface").first()).toBeVisible();
  });
});
