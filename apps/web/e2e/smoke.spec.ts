import { expect, test } from "@playwright/test";
import { mockApi, openAuthForm, signIn } from "./fixtures";

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
    await openAuthForm(page);
    const form = page.locator("#giris");
    // Kip seçici ile gönder düğmesi AYRI etiketler taşıyor: ekranda aynı
    // yazının iki kez görünmesi hangisinin seçim hangisinin eylem olduğunu
    // belirsizleştiriyordu.
    await expect(form.getByRole("button", { name: "Giriş yap" })).toBeVisible();

    await form.getByRole("button", { name: "Kayıt", exact: true }).click();
    await expect(form.getByRole("button", { name: "Hesap oluştur" })).toBeVisible();
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

    await openAuthForm(page);
    await page.getByLabel("E-posta").fill("yanlis@example.com");
    await page.getByLabel("Şifre").fill("hatalisifre");
    await page.locator("#giris").getByRole("button", { name: "Giriş yap" }).click();

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

  test("panelin altı grafiklerle dolu, bandı tek iş", async ({ page }) => {
    await page.goto("/");

    // Bant tek soruya cevap veriyor; hareket listesi orada değil, antrenman
    // ekranında.
    await expect(page.getByText("Plate Loaded Chest Press")).toHaveCount(0);

    // Bandın altı "nasıl gidiyor"un görsel cevabı: tonaj, kalori, kas dengesi,
    // kilo, tutarlılık. Her karo kendi ekranına gidiyor.
    for (const label of ["Haftalık tonaj", "Bugün yenilen", "Kas dengesi · 7 gün", "Kilo · 90 gün"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("img", { name: /vücut kas hacmi haritası/ }).first()).toBeVisible();
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

    // Gezinme etiketleri sayfa başlıklarıyla birebir aynı DEĞİL: menüde
    // gruplar var ("Beslenme" bir başlık, altındaki bağlantı "Günlük"), o
    // yüzden eşleme açıkça yazılıyor. Grup adı da gerekiyor çünkü alt
    // bağlantılar ancak grubun paneli açıldığında DOM'da.
    //
    // Masaüstünde panel başlığa tıklanınca açılıyor; telefonda çekmece.
    // `md` altında masaüstü gezinmesi `display:none` olduğu için
    // erişilebilirlik ağacından düşüyor ve rol sorgusu iki öğeye uymuyor.
    // Mobil olup olmadığı viewport'tan KESİN olarak biliniyor; `isVisible()`
    // beklemiyor ve hidrasyon bitmeden çağrıldığında düğmeyi bulamıyordu.
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;

    for (const [group, navLabel, heading] of [
      ["Beslenme", "Günlük", "Beslenme"],
      ["Vücut", "İlerleme", "İlerleme"],
      ["Asistan", "Sohbet", "Asistan"],
    ] as const) {
      if (isMobile) {
        // Çekmecede bütün gruplar açık duruyor; ayrı bir adım gerekmiyor.
        await page.getByRole("button", { name: "Menüyü aç" }).click();
      }
      // Erişilebilir ad etiketi VE ipucunu içeriyor ("Günlük Kalan kalori
      // ve öğünler") — ekran okuyucu için doğru olan bu. O yüzden baştan
      // eşleyen bir düzenli ifade kullanılıyor.
      //
      // `header` KAPSAMI ŞART: karşılama ekranındaki anlatının her fazında
      // aynı adı taşıyan bir bağlantı var ("Beslenme", "Programlar"...).
      // Onlar opaklığı sıfır olsa da DOM'da ve katı kip görünürlüğe bakmıyor.
      const target = page
        .locator(isMobile ? "body" : "header")
        .getByRole("link", { name: new RegExp(`^${navLabel}`) });

      if (!isMobile) {
        /* Başlık bir bağlantı ve tıklamak grubun İLK ekranına gidiyor; alt
           ekranlara ulaşmak için panel imleçle açılıyor.

           TEK hover yetiyor ve bu bir davranış iddiası: bir önceki adımın
           gezinmesi tam bu sırada yerleşse bile bekleyen açılış iptal
           edilmemeli. İptal edildiğinde imleç sekmenin üstünde durduğu için
           yeni bir `mouseenter` de gelmiyordu — panel bir daha hiç
           açılmıyordu. */
        const groupLink = page.locator("header").getByRole("link", { name: group, exact: true });
        await groupLink.hover();

        /* Panel açılışı bir önceki gezinmeyle çakışırsa imleç zaten sekmenin
           üstünde duruyor ve yeni bir `mouseenter` gelmiyor. İmleci kenara
           alıp tekrar üstüne gelmek açılışı garantiliyor — testin kendisi
           yüzünden kırılmasın. */
        if (!(await target.isVisible())) {
          await page.mouse.move(0, 400);
          await groupLink.hover();
        }
        await target.waitFor({ state: "visible", timeout: 10_000 });
      }

      await target.click();
      // Uzun bekleme BİLEREK: geliştirme sunucusu paralel koşan testlerin
      // altında bir rotayı ilk kez derlerken 5 saniyeyi aşabiliyor. Üretim
      // derlemesinde böyle bir gecikme yok; burada ölçülen şey gezinmenin
      // çalışması, sunucunun derleme hızı değil.
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("bağlantı gidince ekran bunu söylüyor", async ({ page, context }) => {
    /* Salonun bodrumunda bağlantı düşüyor ve uygulama sessizce çalışmamaya
       başlıyordu: "Seti kaydet" bir hata kutusu döndürüyor ama sebebi
       görünmüyordu. Çubuk yalnızca çevrimdışıyken var. */
    await page.goto("/");
    await expect(page.getByText(/Bağlantı yok/)).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByText(/Bağlantı yok/)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/Bağlantı yok/)).toHaveCount(0);
  });

  test("olmayan adres uygulamanın kendi 404'üne düşüyor", async ({ page }) => {
    /* Next'in varsayılanı siyah beyaz bir sistem yazısı; uygulamanın içinde
       oraya düşmek "site bozuldu" hissi veriyordu. */
    await page.goto("/boyle-bir-sayfa-yok");
    await expect(page.getByRole("heading", { name: "Bu sayfa yok", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Panele dön" }).click();
    await expect(page).toHaveURL(/localhost:3000\/$/);
  });

  test("sekme başlığı hangi ekranda olduğunu söylüyor", async ({ page }) => {
    /* Uygulama tek sayfa gibi davranıyor ve bütün sekmeler "overload"
       yazıyordu; beş sekme açık olan biri hangisinin kilo, hangisinin
       antrenman olduğunu ancak tıklayarak buluyordu. Başlıklar bölüm
       düzenlerinden (`app/<bölüm>/layout.tsx`) geliyor — sayfalar istemci
       bileşeni olduğu için `metadata` dışa aktaramıyor. */
    for (const [path, title] of [
      ["/", "overload"],
      ["/weight", "Kilo · overload"],
      ["/muscle-map", "Kas haritası · overload"],
      ["/chat", "Asistan · overload"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
    }
  });

  test("ana başlıklar üstte, alt ekranlar panelde", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, "masaüstü gezinmesi");
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Ana gezinme" });
    await expect(nav.getByRole("link", { name: "Panel", exact: true })).toHaveCount(0);
    // Üstte YALNIZCA dört ana başlık var — "Panel" sekmesi yok, marka
    // yazısı ana sayfaya gidiyor.
    for (const title of ["Antrenman", "Beslenme", "Vücut", "Asistan"]) {
      await expect(nav.getByRole("link", { name: title, exact: true })).toBeVisible();
    }
    // Alt ekranlar kapalıyken DOM'da değil.
    await expect(page.getByRole("link", { name: /^Kas Haritası/ })).toBeHidden();

    await nav.getByRole("link", { name: "Vücut", exact: true }).hover();
    await expect(page.getByRole("link", { name: /^Kas Haritası/ })).toBeVisible();
    // Panelde dört ekranın hepsi var. Sorgu PANELE kapsamlı: ana paneldeki
    // kutucuklar da aynı rotalara bağlanıyor ("Kilo — İlk ölçümünü gir").
    const megaPanel = page.locator("header").getByRole("list");
    for (const item of [/^İlerleme/, /^Kas Haritası/, /^Kilo/, /^Ağrı/]) {
      await expect(megaPanel.getByRole("link", { name: item })).toBeVisible();
    }
  });

  test("panel imleç üzerine gelince açılıyor", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, "dokunmatikte hover yok");
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Ana gezinme" });
    await nav.getByRole("link", { name: "Antrenman", exact: true }).hover();
    await expect(
      page.locator("header").getByRole("link", { name: /^Programlar/ }),
    ).toBeVisible();
  });

  test("başlığa tıklamak grubun ilk ekranına gidiyor", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, "masaüstü gezinmesi");
    await page.goto("/");

    // "Antrenman" -> /workout. Menüyü açıp ikinci bir tıklama beklemek
    // gereksiz bir adımdı: başlığa tıklayan zaten o bölümü istiyor.
    await page
      .getByRole("navigation", { name: "Ana gezinme" })
      .getByRole("link", { name: "Antrenman", exact: true })
      .click();
    await expect(page).toHaveURL(/\/workout$/);
  });

  test("kaydırmak paneli kapatıyor", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, "masaüstü gezinmesi");
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Ana gezinme" });
    // BAŞLIĞA kapsamlı: karşılama ekranındaki anlatı da "Programlar" adında
    // bir bağlantı taşıyor ve o kapanmıyor.
    const header = page.locator("header");
    await nav.getByRole("link", { name: "Antrenman", exact: true }).hover();
    await expect(header.getByRole("link", { name: /^Programlar/ })).toBeVisible();

    // Çubuk yapışkan değil, sayfayla birlikte akıp gidiyor. Panel DURUMU da
    // kapanmalı: açık kalsaydı arkadaki içerik bulanık ve `inert` kalırdı ve
    // kullanıcı hiçbir şeye tıklayamazdı.
    await page.mouse.wheel(0, 400);
    await expect(header.getByRole("link", { name: /^Programlar/ })).toBeHidden();
    await expect(page.locator("main")).not.toHaveAttribute("inert", /.*/);
  });

  test("Escape paneli kapatıyor", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, "masaüstü gezinmesi");
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Ana gezinme" });
    const header = page.locator("header");
    await nav.getByRole("link", { name: "Antrenman", exact: true }).hover();
    await expect(header.getByRole("link", { name: /^Programlar/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(header.getByRole("link", { name: /^Programlar/ })).toBeHidden();
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
    await expect(page.getByLabel("kg", { exact: true })).toHaveValue("42,5");
    await expect(page.getByLabel("Tekrar", { exact: true })).toHaveValue("5");
    await expect(page.getByLabel("RIR", { exact: true })).toHaveValue("");

    // +/− düğmeleri ekipmanın adımıyla: bar 2,5 kg.
    await page.getByRole("button", { name: "2,5 kg artır" }).click();
    await expect(page.getByLabel("kg", { exact: true })).toHaveValue("45");
    // Plaka yüklemeli makinede bir tarafa düşen plakalar yazıyor.
    await expect(page.getByText(/Bir tarafa: 20 \+ 2,5 kg/)).toBeVisible();

    // Virgülle yazılan değer noktaya normalize edilip gönderilmeli.
    await page.getByLabel("kg", { exact: true }).fill("45,5");
    await page.getByLabel("RIR", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Seti kaydet" }).click();

    await expect.poll(() => loggedBody).not.toBeNull();
    expect(loggedBody).toMatchObject({ weight_kg: 45.5, reps: 5, rir: 1, set_number: 1 });

    // Set kaydedilince dinlenme sayacı ortada büyük görünüyor ve sıradaki set
    // adıyla birlikte duyuruluyor.
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText("Set 2 / 2")).toBeVisible();
  });

  test("klavye: Enter seti kaydediyor, dinlenmede Enter atlıyor", async ({ page }) => {
    /* Masaüstünde antrenman girmek de bir senaryo (evde, dizüstüyle).
       Kısayolların ekranda görünen karşılıkları var; burada ölçülen şey
       ikisinin AYNI işi yapması. Alanlara yazarken kısayol çalışmamalı —
       o yüzden Enter gövdeye basılıyor. */
    const sessionId = "44444444-4444-4444-4444-444444444444";
    const loggedSets: unknown[] = [];
    const savedSet = {
      id: "55555555-5555-5555-5555-555555555555",
      exercise_id: "33333333-3333-3333-3333-333333333333",
      set_number: 1,
      weight_kg: "42.50",
      reps: 5,
      rir: null,
      is_warmup: false,
      technique: "rir1",
    };

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
    await page.route(`http://localhost:8000/workouts/sessions/${sessionId}/sets`, (route) => {
      loggedSets.push(savedSet);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(savedSet) });
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
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();
    await expect(page.getByText("Set 1 / 2")).toBeVisible();

    // Odak alanda DEĞİLKEN Enter: set kaydediliyor ve dinlenme başlıyor.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("timer")).toBeVisible();

    // Dinlenmede Enter: sayaç kapanıyor, sıradaki set sahnesi geliyor.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("timer")).toHaveCount(0);
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

    await page.getByLabel("Tekrar", { exact: true }).fill("");
    await expect(save).toBeDisabled();
  });

  test("kayıtlı sete dönünce düğme güncellemeyi söylüyor", async ({ page }) => {
    /* Sunucu aynı sırayı ÜZERİNE YAZIYOR (yanlış giren düzeltebilsin diye).
       Ekran bunu söylemeyince "Seti kaydet" yeni bir set ekliyormuş gibi
       duruyordu ve insanlar geri dönmeye çekiniyordu. */
    const sessionId = "44444444-4444-4444-4444-444444444444";
    const savedSet = {
      id: "55555555-5555-5555-5555-555555555555",
      exercise_id: "33333333-3333-3333-3333-333333333333",
      set_number: 1,
      weight_kg: "42.50",
      reps: 5,
      rir: null,
      is_warmup: false,
      technique: "rir1",
    };
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
          sets: [savedSet],
        }),
      }),
    );
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
          sets: [savedSet],
        }),
      }),
    );

    await page.goto("/workout");
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();
    // İmleç ikinci sete gidiyor; haritadan birinci sete dönülüyor.
    await expect(page.getByText("Set 2 / 2")).toBeVisible();
    await page.getByRole("button", { name: /Plate Loaded Chest Press/ }).first().click();

    await expect(page.getByText("Bu set kayıtlı — değiştirirsen üzerine yazılır.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Seti güncelle" })).toBeVisible();
  });

  test("yanlışlıkla başlatılan antrenman iptal edilebiliyor", async ({ page }) => {
    /* Bitirme düğmesi hiç set yokken kapalı. İptal olmayınca seans sonsuza
       kadar açık kalıyor ve panel her gün "devam ediyor" diyordu. */
    const sessionId = "44444444-4444-4444-4444-444444444444";
    let deleted = false;
    const empty = {
      id: sessionId,
      program_day_id: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      notes: null,
      is_deload: false,
      sets: [],
    };
    await page.route("http://localhost:8000/workouts/sessions", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(empty) }),
    );
    await page.route(`http://localhost:8000/workouts/sessions/${sessionId}`, (route) => {
      if (route.request().method() === "DELETE") {
        deleted = true;
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) });
    });

    await page.goto("/workout");
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();
    await expect(page.getByText("Set 1 / 2")).toBeVisible();

    await page.getByRole("button", { name: "İptal et" }).click();
    await expect(page.getByRole("dialog", { name: "Antrenmanı iptal et" })).toBeVisible();
    await page.getByRole("button", { name: "Evet, iptal et" }).click();

    await expect.poll(() => deleted).toBe(true);
    // Seans kapandı: ekran yeniden başlangıç sahnesinde.
    await expect(page.getByRole("button", { name: "Antrenmanı başlat" })).toBeVisible();
  });

  test("fazladan açılan set geri alınabiliyor", async ({ page }) => {
    const sessionId = "44444444-4444-4444-4444-444444444444";
    const empty = {
      id: sessionId,
      program_day_id: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      notes: null,
      is_deload: false,
      sets: [],
    };
    await page.route("http://localhost:8000/workouts/sessions", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(empty) }),
    );
    await page.route(`http://localhost:8000/workouts/sessions/${sessionId}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) }),
    );

    await page.goto("/workout");
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();

    const map = page.getByRole("complementary", { name: "Günün hareketleri" });
    await map.getByRole("button", { name: /bir set daha ekle/ }).click();
    await expect(map.getByText("0 / 3 set")).toBeVisible();

    // Aynı yerden geri al: plan yine iki set.
    await map.getByRole("button", { name: /eklenen seti geri al/ }).click();
    await expect(map.getByText("0 / 2 set")).toBeVisible();
  });

  test("ısınma seti işaretlenip kaydediliyor", async ({ page }) => {
    /* Isınma setleri hacme, rekora ve ilerleme motoruna girmiyor (sunucu
       `is_warmup` alanına bakıyor) ama kaydedilebilmeleri gerekiyor. */
    const sessionId = "44444444-4444-4444-4444-444444444444";
    let body: Record<string, unknown> | null = null;
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
    await page.route(`http://localhost:8000/workouts/sessions/${sessionId}/sets`, (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
    });

    await page.goto("/workout");
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();
    await page.getByRole("button", { name: "Isınma seti olarak işaretle" }).click();
    await expect(page.getByRole("button", { name: /Isınma seti — hacme sayılmıyor/ })).toBeVisible();
    await page.getByRole("button", { name: "Seti kaydet" }).click();

    await expect.poll(() => body).not.toBeNull();
    expect(body).toMatchObject({ is_warmup: true, set_number: 1 });
  });

  test("plana bir set daha eklenebiliyor", async ({ page }) => {
    /* "Bugün bir set daha" salonda sık verilen bir karar. Sunucu plan dışı
       sıra numarasını zaten kabul ediyordu; eksik olan ekranda o slotun
       açılmasıydı. */
    const sessionId = "44444444-4444-4444-4444-444444444444";
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
          sets: [],
        }),
      }),
    );

    await page.goto("/workout");
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();

    const map = page.getByRole("complementary", { name: "Günün hareketleri" });
    await expect(map.getByText("0 / 2 set")).toBeVisible();
    await map.getByRole("button", { name: /bir set daha ekle/ }).click();
    await expect(map.getByText("0 / 3 set")).toBeVisible();
    // Sahnedeki sayaç da yeni planı gösteriyor.
    await expect(page.getByText("Set 1 / 3")).toBeVisible();
  });

  test("günün hareketleri sahnenin yanında hep görünüyor", async ({ page }) => {
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

    // Başlamadan önce de plan görünüyor: kullanıcı neye başladığını biliyor.
    const map = page.getByRole("complementary", { name: "Günün hareketleri" });
    await expect(map.getByText("Plate Loaded Chest Press")).toBeVisible();

    // Seans başlayınca satırlar atlama düğmesi oluyor.
    await page.getByRole("button", { name: "Antrenmanı başlat" }).click();
    await expect(map.getByRole("button", { name: /Plate Loaded Chest Press\s+0 \/ 2 set/ })).toBeVisible();
  });
});
