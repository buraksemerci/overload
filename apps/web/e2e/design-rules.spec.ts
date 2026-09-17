import { expect, test, type Page } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

/**
 * Tasarım kurallarının mekanik denetimi.
 *
 * Bu dosya görsel bir "güzel mi" testi değil — göze bakmak insanın işi.
 * Burada sayılabilir olan şeyler sayılıyor, çünkü gözden kaçtıklarında
 * sessizce bozuluyorlar ve bozuldukları anda tasarım dağılıyor.
 */

const SCREENS = [
  "/",
  "/workout",
  "/nutrition",
  "/body",
  "/progress",
  "/programs",
  "/exercises",
  "/history",
  "/muscle-map",
  "/weight",
  "/supplements",
  "/soreness",
  "/coach",
  "/chat",
  "/account",
  // Oturumlu ama gezinmesiz. Taklit kullanıcı akışı bitirmiş sayılıyor; ekran
  // yine de açılıyor (tanıtım adımı) ve aynı kurallara tabi.
  "/onboarding",
] as const;

/** Oturum istemeyen ekranlar. Aynı üç kural, ama `signIn` olmadan. */
const PUBLIC_SCREENS = [
  "/login",
  "/forgot-password",
  "/reset-password?token=ornek",
  "/verify?token=ornek",
] as const;

/**
 * Sayfadaki volt DOLGULU öğeleri sayar.
 *
 * Yalnızca arka plan rengine bakıyor, SVG `fill`'e bakmıyor: ısı haritası ve
 * grafikler ölçek olarak volt kullanıyor, bunlar aksan bütçesine girmiyor.
 * İç içe geçmiş öğeler bir kez sayılıyor — volt bir düğmenin içindeki volt bir
 * span iki öğe değil.
 */
function countVoltFills(): number {
  const probe = document.createElement("div");
  probe.style.background = "var(--color-accent)";
  document.body.appendChild(probe);
  const volt = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const matches = [...document.querySelectorAll("main *, header *")].filter((el) => {
    if (getComputedStyle(el).backgroundColor !== volt) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 6 && rect.height > 6;
  });

  return matches.filter((el) => !matches.some((other) => other !== el && other.contains(el)))
    .length;
}

