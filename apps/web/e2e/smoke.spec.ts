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
    // Kip seçici ile gönder düğmesi AYRI etiketler taşıyor: ekranda aynı
    // yazının iki kez görünmesi hangisinin seçim hangisinin eylem olduğunu
    // belirsizleştiriyordu.
    await expect(page.getByRole("button", { name: "Giriş yap" })).toBeVisible();

    await page.getByRole("button", { name: "Kayıt", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hesap oluştur" })).toBeVisible();
    // Kayıt kipinde ad alanı açılıyor ve isteğe bağlı olduğu yazıyor.
    await expect(page.getByLabel("Adın")).toBeVisible();
    await expect(page.getByText("İsteğe bağlı.")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Hesap", level: 1 })).toBeVisible();
    // GÖRÜNÜR olmalı — "?" arkasında değil. Bu bir açıklama değil güvence:
    // kullanıcının asistanın neye dokunamadığını görmek için baktığı yer.
    await expect(page.getByText(/asistanının bu alanlara erişimi yok/i)).toBeVisible();
    // Ayrıntı (hangi tool'un var olmadığı) "?" arkasında duruyor.
    await page.getByRole("button", { name: /Hesap nasıl hesaplanıyor/ }).click();
    await expect(page.getByText(/karşılık gelen bir AI tool/i)).toBeVisible();
  });

  test("güç standartları tahmin olduğunu belirtir", async ({ page }) => {
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Güç standartları" })).toBeVisible();
    // 1RM'in tahmin olduğu kullanıcıya söylenmeli — bu bir dürüstlük şartı.
    await expect(page.getByText(/tahmin/i).first()).toBeVisible();
    // `.first()`: hareket adı bu ekranda grafik seçicisinde de geçiyor.
    await expect(page.getByText("Bench Press").first()).toBeVisible();
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

    // Başlamadan önce sahne giriş ekranı: hareket adları değil, günün özeti.
    // Akış tek adımlı olduğu için hareket listesi varsayılan olarak kapalı.
    await expect(page.getByText("1 hareket · 2 set")).toBeVisible();

    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();

    // Sahne ilk sete geçiyor: hangi hareket, kaçıncı set, motorun hedefi.
    await expect(
      page.getByRole("heading", { name: "Plate Loaded Chest Press", level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Set 1 / 2")).toBeVisible();

    // Motorun kararı KISA etiketle duyuruluyor; gerekçenin tamamı "?"
    // arkasında. Tam mesaj üç satır olabiliyor ve akış ekranında o kadar metin
    // okunmuyor — ama gizlenmiş değil, bir dokunuş uzakta.
    await expect(page.getByText("Ağırlık artışı")).toBeVisible();
    await expect(page.getByText(/hedef aralığın üstündesin/)).toHaveCount(0);

    await page.getByRole("button", { name: "Bu hedef nasıl belirlendi" }).click();
    await expect(page.getByText(/hedef aralığın üstündesin/)).toBeVisible();

    // Geçen seansın özeti kısa olduğu için doğrudan görünür kalıyor.
    await expect(page.getByText("Geçen sefer: 40kg x 6 RIR1")).toBeVisible();

    // ALANLAR ÖNCEDEN DOLU. Kullanıcının sorusu "kaç kilo kaldırmalıyım" ve
    // cevabı alana yazılmış hâlde geliyor — işi onaylamak, sıfırdan karar
    // vermek değil. Öneri 42.50 kg x 5; ağırlık Türkçe biçimde virgüllü.
    await expect(page.getByLabel("kg")).toHaveValue("42,5");
    await expect(page.getByLabel("Tekrar")).toHaveValue("5");
    await expect(page.getByLabel("RIR")).toHaveValue("");

    // Virgülle yazılan değer noktaya normalize edilip gönderilmeli.
    await page.getByLabel("kg").fill("45,5");
    await page.getByLabel("RIR").fill("1");
    await page.getByRole("button", { name: "Seti kaydet" }).click();

    await expect.poll(() => loggedBody).not.toBeNull();
    expect(loggedBody).toMatchObject({ weight_kg: 45.5, reps: 5, rir: 1, set_number: 1 });

    // Set kaydedilince dinlenme sayacı ortada büyük görünüyor ve sıradaki set
    // adıyla birlikte duyuruluyor.
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText("Set 2 / 2")).toBeVisible();
  });

  test("tekrar alanı boşsa set kaydedilemez", async ({ page }) => {
    // Alanlar önceden dolu geldiği için düğme açık başlıyor; korumanın
    // çalıştığını görmek için alanı boşaltmak gerekiyor.
    await page.route("http://localhost:8000/workouts/sessions", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "44444444-4444-4444-4444-444444444444",
          program_day_id: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          notes: null,
          is_deload: false,
          sets: [],
        }),
      }),
    );

    await page.goto("/workout");
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();

    const save = page.getByRole("button", { name: "Seti kaydet" });
    await expect(save).toBeEnabled();

    await page.getByLabel("Tekrar").fill("");
    await expect(save).toBeDisabled();
  });

  test("diğer hareketler isteğe bağlı olarak açılıyor", async ({ page }) => {
    await page.goto("/workout");

    // Varsayılan durum odaklanmış tek adım; bütün program gizli.
    await expect(page.getByText("Plate Loaded Chest Press")).toHaveCount(0);

    await page.getByRole("button", { name: "Diğer hareketleri gör" }).click();

    // Satırın kendisi hedefleniyor: "0 / 2 set" metni üstteki ilerleme
    // çubuğunda da geçiyor, düz metin seçicisi iki öğeye birden uyuyor.
    await expect(
      page.getByRole("button", { name: /Plate Loaded Chest Press\s+0 \/ 2 set/ }),
    ).toBeVisible();
  });
});
