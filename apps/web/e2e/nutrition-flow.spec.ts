import { expect, test, type Page } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Beslenme akışı: gün görünümü ve odaklanmış ekleme paneli.
 *
 * Buradaki iddiaların hepsi kullanıcının istediği davranışlara karşılık
 * geliyor: ekranda o anki öğün olmalı, ekleme üç aşamalı bir panelde
 * yürümeli, miktar değişince makrolar canlı hesaplanmalı ve kayıtlı bir
 * kalem satıra dokunularak düzeltilebilmeli.
 *
 * --------------------------------------------------------------------------
 * SAAT SABİTLENİYOR
 * --------------------------------------------------------------------------
 * Ekranın odaklandığı öğün `new Date()` ile seçiliyor. Testler duvar saatine
 * bırakıldığında gece yarısını geçince kırıldı: 19:00'da odak akşam
 * yemeğindeydi ve yardımcı fonksiyon kahvaltıya geçiyordu, 00:05'te ise odak
 * zaten kahvaltıda olduğu için tıklanacak "Kahvaltı" düğmesi yoktu.
 *
 * `setFixedTime` saati 08:00'e sabitliyor, yani odak her koşuda kahvaltıda.
 * Taklit kayıt da kahvaltıya ait — ikisi birlikte davranışı deterministik
 * kılıyor. `clock.install` KULLANILMIYOR: zamanı tümden dondurunca TanStack
 * Query'nin zamanlayıcıları da duruyor.
 */

const API = "http://localhost:8000";

const OATS = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  name: "Oats, Rolled",
  brand: null,
  source: "usda",
  calories_per_100g: "380.00",
  protein_g: "13.00",
  carbs_g: "67.00",
  fat_g: "7.00",
};

/** Günde tek kalem: 150 g yulaf. Türetilmiş makrolar backend'in verdiği gibi. */
const LOGGED = {
  id: "bbbbbbbb-0000-0000-0000-000000000001",
  date: "2026-09-15",
  meal_type: "breakfast",
  quantity_g: "150.0",
  food: OATS,
  calories: "570.00",
  protein_g: "19.50",
  carbs_g: "100.50",
  fat_g: "10.50",
};

const TARGET = {
  calories: 2400,
  protein_g: 160,
  carbs_g: 280,
  fat_g: 70,
  bmr: 1700,
  tdee: 2400,
  floor_applied: false,
};

/** Odak öğününü belirleyen saat. 08:00 = kahvaltı. */
async function freezeMorning(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-09-15T08:00:00"));
}