/** Zemin üzerinde volt RENKLİ metin — okunmadığı için hiç olmaması gerekiyor. */
function findVoltText(): string[] {
  const probe = document.createElement("div");
  probe.style.color = "var(--color-accent)";
  document.body.appendChild(probe);
  const volt = getComputedStyle(probe).color;
  probe.remove();

  return [...document.querySelectorAll("main *, header *")]
    .filter(
      (el) =>
        getComputedStyle(el).color === volt && (el.textContent ?? "").trim().length > 0,
    )
    .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().slice(0, 30)}`);
}

/**
 * Tanımsız bir CSS değişkenine dayanan satır içi `background` bildirimleri.
 *
 * Tanımsız değişkenle yazılan bildirim GEÇERSİZ oluyor ve sessizce düşüyor —
 * zemin şeffaf kalıyor. Üstündeki metin volt ise sonuç görünmez bir rozet.
 * Tam olarak bu oldu: açık temaya geçerken `--color-accent-dim` kaldırıldı,
 * ama iki ekran onu kullanmaya devam etti ("AKTİF" ve "DEVAM EDİYOR"
 * rozetleri). Hiçbir test kırılmadı çünkü volt-metin denetimi yalnızca ana
 * panelde koşuyordu.
 */
function findDeadVariables(): string[] {
  const dead: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
    const inline = el.getAttribute("style") ?? "";
    for (const match of inline.matchAll(/var\((--[a-z0-9-]+)\)/gi)) {
      const name = match[1];
      if (name === undefined) continue;
      const value = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (value.trim() === "") dead.push(name);
    }
  }
  return [...new Set(dead)];
}

/**
 * Ekranı VERİSİ GELMİŞ hâlde açar.
 *
 * `expect(main).toBeVisible()` tek başına yetmiyordu: iskelet anında
 * görünüyor, sorgular ise sonra çözülüyor. Yani denetimler ekranın "Yükleniyor…"
 * hâlini ölçüyordu ve orada ne rozet, ne birincil düğme, ne de liste satırı
 * vardı — kurallar boş bir sayfada sınanıyordu.
 *
 * `networkidle` genel olarak kırılgan bir bekleme ama burada bütün API
 * çağrıları taklit: hemen oturuyor.
 */
async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.describe("tasarım kuralları", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  for (const path of SCREENS) {
    test(`${path} — en fazla iki volt öğesi`, async ({ page }) => {
      await openScreen(page, path);

      const count = await page.evaluate(countVoltFills);

      // Volt %90 parlaklıkta bir vurgu rengi. Ekranda iki yerden fazla
      // görününce vurgu olmaktan çıkıp zemin rengine dönüşüyor. Bütçe:
      // o ekranın tek birincil aksiyonu + bir başarı işareti.
      //
      // Bu sınır gerçekten bir kez aşıldı: kas haritasında iki segmentli
      // kontrolün seçili sekmeleri `btn-primary` olduğu için yan yana iki volt
      // dolgu çıkıyordu. Segmentli kontrol kendi nötr desenine taşındı.
      expect(count, `${path} ekranında ${count} volt dolgu var`).toBeLessThanOrEqual(2);
    });

    // Volt kırık beyaz zemin üzerinde ~1.3:1 kontrast veriyor; metin olarak
    // okunmuyor. Görünür olması gereken ince işaretler için `accent-deep` var.
    //
    // Bu denetim önce YALNIZCA ana panelde koşuyordu ve tam da bu yüzden iki
    // ekrandaki görünmez rozetleri kaçırdı. Artık hepsinde koşuyor.
    test(`${path} — volt metin rengi olarak kullanılmıyor`, async ({ page }) => {
      await openScreen(page, path);
      expect(await page.evaluate(findVoltText)).toEqual([]);
    });

    test(`${path} — tanımsız CSS değişkeni kullanılmıyor`, async ({ page }) => {
      await openScreen(page, path);
      expect(await page.evaluate(findDeadVariables)).toEqual([]);
    });
  }
});

test.describe("tasarım kuralları — oturumsuz ekranlar", () => {
  for (const path of PUBLIC_SCREENS) {
    test(`${path} — volt metin rengi olarak kullanılmıyor`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(findVoltText)).toEqual([]);
    });

    test(`${path} — tanımsız CSS değişkeni kullanılmıyor`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(findDeadVariables)).toEqual([]);
    });
  }
});

/**
 * Kimlik taşıyan rotalar.
 *
 * Yukarıdaki listeye giremiyorlar çünkü var olmayan bir kimliğe gidildiğinde
 * ekran hata durumunu basıyor ve denetim boş sayfayı ölçüyor. Kendi taklit
 * verileriyle ayrı koşuyorlar — ama AYNI üç kuralla: bu iki ekran uzun süre
 * denetimin dışında kaldı ve ikisinde de kırpılan alanlar, zeminsiz
 * yapışkan çubuklar birikti.
 */
const PROGRAM_ID = "44444444-4444-4444-4444-444444444444";
const ACTION_ID = "66666666-6666-6666-6666-666666666666";

const PROGRAM_DETAIL = {
  id: PROGRAM_ID,
  name: "5 Günlük Split",
  description: null,
  goal: "hypertrophy",
  level: "beginner",
  days_per_week: 5,
  is_template: false,
  is_active: true,
  source_name: null,
  source_url: null,
  created_at: "2026-08-01T10:00:00Z",
  days: [
    {
      id: "aaaaaaaa-1111-1111-1111-111111111111",
      order_index: 0,
      label: "Pazartesi — Göğüs",
      exercises: [
        {
          id: "bbbbbbbb-1111-1111-1111-111111111111",
          exercise_id: "55555555-5555-5555-5555-555555555555",
          exercise_name: "Barbell Bench Press",
          equipment: "barbell",
          order_index: 0,
          target_sets: 4,
          target_rep_min: 6,
          target_rep_max: 8,
          technique: "rir1",
          superset_group: null,
          rest_seconds: 180,
          notes: null,
          target_percent_1rm: null,
          target_label: "4 × 6-8",
        },
      ],
    },
  ],
};

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
          exercise_id: "55555555-5555-5555-5555-555555555555",
          target_sets: 4,
          target_rep_min: 6,
          target_rep_max: 8,
          technique: "rir1",
          superset_group: null,
          rest_seconds: 150,
          notes: null,
          target_percent_1rm: null,
        },
      ],
    },
  ],
};

const DYNAMIC = [
  {
    path: `/programs/${PROGRAM_ID}/edit`,
    async mock(page: Page) {
      await page.route(`http://localhost:8000/programs/${PROGRAM_ID}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(PROGRAM_DETAIL),
        }),
      );
    },
  },
  {
    path: `/programs/review/${ACTION_ID}`,
    async mock(page: Page) {
      await page.route(
        `http://localhost:8000/chat/pending-actions/${ACTION_ID}`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: ACTION_ID,
              action_type: "propose_program",
              summary: "«Üst/Alt Split» — 1 gün, 1 hareket",
              payload: PROPOSAL,
              status: "pending",
              created_at: "2026-09-15T10:00:00Z",
            }),
          }),
      );
    },
  },
] as const;

