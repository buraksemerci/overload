import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Uçtan uca duman testleri.
 *
 * Kapsam: oturum kontrolü, gezinme, ekranların gerçek veriyle render'ı ve
 * en kritik akış — antrenman modunda set kaydı.
 */

test.describe("oturum kontrolü", () => {
  test("oturumsuz kullanıcı giriş sayfasına yönlendirilir", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "overload" })).toBeVisible();
  });

  test("giriş sayfasında gezinme çubuğu gösterilmez", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hesap menüsü" })).toHaveCount(0);
  });

  test("kayıt ve giriş arasında geçiş yapılabilir", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Giriş yap" })).toBeVisible();

    await page.getByRole("button", { name: /Hesabın yok mu/ }).click();
    await expect(page.getByRole("button", { name: "Hesap oluştur" })).toBeVisible();
    await expect(page.getByText("Adın (isteğe bağlı)")).toBeVisible();
  });

  test("hatalı giriş anlaşılır bir mesaj gösterir", async ({ page }) => {
    await page.route("http://localhost:8000/auth/jwt/login", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "LOGIN_BAD_CREDENTIALS" }),
      }),
    );

    await page.goto("/login");
    await page.getByLabel("E-posta").fill("yanlis@example.com");
    await page.getByLabel("Şifre").fill("hatalisifre");
    await page.getByRole("button", { name: "Giriş yap" }).click();

    // Ham hata kodu ("LOGIN_BAD_CREDENTIALS") değil, çevrilmiş mesaj görünmeli.
    // NOT: `getByRole("alert")` kullanılmıyor — Next.js kendi rota duyurucusunu
    // (`__next-route-announcer__`) aynı rolle enjekte ediyor ve seçici iki
    // öğeye birden uyuyor.
    await expect(page.getByText("E-posta ya da şifre hatalı.")).toBeVisible();
  });
});