/** Gün yanıtını istediğimiz kalemlerle kurar. */
async function mockDay(page: Page, items: Array<typeof LOGGED>): Promise<void> {
  const sum = (key: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
    items.reduce((total, item) => total + Number.parseFloat(item[key]), 0).toFixed(2);

  await page.route(`${API}/nutrition/day**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-09-15",
        items,
        totals: {
          calories: sum("calories"),
          protein_g: sum("protein_g"),
          carbs_g: sum("carbs_g"),
          fat_g: sum("fat_g"),
        },
        target: TARGET,
        remaining: {
          calories: (TARGET.calories - Number.parseFloat(sum("calories"))).toFixed(2),
          protein_g: "0",
          carbs_g: "0",
          fat_g: "0",
        },
      }),
    }),
  );
}

test.describe("beslenme gün görünümü", () => {
  test.beforeEach(async ({ page }) => {
    await freezeMorning(page);
    await signIn(page);
    await mockApi(page);
  });

  test("kalan kalori ekranın merkezinde", async ({ page }) => {
    await mockDay(page, [LOGGED]);
    await page.goto("/nutrition");

    // 2400 - 570 = 1830. Kullanıcının gün içinde sorduğu tek soru bu.
    await expect(page.getByText("1.830", { exact: true })).toBeVisible();
    await expect(page.getByText("kcal kaldı")).toBeVisible();
  });

  test("hedefin üstüne çıkınca fazla olarak yazılıyor", async ({ page }) => {
    // Beş kalem x 570 = 2850 > 2400. Bu bir HATA değil, bilgi: kırmızı değil
    // kehribar, ve sayı mutlak değerle "fazla" diye okunuyor.
    await mockDay(
      page,
      Array.from({ length: 5 }, (_, i) => ({ ...LOGGED, id: `${LOGGED.id}${i}` })),
    );
    await page.goto("/nutrition");

    await expect(page.getByText("kcal fazla")).toBeVisible();
    await expect(page.getByText("450", { exact: true })).toBeVisible();
  });

  test("makroların kalanı bantta görünüyor", async ({ page }) => {
    await mockDay(page, [LOGGED]);
    await page.goto("/nutrition");

    // Önce bir düğmenin arkasındaydı; kalan proteini görmek için bir adım
    // fazladan gerekiyordu. Geniş bantta üçü de görünür.
    for (const label of ["Protein", "Karbonhidrat", "Yağ"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("kayıtlı olmayan öğünler tek satırlık özet", async ({ page }) => {
    await mockDay(page, [LOGGED]);
    await page.goto("/nutrition");

    // Odak kahvaltıda (saat sabit). Dört öğünün tamamı ekranda bir yerde
    // görünüyor ama üçü yalnızca tek satırlık özet olarak.
    for (const label of ["Kahvaltı", "Öğle", "Ara öğün", "Akşam"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("ok tuşları günler arasında geziniyor", async ({ page }) => {
    /* Geçmişe bakarken her gün için küçük bir oka nişan almak gerekiyordu.
       Alanlara yazarken ve panel açıkken kısayol kapalı. */
    await page.goto("/nutrition");
    // Bant başlığında da "Bugün" yazıyor; ölçülen şey gün gezinmesindeki
    // etiket, o yüzden düğmelerin arasındaki metin seçiliyor.
    const label = page.getByRole("button", { name: "Önceki gün" }).locator("+ span");
    await expect(label).toHaveText("Bugün");

    await page.keyboard.press("ArrowLeft");
    await expect(label).toHaveText("Dün");

    await page.keyboard.press("ArrowRight");
    await expect(label).toHaveText("Bugün");
  });

  test("gün gezinmesi bugünden ileriye gitmiyor", async ({ page }) => {
    await mockDay(page, []);
    await page.goto("/nutrition");

    await expect(page.getByRole("button", { name: "Sonraki gün" })).toBeDisabled();
    await page.getByRole("button", { name: "Önceki gün" }).click();
    await expect(page.getByRole("button", { name: "Sonraki gün" })).toBeEnabled();
  });
});

test.describe("besin ekleme paneli", () => {
  test.beforeEach(async ({ page }) => {
    await freezeMorning(page);
    await signIn(page);
    await mockApi(page);
    await mockDay(page, []);
    await page.route(`${API}/foods/search**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([OATS]),
      }),
    );
  });

  /** Ara → seç: teyit aşamasına kadar götürür. */
  async function reachConfirm(page: Page): Promise<void> {
    await page.goto("/nutrition");
    await page.getByRole("button", { name: "Besin ekle" }).click();
    await page.getByLabel("Besin ara").fill("oats");
    await page.getByRole("button", { name: "Ara", exact: true }).click();
    await page.getByRole("button", { name: /Oats, Rolled/ }).click();
    await expect(page.getByRole("dialog", { name: "Miktarı onayla" })).toBeVisible();
  }

  test("üç aşama sırayla yürüyor", async ({ page }) => {
    await page.goto("/nutrition");

    // 1. Panel arama aşamasında açılıyor.
    await page.getByRole("button", { name: "Besin ekle" }).click();
    await expect(page.getByRole("dialog", { name: "Besin ekle" })).toBeVisible();
    await expect(page.getByLabel("Besin ara")).toBeVisible();

    // 2. Sonuçlar — miktar alanı HENÜZ yok.
    await page.getByLabel("Besin ara").fill("oats");
    await page.getByRole("button", { name: "Ara", exact: true }).click();
    await expect(page.getByText("Oats, Rolled")).toBeVisible();
    await expect(page.getByLabel("Miktar", { exact: true })).toBeHidden();

    // 3. Teyit.
    await page.getByRole("button", { name: /Oats, Rolled/ }).click();
    await expect(page.getByLabel("Miktar", { exact: true })).toBeVisible();
  });

  test("makrolar miktarla birlikte canlı hesaplanıyor", async ({ page }) => {
    await reachConfirm(page);
    const dialog = page.getByRole("dialog");

    // 100 g -> 380 kcal.
    await expect(dialog.getByText("380", { exact: true })).toBeVisible();

    // Hazır porsiyon: 250 g -> 950 kcal. Bu satır yanlış porsiyonun
    // KAYDEDİLMEDEN önce fark edilmesini sağlıyor.
    await dialog.getByRole("button", { name: "250 g" }).click();
    await expect(dialog.getByText("950", { exact: true })).toBeVisible();
  });

  test("arttır ve azalt onluk adımlarla", async ({ page }) => {
    await reachConfirm(page);
    const grams = page.getByLabel("Miktar", { exact: true });

    await page.getByRole("button", { name: "10 gram arttır" }).click();
    await expect(grams).toHaveValue("110");
    await page.getByRole("button", { name: "10 gram azalt" }).click();
    await expect(grams).toHaveValue("100");
  });

  test("miktar bir gramın altına düşmüyor", async ({ page }) => {
    await reachConfirm(page);
    await page.getByLabel("Miktar", { exact: true }).fill("5");
    await page.getByRole("button", { name: "10 gram azalt" }).click();
    // Sıfır ve negatif miktar backend'de 422; alan o değere hiç girmiyor.
    await expect(page.getByLabel("Miktar", { exact: true })).toHaveValue("1");
  });

  test("hedefe göre kalan gösteriliyor", async ({ page }) => {
    await reachConfirm(page);
    // 2400 kalan, 100 g yulaf 380 kcal -> 2020.
    await expect(page.getByText(/Ekledikten sonra kalan/)).toBeVisible();
    await expect(page.getByRole("dialog").getByText("2.020")).toBeVisible();
  });

  test("gönderilen gövde seçilen miktar ve öğünü taşıyor", async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route(`${API}/nutrition/log`, async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
    });

    await reachConfirm(page);
    await page.getByRole("dialog").getByRole("button", { name: "200 g" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Öğle" }).click();
    await page.getByRole("button", { name: "Öğüne ekle" }).click();

    await expect.poll(() => body).not.toBeNull();
    expect(body).toMatchObject({
      food_database_entry_id: OATS.id,
      quantity_g: 200,
      meal_type: "lunch",
    });
  });

  test("kaydedildikten sonra panel kapanıyor", async ({ page }) => {
    await page.route(`${API}/nutrition/log`, (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: "{}" }),
    );
    await reachConfirm(page);
    await page.getByRole("button", { name: "Öğüne ekle" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Escape paneli kapatıyor", async ({ page }) => {
    await page.goto("/nutrition");
    await page.getByRole("button", { name: "Besin ekle" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("panel açıkken volt bütçesi aşılmıyor", async ({ page }) => {
    // Kural ekranın her DURUMU için geçerli. Panel açıkken arkadaki ekran da
    // DOM'da duruyor; birincil düğme tek volt dolgu olmalı.
    await reachConfirm(page);

    const count = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--color-accent)";
      document.body.appendChild(probe);
      const volt = getComputedStyle(probe).backgroundColor;
      probe.remove();

      const matches = [...document.querySelectorAll("body *")].filter((el) => {
        if (getComputedStyle(el).backgroundColor !== volt) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 6 && rect.height > 6;
      });
      return matches.filter(
        (el) => !matches.some((other) => other !== el && other.contains(el)),
      ).length;
    });

    expect(count, `panel açıkken ${count} volt dolgu var`).toBeLessThanOrEqual(2);
  });
});

