import { expect, test, type Page, type Request } from "@playwright/test";
import type { Me } from "../lib/auth";
import { ME, mockApi, openAuthForm, signIn } from "./fixtures";

/**
 * Tanışma akışı.
 *
 * Sabitlenen davranışlar:
 *
 * 1. Akışı bitirmemiş kullanıcı panele değil akışa gidiyor — ve bitirdikten
 *    sonra bir daha gönderilmiyor.
 * 2. Gönderilen gövde DOĞRU: aktivite katsayısı iki cevaptan türetiliyor,
 *    virgüllü kilo okunuyor, atlanan adım profildeki değeri SİLMİYOR.
 * 3. Sonuç ekranı sunucunun sayısını gösteriyor ve önerilen programla
 *    başlatmak programı kopyalayıp etkinleştiriyor.
 */

const API = "http://localhost:8000";

const TEMPLATES = [
  {
    id: "77777777-7777-7777-7777-777777777771",
    name: "Reddit PPL",
    description: null,
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 3,
    is_template: true,
    is_active: false,
    source_name: null,
    source_url: null,
  },
  {
    id: "77777777-7777-7777-7777-777777777772",
    name: "Greg Nuckols 3x",
    description: null,
    goal: "strength",
    level: "beginner",
    days_per_week: 3,
    is_template: true,
    is_active: false,
    source_name: null,
    source_url: null,
  },
];

const TARGET = {
  calories: 1840,
  protein_g: 120,
  carbs_g: 190,
  fat_g: 62,
  bmr: 1390,
  tdee: 2300,
  floor_applied: false,
};

/**
 * Akışı bitirmemiş bir kullanıcı kurar.
 *
 * `/users/me` akış gönderilince "bitti" dönmeye başlıyor — gerçek sunucu
 * gibi. Yoksa panele geçen kullanıcı kapıdan akışa geri atılır ve test
 * yanlış bir hatayı yakalardı.
 */
async function setUp(page: Page, profile: Partial<Me> = {}) {
  const sent: Request[] = [];
  let completed = false;

  await signIn(page);
  await mockApi(page);
  await page.route(`${API}/users/me`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...ME,
        ...profile,
        onboarding_completed_at: completed ? "2026-09-17T10:00:00Z" : null,
      }),
    }),
  );
  await page.route(`${API}/users/me/onboarding`, (route) => {
    sent.push(route.request());
    completed = true;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ completed_at: "2026-09-17T10:00:00Z" }),
    });
  });
  await page.route(`${API}/nutrition/target`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(TARGET) }),
  );
  await page.route(`${API}/programs/templates`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(TEMPLATES) }),
  );
  // Aktif programı olmayan yeni kullanıcı: öneri yalnızca o zaman çıkıyor.
  await page.route(`${API}/programs`, (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );

  return { sent };
}

const next = (page: Page) => page.getByRole("button", { name: /^(Başlayalım|Devam|Bitir)$/ });

