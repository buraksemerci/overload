import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Panel (`/`) — oturumu olan kullanıcının her gün açtığı ekran.
 *
 * Üç blok ve her biri TEK soruya cevap veriyor:
 *
 * 1. Bugün — "şimdi ne yapayım"
 * 2. Son antrenmanlar — "geçen sefer ne yapmıştım"
 * 3. Bölümler — "başka nereye gidebilirim"
 *
 * Anlatı burada DEĞİL. "Bu uygulama ne işe yarıyor" sorusunu buraya gelen
 * kişi aylar önce bir kez sordu; anlatı giriş ekranına taşındı ve testi
 * `e2e/landing.spec.ts` içinde.
 */

const API = "http://localhost:8000";

test.describe("panel", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("kullanıcıyı adıyla karşılıyor", async ({ page }) => {
    await page.goto("/");
    // Taklit kullanıcının adı "Test Kullanıcı". E-posta adresi ad yerine
    // KULLANILMIYOR: "Günaydın, a@b.com" karşılama değil, veritabanı çıktısı.
    await expect(
      page.getByRole("heading", { level: 1, name: /Test Kullanıcı/ }),
    ).toBeVisible();
  });

  test("adı olmayan kullanıcıda selamlama tek başına kalıyor", async ({ page }) => {
    await page.route(`${API}/users/me`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "test@example.com",
          display_name: null,
          timezone: "Europe/Istanbul",
          is_active: true,
          is_superuser: false,
          is_verified: true,
        }),
      }),
    );
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // "Hoş geldin, " diye biten bir cümle, boş bir ada işaret etmekten kötü.
    await expect(heading).not.toHaveText(/,\s*$/);
    await expect(heading).not.toHaveText(/@/);
  });

  test("günün işi kaydırmadan görünüyor", async ({ page }) => {
    await page.goto("/");
    // Her gün gelen kişi için ekranın tamamı bu.
    const hero = page.getByRole("link", { name: "Antrenmanı başlat" });
    await expect(hero).toBeVisible();
    expect((await hero.boundingBox())!.y).toBeLessThan(
      page.viewportSize()!.height,
    );
  });

  test("panelde anlatı YOK", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Video ve yapışkan sahne giriş ekranına taşındı. Panelde kalsaydı her
    // gün açan kişi beş ekran boyu videoyu geçmek zorunda kalırdı.
    await expect(page.locator("main video")).toHaveCount(0);
    await expect(page.locator("main .sticky")).toHaveCount(0);
  });

  test("son antrenmanlar üç satır ve geçmişe bağlanıyor", async ({ page }) => {
    await page.route(`${API}/workouts/history**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          [0, 1, 2].map((index) => ({
            id: `aaaaaaaa-0000-0000-0000-00000000000${index}`,
            day_label: `Gün ${index + 1}`,
            program_name: "5 Günlük Split",
            started_at: `2026-09-${12 + index}T08:00:00Z`,
            completed_at: `2026-09-${12 + index}T09:10:00Z`,
            notes: null,
            is_deload: false,
            duration_min: 70,
            total_sets: 18,
            volume_kg: "4600.00",
            exercises: [],
            records: index === 0 ? [{ type: "max_weight", value: "80.00", reps: 8 }] : [],
          })),
        ),
      }),
    );
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Son antrenmanlar" })).toBeVisible();
    await expect(page.getByText("Gün 1")).toBeVisible();
    await expect(page.getByText("Gün 3")).toBeVisible();
    // Rekor kırılan seans işaretli.
    await expect(page.getByText("REKOR", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tümü" })).toBeVisible();
  });

  test("hiç antrenman yoksa blok tümden yok", async ({ page }) => {
    // Boş bir "henüz antrenman yok" kutusu, üstteki büyük kartın zaten
    // söylediği şeyi tekrar ediyor.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Son antrenmanlar" })).toHaveCount(0);
  });

  test("bölüm kartları dört ana bölüme gidiyor", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Bölümler" })).toBeVisible();
    for (const title of ["Antrenman", "Beslenme", "Vücut", "Asistan"]) {
      await expect(
        page.locator("main").getByText(title, { exact: true }).first(),
      ).toBeVisible();
    }
  });
});