test.describe("oturum açıkken", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("ana panel bugünün antrenmanını tek bir kartta gösterir", async ({ page }) => {
    await page.goto("/");

    // Büyük kart: günün adı ve tek birincil aksiyon.
    await expect(
      page.getByRole("heading", { name: "Pazartesi — Göğüs / Omuz / Triceps", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Antrenmanı başlat" })).toBeVisible();

    // Bağlam göstergeleri: seri ve kalan makro.
    await expect(page.getByText("bu hafta 2/5")).toBeVisible();
    await expect(page.getByText("g protein")).toBeVisible();
  });

  test("panel hareket listesini ve kas haritasını GÖSTERMEZ", async ({ page }) => {
    await page.goto("/");

    // Bu test bir tasarım kararını kilitliyor: panelin sadelik bütçesi bir
    // büyük kart + en fazla üç gösterge. Eski panel bunlara ek olarak bugünün
    // hareket listesini, haftalık hacmi ve mini kas haritasını da gösteriyordu;
    // hepsi doğru veriydi ama hiçbiri "şimdi ne yapayım" sorusuna cevap
    // vermiyordu. Detay kendi ekranlarında duruyor.
    await expect(page.getByText("Plate Loaded Chest Press")).toHaveCount(0);
    await expect(page.getByText("Haftalık kas hacmi")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /vücut kas hacmi haritası/ })).toHaveCount(0);
  });

  test("aktif program yoksa yönlendirici boş durum gösterilir", async ({ page }) => {
    await page.route("http://localhost:8000/workouts/today", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          program_name: null,
          program_day_id: null,
          day_label: null,
          exercises: [],
          active_session_id: null,
          is_deload_suggested: false,
        }),
      }),
    );

    await page.goto("/");
    // Yeni kullanıcının düştüğü yer: ne yapacağını söyleyen tek bir kart.
    await expect(page.getByRole("heading", { name: "Bir program seç", level: 2 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Programlara git" })).toBeVisible();
  });

  test("program var ama bugün hareket yoksa dinlenme günü gösterilir", async ({ page }) => {
    await page.route("http://localhost:8000/workouts/today", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          program_name: "Test Programı",
          program_day_id: null,
          day_label: null,
          exercises: [],
          active_session_id: null,
          is_deload_suggested: false,
        }),
      }),
    );

    await page.goto("/");
    // "Program yok" ile "bugün hareket yok" AYRI durumlar. İkisini birleştirmek
    // kullanıcıyı zaten sahip olduğu programı seçmeye yönlendiriyordu.
    await expect(page.getByRole("heading", { name: "Dinlenme günü", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bir program seç" })).toHaveCount(0);
  });

  test("deload önerisi görünür olur", async ({ page }) => {
    await page.route("http://localhost:8000/workouts/today", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          program_name: "Test",
          program_day_id: null,
          day_label: "Gün 1",
          // Antrenman günü: deload uyarısı asıl burada görünmeli.
          exercises: [
            {
              program_exercise_id: "pe-1",
              exercise_id: "ex-1",
              name: "Squat",
              equipment: "barbell",
              order_index: 0,
              target_sets: 3,
              target_rep_min: 5,
              target_rep_max: 5,
              technique: "straight",
              superset_group: null,
              rest_seconds: 180,
              progression: null,
              last_session_summary: null,
            },
          ],
          active_session_id: null,
          is_deload_suggested: true,
        }),
      }),
    );

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Gün 1", level: 2 })).toBeVisible();
    await expect(page.getByText("Bu hafta deload önerilir")).toBeVisible();
  });

  test("ekranlar arasında gezinilebilir", async ({ page }) => {
    await page.goto("/");

    // Kenar çubuğu etiketleri sayfa başlıklarıyla birebir aynı DEĞİL: menüde
    // gruplar var ("BESLENME" bir başlık, altındaki bağlantı "Günlük"), o
    // yüzden eşleme açıkça yazılıyor.
    //
    // Masaüstünde kenar çubuğu kalıcı; telefonda çekmece olarak açılıyor.
    // Masaüstü çubuğu `md` altında `display:none` olduğu için erişilebilirlik
    // ağacından düşüyor ve rol sorgusu iki öğeye birden uymuyor.
    // Mobil olup olmadığı viewport'tan KESİN olarak biliniyor.
    // Önce `isVisible()` ile sorulıyordu; o çağrı beklemiyor, yani sayfa
    // hidrasyonu tamamlanmadan çağrıldığında düğmeyi bulamıyor ve menü hiç
    // açılmıyordu. `.click()` ise kendisi bekliyor.
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
    const openMenuIfNeeded = async () => {
      if (isMobile) await page.getByRole("button", { name: "Menüyü aç" }).click();
    };

    for (const [navLabel, heading] of [
      ["Günlük", "Beslenme"],
      ["İlerleme", "İlerleme"],
      ["Sohbet", "Asistan"],
    ] as const) {
      await openMenuIfNeeded();
      await page.getByRole("link", { name: navLabel, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("hesap ayarları AI sınırını açıkça yazar", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Hesap Ayarları" })).toBeVisible();
    await expect(page.getByText(/asistanının bu alanlara erişimi yok/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI sınırı" })).toBeVisible();
  });

  test("güç standartları tahmin olduğunu belirtir", async ({ page }) => {
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Güç standartları" })).toBeVisible();
    // 1RM'in tahmin olduğu kullanıcıya söylenmeli — bu bir dürüstlük şartı.
    await expect(page.getByText(/tahmin/i).first()).toBeVisible();
    await expect(page.getByText("Bench Press")).toBeVisible();
  });
});

test.describe("antrenman modu", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  test("seans başlatılır ve set kaydedilir", async ({ page }) => {
    const sessionId = "44444444-4444-4444-4444-444444444444";
    let loggedBody: Record<string, unknown> | null = null;
    // Seans taklidi DURUMLU: başta boş, set kaydedildikten sonra dolu döner.
    // Baştan dolu döndürmek, alanları "zaten kaydedilmiş" sayıp devre dışı
    // bırakıyordu — testin kendisi gerçek akışı engelliyordu.
    const loggedSets: unknown[] = [];

    await page.route("http://localhost:8000/workouts/sessions", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: sessionId,
          program_day_id: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          notes: null,
          is_deload: false,
          sets: [],
        }),
      }),
    );
    const savedSet = {
      id: "55555555-5555-5555-5555-555555555555",
      exercise_id: "33333333-3333-3333-3333-333333333333",
      set_number: 1,
      weight_kg: "42.50",
      reps: 5,
      rir: 1,
      is_warmup: false,
      technique: "rir1",
    };

    await page.route(`http://localhost:8000/workouts/sessions/${sessionId}/sets`, (route) => {
      loggedBody = route.request().postDataJSON();
      loggedSets.push(savedSet);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(savedSet),
      });
    });
    await page.route(`http://localhost:8000/workouts/sessions/${sessionId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: sessionId,
          program_day_id: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          notes: null,
          is_deload: false,
          sets: loggedSets,
        }),
      }),
    );

    await page.goto("/workout");
    await expect(page.getByText("Plate Loaded Chest Press")).toBeVisible();

    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();

    // Motorun mesajı antrenman modunda da görünmeli.
    await expect(page.getByText(/hedef aralığın üstündesin/)).toBeVisible();

    // Virgülle yazılıyor — Türkçe klavyede doğal olan bu; istemci noktaya
    // normalize edip göndermeli.
    await page.getByPlaceholder("kg").first().fill("42,5");
    await page.getByPlaceholder("tekrar").first().fill("5");
    await page.getByPlaceholder("RIR").first().fill("1");

    await page.getByRole("button", { name: "Set 1 tamamlandı" }).click();

    await expect.poll(() => loggedBody).not.toBeNull();
    expect(loggedBody).toMatchObject({ weight_kg: 42.5, reps: 5, rir: 1, set_number: 1 });

    // Dinlenme sayacı otomatik başlamalı.
    await expect(page.getByRole("timer")).toBeVisible();
  });

  test("set girilmeden tamamlama butonu kapalı", async ({ page }) => {
    await page.goto("/workout");
    await expect(page.getByRole("button", { name: "Set 1 tamamlandı" })).toBeDisabled();
  });
});