test.describe("kayıtlı kalemi düzenleme", () => {
  test.beforeEach(async ({ page }) => {
    await freezeMorning(page);
    await signIn(page);
    await mockApi(page);
    await mockDay(page, [LOGGED]);
  });

  /** Saat sabit olduğu için odak kahvaltıda ve kalem doğrudan ekranda. */
  async function openLogged(page: Page): Promise<void> {
    await page.goto("/nutrition");
    await page.getByRole("button", { name: /kalemini düzenle/ }).click();
  }

  test("satıra dokunmak aynı paneli düzenleme kipinde açıyor", async ({ page }) => {
    await openLogged(page);

    await expect(page.getByRole("dialog", { name: "Kalemi düzenle" })).toBeVisible();
    // Alanlar KAYITLI değerlerle dolu: düzeltmek için baştan girmek gerekmiyor.
    await expect(page.getByLabel("Miktar", { exact: true })).toHaveValue("150");
    await expect(page.getByRole("button", { name: "Kahvaltı" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("düzenlemede kalan hesabı eski değeri iki kez saymıyor", async ({ page }) => {
    await openLogged(page);
    // Kalan 1830, kalem 570. Aynı miktarla kaydetmek kalanı DEĞİŞTİRMEMELİ:
    // 1830 + 570 - 570 = 1830.
    await expect(page.getByRole("dialog").getByText("1.830")).toBeVisible();
  });

  test("PATCH yalnızca değişen miktarı gönderiyor", async ({ page }) => {
    let method: string | null = null;
    let body: Record<string, unknown> | null = null;
    await page.route(`${API}/nutrition/log/${LOGGED.id}`, async (route) => {
      method = route.request().method();
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await openLogged(page);
    await page.getByLabel("Miktar", { exact: true }).fill("200");
    await page.getByRole("button", { name: "Kaydet" }).click();

    await expect.poll(() => method).toBe("PATCH");
    expect(body).toMatchObject({ quantity_g: 200 });
  });

  test("silme aynı panelden yapılıyor", async ({ page }) => {
    let method: string | null = null;
    await page.route(`${API}/nutrition/log/${LOGGED.id}`, async (route) => {
      method = route.request().method();
      await route.fulfill({ status: 204, body: "" });
    });

    await openLogged(page);
    await page.getByRole("button", { name: "Sil", exact: true }).click();

    await expect.poll(() => method).toBe("DELETE");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