test.describe("tanışma akışı", () => {
  test("bitirmemiş kullanıcı panel yerine akışa gidiyor", async ({ page }) => {
    await setUp(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Seni tanıyalım" })).toBeVisible();
    // Akışta gezinme yok: menüdeki ekranların çoğu henüz boş.
    await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toHaveCount(0);
  });

  test("cevaplar doğru gövdeyle gönderiliyor", async ({ page }) => {
    const { sent } = await setUp(page, {
      sex: "unspecified",
      birth_date: null,
      height_cm: null,
      training_experience: null,
      training_goal: null,
      training_days_per_week: null,
      display_name: null,
    });
    await page.goto("/onboarding");
    await next(page).click();

    await page.getByLabel("Adın").fill("Deniz");
    await page.getByRole("button", { name: "Kadın" }).click();
    await page.getByLabel("Doğum tarihi").fill("1995-04-12");
    await next(page).click();

    await page.getByLabel("Boy (cm)").fill("168");
    // Türkçe klavyede ondalık ayırıcı virgül.
    await page.getByLabel("Kilo (kg)").fill("63,5");
    await next(page).click();

    await page.getByRole("button", { name: /Bir yıldan az/ }).click();
    await next(page).click();

    await page.getByRole("button", { name: /^Kas/ }).click();
    await page.getByRole("button", { name: "Haftada 3 gün" }).click();
    await next(page).click();

    await page.getByRole("button", { name: /Çoğunlukla ayakta/ }).click();
    await page.getByRole("button", { name: /Yağ kaybı/ }).click();
    await next(page).click();

    await expect(page.getByRole("heading", { name: "Hazırsın, Deniz." })).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      display_name: "Deniz",
      sex: "female",
      birth_date: "1995-04-12",
      height_cm: 168,
      weight_kg: 63.5,
      // 3 gün = hafif; ayakta geçen gün bir basamak ekliyor.
      activity_level: "moderate",
      training_experience: "under_1y",
      training_goal: "hypertrophy",
      training_days_per_week: 3,
      nutrition_goal: "cut",
    });
  });

  test("sonuç ekranı sunucunun hedefini ve uygun programı gösteriyor", async ({ page }) => {
    await setUp(page, { training_experience: "under_1y", training_goal: "hypertrophy" });
    const cloned: string[] = [];
    const activated: string[] = [];
    await page.route(`${API}/programs/*/clone`, (route) => {
      cloned.push(route.request().url());
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...TEMPLATES[1], id: "88888888-8888-8888-8888-888888888888", days: [] }),
      });
    });
    await page.route(`${API}/programs/*/activate`, (route) => {
      activated.push(route.request().url());
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...TEMPLATES[1], is_active: true }),
      });
    });

    await page.goto("/onboarding");
    await next(page).click();
    // Her adımı olduğu gibi geç — profil tohumdan geliyor.
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Geç" }).click();
    }

    await expect(page.getByText("1.840")).toBeVisible();
    // Bir yıldan az çalışan birine orta seviye PPL önerilmiyor; hedefle
    // örtüşmediği de açıkça söyleniyor.
    await expect(page.getByText("Greg Nuckols 3x")).toBeVisible();
    await expect(page.getByText(/seviyenin üstünde/)).toBeVisible();

    await page.getByRole("button", { name: "Bu programla başla" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(cloned[0]).toContain(TEMPLATES[1]!.id);
    expect(activated[0]).toContain("88888888-8888-8888-8888-888888888888");
  });

  test("atlanan adım profildeki değeri silmiyor", async ({ page }) => {
    // Akıştan önce açılmış hesap: boyu, cinsiyeti ve düzeyi Hesap ekranında
    // girilmiş. Düzey, akışın türeteceği değerden (5 gün = orta) FARKLI.
    const { sent } = await setUp(page, { activity_level: "very_active" });
    await page.goto("/onboarding");
    await next(page).click();
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Geç" }).click();
    }

    await expect(page.getByRole("heading", { name: /^Hazırsın/ })).toBeVisible();
    const body = sent[0]!.postDataJSON();
    expect(body.height_cm).toBe(ME.height_cm);
    expect(body.sex).toBe(ME.sex);
    expect(body.birth_date).toBe(ME.birth_date);
    // Gün içi hareket sorusu atlandı: Hesap ekranında seçilmiş düzey
    // değişmiyor.
    expect(body.activity_level).toBe("very_active");
    // Kilo yazılmadı: bugünün tarihiyle eski bir tartı kaydedilmiyor.
    expect(body.weight_kg).toBeNull();
  });

  test("bitirdikten sonra panele geçiliyor ve geri gönderilmiyor", async ({ page }) => {
    await setUp(page);
    await page.goto("/onboarding");
    await next(page).click();
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Geç" }).click();
    }
    await page.getByRole("button", { name: "Panele geç" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/$/);
  });

  test("yazım hatası gibi duran doğum yılı ilerlemeyi durduruyor", async ({ page }) => {
    await setUp(page, { birth_date: null });
    await page.goto("/onboarding");
    await next(page).click();

    await page.getByLabel("Doğum tarihi").fill("2025-04-12");
    await expect(page.getByText(/Bu tarih geçerli görünmüyor/)).toBeVisible();
    await expect(next(page)).toBeDisabled();
  });

  test("kayıt olan kullanıcı doğrudan akışa gidiyor", async ({ page }) => {
    await mockApi(page);
    await page.route(`${API}/auth/register`, (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(ME) }),
    );
    await page.route(`${API}/auth/jwt/login`, (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ access_token: "yeni", token_type: "bearer" }),
      }),
    );
    await page.route(`${API}/users/me`, (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...ME, onboarding_completed_at: null }),
      }),
    );

    await openAuthForm(page);
    const form = page.locator("#giris");
    await form.getByRole("button", { name: "Kayıt", exact: true }).click();
    await form.getByLabel("E-posta").fill("yeni@example.com");
    await form.getByLabel("Şifre").fill("uzun-bir-parola");
    await form.getByRole("button", { name: "Hesap oluştur" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