test.describe("tasarım kuralları — kimlikli rotalar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await mockApi(page);
  });

  for (const screen of DYNAMIC) {
    test(`${screen.path} — en fazla iki volt öğesi`, async ({ page }) => {
      await screen.mock(page);
      await openScreen(page, screen.path);
      const count = await page.evaluate(countVoltFills);
      expect(count, `${screen.path} ekranında ${count} volt dolgu var`).toBeLessThanOrEqual(2);
    });

    test(`${screen.path} — volt metin rengi olarak kullanılmıyor`, async ({ page }) => {
      await screen.mock(page);
      await openScreen(page, screen.path);
      expect(await page.evaluate(findVoltText)).toEqual([]);
    });

    test(`${screen.path} — tanımsız CSS değişkeni kullanılmıyor`, async ({ page }) => {
      await screen.mock(page);
      await openScreen(page, screen.path);
      expect(await page.evaluate(findDeadVariables)).toEqual([]);
    });
  }
});

/**
 * Hareket azaltma tercihi ekranın açılış hareketini tamamen kaldırıyor.
 *
 * Genel kural süreyi 150ms'ye indiriyordu ama bandın fotoğrafı yine de
 * ölçekleniyordu: "azaltılmış" değil, kısaltılmış hareket. Baş dönmesi
 * (vestibüler) hassasiyeti olan biri için kısa bir yakınlaşma da tetikleyici.
 */
test("hareket azaltma tercihinde bandın fotoğrafı hiç hareket etmiyor", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await signIn(page);
  await mockApi(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const media = page.locator(".hero-media").first();
  await expect(media).toBeAttached();
  const animation = await media.evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe("none");
  await context.close();
});

/**
 * Dar ekranda YATAY KAYDIRMA YOK.
 *
 * Tam kadraj bantlar `100vw` genişliğinde ve negatif kenar boşluğuyla
 * ortalanıyor; bir yerde `overflow-x` kesilmezse ya da bir ızgara sabit
 * genişlikli bir çocuk taşırsa bütün sayfa yana kayıyor. Telefonda bu,
 * dokunarak kaydırırken içeriğin sürekli sağa sola oynaması demek.
 *
 * Tek testte bütün ekranlar geziliyor: her ekran için ayrı test açmak aynı
 * iddiayı otuz kez yeniden kurmak olurdu.
 */
test("dar ekranda hiçbir ekran yana kaymıyor", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page);
  await mockApi(page);

  const overflowing: string[] = [];
  for (const path of SCREENS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const result = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("main *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > width + 1 && rect.height > 4;
        })
        .map((element) => `${element.tagName.toLowerCase()}.${(element.getAttribute("class") ?? "").slice(0, 50)}`);
      return { scroll: document.documentElement.scrollWidth, width, wide: wide.slice(0, 2) };
    });
    if (result.scroll > result.width + 1) {
      overflowing.push(`${path}: ${result.scroll}px > ${result.width}px — ${result.wide.join(", ")}`);
    }
  }

  expect(overflowing, overflowing.join(" · ")).toEqual([]);
});
