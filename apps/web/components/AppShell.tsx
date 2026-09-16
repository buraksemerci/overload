"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconAche,
  IconBody,
  IconChat,
  IconDumbbell,
  IconHistory,
  IconLibrary,
  IconNutrition,
  IconPanel,
  IconProgram,
  IconProgress,
  IconReport,
  IconScale,
  IconSupplement,
} from "@/components/Icons";
import { Photo } from "@/components/Photo";
import { logout } from "@/lib/auth";
import { useMe } from "@/lib/queries";

/**
 * Uygulama kabuğu — üstte gezinme çubuğu, açılan geniş panel.
 *
 * --------------------------------------------------------------------------
 * NEDEN SOL ÇUBUKTAN ÜSTE TAŞINDI
 * --------------------------------------------------------------------------
 * Önceki sürümde on dört ekran kalıcı bir sol çubukta duruyordu. Çalışıyordu
 * ama iki maliyeti vardı: 232 pikseli her ekranda tutuyordu ve on dört
 * bağlantı sürekli görünürdü — yani "az göster, isteyince aç" kuralının
 * tek istisnası kendi gezinmesiydi.
 *
 * Şimdi üstte yalnızca **dört ana başlık** var. Alt ekranlar başlığın üzerine
 * gelince ya da tıklanınca açılan panelde.
 *
 * --------------------------------------------------------------------------
 * GRUPLAMA NİYETE GÖRE
 * --------------------------------------------------------------------------
 * Veri türüne göre değil: "bugün ne yapacağım" (Antrenman), "ne yedim"
 * (Beslenme), "vücudum ne durumda" (Vücut), "birine sorayım" (Asistan).
 * Dört başlık, listeyi taranacak bir şey olmaktan çıkarıp hatırlanacak bir
 * haritaya çeviriyor.
 *
 * --------------------------------------------------------------------------
 * PANEL NEDEN FOTOĞRAFLI
 * --------------------------------------------------------------------------
 * Her grubun bir fotoğrafı var ve grup adı onun üzerinde büyük yazıyor.
 * Fotoğraf süs değil, işaret: panel açıldığında hangi bölgede olduğun
 * yazıyı okumadan önce anlaşılıyor. Fotoğraf yokken yuva nötr bir dokuya
 * düşüyor ve panel yine çalışıyor (bkz. `components/Photo.tsx`).
 *
 * --------------------------------------------------------------------------
 * ÜZERİNE GELİNCE AÇILMANIN TUZAĞI
 * --------------------------------------------------------------------------
 * `onMouseLeave` ile hemen kapatmak paneli kullanılamaz yapıyor: kullanıcı
 * başlıktan panele inerken imleç bir an ikisinin arasındaki boşluktan
 * geçiyor ve panel kapanıyor. Bu yüzden kapanış `CLOSE_DELAY` kadar
 * gecikiyor ve panele girmek gecikmeyi iptal ediyor.
 *
 * Dokunmatik ekranda `hover` yok; o yüzden tıklama da açıyor.
 *
 * --------------------------------------------------------------------------
 * KABUK GENİŞLİĞİ İÇERİKTEN GENİŞ
 * --------------------------------------------------------------------------
 * Kabuk 80rem, içerik sütunu (`components/Layout.tsx` içindeki `Page`) 68rem.
 * Kasıtlı: gezinme çubuğu ve açılan panel ekranı boydan boya kullanıyor,
 * okunan içerik ise satır uzunluğu makul kalsın diye daha dar. İkisini
 * eşitlemek ya paneli sıkıştırıyor ya metni 130 karaktere uzatıyordu.
 */

// Next 16 rotaları tipliyor: `href` gelişigüzel bir string olamaz, projede
// gerçekten var olan bir rota olmak zorunda. Bu tip onu `Link`'ten türetiyor,
// yani rota adı yanlış yazılırsa derleme zamanında yakalanıyor.
type Href = React.ComponentProps<typeof Link>["href"];

type NavItem = {
  href: Href;
  label: string;
  /** Tek satırlık ne işe yaradığı. Panelde adın altında duruyor. */
  hint: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

type NavGroup = {
  title: string;
  /** `public/photos/<photo>.jpg`. Yoksa nötr dokuya düşüyor. */
  photo: string;
  /**
   * Panelin zemin tonu. Fotoğrafın kendi rengine göre seçiliyor: görsel
   * sağa doğru bu renge soluyor, yani yanlış ton seçilirse fotoğraf zemine
   * karışmak yerine ondan kopuyor.
   *
   * Kahvaltı karesi aydınlık; onu koyuya soldurmak fotoğrafı kesiyormuş
   * gibi duruyordu. Diğer üçü karanlık salon kareleri.
   */
  tone: "dark" | "light";
  items: readonly NavItem[];
};

/** Zemin ve metin renkleri tona göre. */
const TONES = {
  dark: {
    surface: "oklch(14% 0.008 115)",
    title: "oklch(99% 0 0)",
    label: "oklch(86% 0.01 115 / 0.75)",
    bar: "oklch(99% 0 0)",
    barDim: "oklch(99% 0 0 / 0.6)",
    divider: "oklch(99% 0 0 / 0.26)",
    shadow: "on-photo-dark",
  },
  light: {
    surface: "oklch(96.5% 0.006 115)",
    title: "oklch(18% 0.014 115)",
    label: "oklch(40% 0.011 115)",
    bar: "oklch(18% 0.014 115)",
    barDim: "oklch(18% 0.014 115 / 0.55)",
    divider: "oklch(18% 0.014 115 / 0.2)",
    shadow: "on-photo-light",
  },
} as const;

/**
 * Panel AYRI BİR SEKME DEĞİL: marka yazısı oraya gidiyor.
 *
 * Neredeyse her sitede logo ana sayfaya gider ve kullanıcı bunu öğrenmek
 * zorunda değil — zaten biliyor. Ayrıca sekme olarak dururken "Panel"
 * diğer dördüyle aynı ağırlıktaydı, oysa o bir bölüm değil giriş noktası.
 *
 * Telefon çekmecesinde yine bir satır olarak duruyor: orada marka yazısı
 * küçük ve dokunma hedefi olarak belirsiz.
 */
const PANEL: NavItem = {
  href: "/",
  label: "Panel",
  hint: "Bugünün özeti",
  Icon: IconPanel,
};

const GROUPS: readonly NavGroup[] = [
  {
    title: "Antrenman",
    photo: "nav-antrenman",
    tone: "dark",
    items: [
      { href: "/workout", label: "Bugün", hint: "Set set akış", Icon: IconDumbbell },
      { href: "/programs", label: "Programlar", hint: "Aktif program ve şablonlar", Icon: IconProgram },
      { href: "/exercises", label: "Hareketler", hint: "Kütüphane ve kas eşlemesi", Icon: IconLibrary },
      { href: "/history", label: "Geçmiş", hint: "Tamamlanan antrenmanlar", Icon: IconHistory },
    ],
  },
  {
    title: "Beslenme",
    photo: "nav-beslenme",
    tone: "light",
    items: [
      { href: "/nutrition", label: "Günlük", hint: "Kalan kalori ve öğünler", Icon: IconNutrition },
      { href: "/supplements", label: "Supplement", hint: "Bugün alınacaklar", Icon: IconSupplement },
    ],
  },
  {
    title: "Vücut",
    photo: "nav-vucut",
    tone: "dark",
    items: [
      { href: "/progress", label: "İlerleme", hint: "Güç seviyesi ve rekorlar", Icon: IconProgress },
      { href: "/muscle-map", label: "Kas Haritası", hint: "Haftalık hacim dengesi", Icon: IconBody },
      { href: "/weight", label: "Kilo", hint: "Trend ve hareketli ortalama", Icon: IconScale },
      { href: "/soreness", label: "Ağrı", hint: "Günlük check-in", Icon: IconAche },
    ],
  },
  {
    title: "Asistan",
    photo: "nav-asistan",
    tone: "dark",
    items: [
      { href: "/chat", label: "Sohbet", hint: "Sor, anlat, fotoğraf gönder", Icon: IconChat },
      { href: "/coach", label: "Haftalık Rapor", hint: "Pazartesi değerlendirmesi", Icon: IconReport },
    ],
  },
];

/* Gezinme çubuğunun GÖRÜNMEDİĞİ yollar: oturumu olmayan kişinin geldiği
   ekranlar. Menüyü göstermek, tıklandığında giriş ekranına atan bağlantılar
   sunmak demek olurdu. */
const CHROMELESS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify",
]);

/** Üst çubuğun yüksekliği. Fotoğraf örtüsü bu kadar yukarıdan başlıyor. */
const BAR_HEIGHT = "4.5rem";

/** Başlıktan panele inerken imlecin boşluktan geçmesine tanınan süre. */
const CLOSE_DELAY = 140;

/**
 * İlk açılıştan önceki bekleme.
 *
 * Gecikmesiz açılan bir panel, imleç üst çubuğun üzerinden geçerken bile
 * açılıyor — kullanıcı sağ üstteki profil düğmesine giderken dört panel
 * arka arkaya açılıp kapanıyordu. Kısa bir niyet eşiği bunu kesiyor.
 *
 * Gruplar ARASINDA geçerken beklenmiyor: menü zaten açıksa kullanıcı
 * gezindiğini belli etmiş durumda ve orada gecikme tembellik gibi geliyor.
 */
const OPEN_DELAY = 180;

/** Kapanış animasyonunun süresi. `--dur-short` ile aynı olmak ZORUNDA. */
const EXIT_MS = 220;

/** Panelin kendi yüksekliği (çubuk hariç). */
const PANEL_HEIGHT = "clamp(19rem, 40vh, 25rem)";

/**
 * Panelin durumu.
 *
 * Tek bir `open: string | null` yetmiyordu: kapanış animasyonu için panelin
 * DOM'da kalmaya devam etmesi gerekiyor. `phase` hangi animasyonun
 * oynayacağını ve arkadaki bulanıklığın açık mı kapalı mı olduğunu söylüyor.
 */
type PanelState = { group: string; phase: "in" | "out" };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [drawer, setDrawer] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Açılış gecikmesini kapanıştan AYRI tutuyor: ikisi aynı zamanlayıcıyı
  // paylaşsaydı, bir gruptan çıkıp diğerine girmek kapanışı iptal ederken
  // açılışı da iptal ederdi.
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Görünür durumdaki grup. Kapanırken `null` — bulanıklık hemen çözülüyor. */
  const open = panel?.phase === "in" ? panel.group : null;

  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const cancelOpen = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelOpen();
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    setPanel((current) => (current === null ? null : { ...current, phase: "out" }));
    exitTimer.current = setTimeout(() => setPanel(null), EXIT_MS);
  }, [cancelOpen]);

  const show = useCallback((title: string) => {
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    setPanel({ group: title, phase: "in" });
  }, []);

  const closeSoon = useCallback(() => {
    cancelOpen();
    cancelClose();
    timer.current = setTimeout(close, CLOSE_DELAY);
  }, [cancelClose, cancelOpen, close]);

  /** Hover ile açılış. Menü kapalıysa bekliyor, açıksa anında geçiyor. */
  const hoverOpen = useCallback(
    (title: string) => {
      cancelClose();
      cancelOpen();
      if (panel?.phase === "in") {
        show(title);
        return;
      }
      openTimer.current = setTimeout(() => show(title), OPEN_DELAY);
    },
    [cancelClose, cancelOpen, panel, show],
  );

  /**
   * Rota değişince menüler kapanır; aksi halde kullanıcı bir bağlantıya
   * dokunduktan sonra panel açık kalıyor ve gittiği sayfayı görmüyor.
   *
   * **Bekleyen AÇILIŞ iptal edilmiyor** (`cancelOpen` burada yok). Ediliyordu
   * ve şu tuzağı kuruyordu: kullanıcı bir bağlantıya tıklayıp hemen başka bir
   * sekmenin üstüne geliyor, açılış zamanlayıcısı kuruluyor, ardından
   * gezinme yerleşip zamanlayıcıyı öldürüyor. Panel açılmıyor — ve imleç
   * sekmenin üstünde durduğu için yeni bir `mouseenter` de gelmiyor.
   * Kullanıcının tek çaresi imleci çekip geri götürmek.
   *
   * Bekleyen açılış imlecin ŞU ANKİ yerine ait; gezinme onu değiştirmedi.
   */
  useEffect(() => {
    cancelClose();
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       Rota DEĞİŞİNCE paneli kapatmak bir yan etki zinciri: zamanlayıcılar
       iptal ediliyor ve menü durumu sıfırlanıyor. "Anahtarla yeniden kur"
       alternatifi bütün kabuğu yeniden monte ederdi. */
    setPanel(null);
    setDrawer(false);
  }, [pathname, cancelClose]);

  useEffect(
    () => () => {
      cancelClose();
      cancelOpen();
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    },
    [cancelClose, cancelOpen],
  );

  /**
   * Gezinme fotoğraflarını önden yükle.
   *
   * Panel ancak açıldığında DOM'a giriyor, yani fotoğraf da o an isteniyor.
   * İlk açılışta indirme bitene kadar yer tutucu görünüyordu — panel bir
   * "yüklenen kutu" gibi iniyordu.
   *
   * Sayfa açılışını GECİKTİRMEDEN yapılıyor: `requestIdleCallback` ile
   * tarayıcı boşa çıkınca. Dört dosya toplam ~360 KB ve kullanıcı gezinmeye
   * dokunana kadar çoktan önbellekte oluyor.
   */
  useEffect(() => {
    const warm = () => {
      for (const group of GROUPS) {
        const image = new Image();
        image.src = `/photos/${group.photo}.jpg`;
      }
    };
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(warm, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    // Safari'de `requestIdleCallback` yok.
    const handle = setTimeout(warm, 1200);
    return () => clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * Kaydırma paneli kapatır.
   *
   * Çubuk sayfayla birlikte akıp gidiyor (yapışkan değil), yani panel de
   * ekrandan çıkıyor. Ama DURUM açık kalıyordu: arkadaki içerik bulanık ve
   * `inert` kalıyor, kullanıcı hiçbir şeye tıklayamıyordu. Görünürlükle
   * durumu aynı yerde tutmak şart.
   */
  useEffect(() => {
    if (open === null) return;
    const onScroll = () => close();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open, close]);

  if (CHROMELESS.has(pathname)) {
    return <main className="px-6 py-10">{children}</main>;
  }

  const isActive = (href: Href) => {
    const path = String(href);
    return path === "/" ? pathname === "/" : pathname.startsWith(path);
  };

  const groupActive = (group: NavGroup) => group.items.some((item) => isActive(item.href));

  /** Çubuk panelin üstünde mi? Metin ve zemin renkleri buna bağlı. */
  const overPhoto = open !== null;
  /* Çubuk yazısı panelin TONUNA uyuyor: aydınlık bir panelde (kahvaltı)
     beyaz yazı okunmuyordu. Panel kapalıyken normal koyu metin. */
  const openGroup = GROUPS.find((g) => g.title === open) ?? null;
  const tone = openGroup ? TONES[openGroup.tone] : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* YAPIŞKAN DEĞİL: çubuk sayfayla birlikte yukarı kayıp gidiyor.
          Yapışkan bir çubuk her ekranda 4.5rem yer tutuyor ve kaydırırken
          fotoğraflı panelin altından geçen içerik onun yarı saydam zeminine
          çarpıyordu. Sekmeleri görmek için sayfanın başına dönmek, gezinmeyi
          bilinçli bir hareket yapıyor.

          `relative`: fotoğraf örtüsü buna göre konumlanıyor. */}
      <header
        className="relative"
        style={{ zIndex: "var(--z-sticky)" }}
        onMouseLeave={closeSoon}
      >
        {/* --- Fotoğraf örtüsü --------------------------------------------
            Çubuğun ARKASINDAN başlıyor, yani üst bar fotoğrafın devamı.
            Önce panel çubuğun altından başlıyordu ve açık renkli bar, koyu
            fotoğrafın üstünde ayrı bir şerit gibi duruyordu — ekranın en çok
            sırıtan yeri orasıydı. Tek bir görsel iki bölgeyi de kaplayınca
            panel "açılan bir kutu" olmaktan çıkıp bölüm kapağına dönüyor. */}
        {panel !== null && (
          <PhotoBackdrop
            group={GROUPS.find((g) => g.title === panel.group)!}
            phase={panel.phase}
            isActive={isActive}
            onNavigate={close}
          />
        )}

        {/* --- Çubuk ------------------------------------------------------- */}
        <div
          className="relative border-b transition-colors"
          style={{
            height: BAR_HEIGHT,
            zIndex: 1,
            // Fotoğraf açıkken zemin ŞEFFAF: altındaki görsel görünsün.
            background: overPhoto
              ? "transparent"
              : "color-mix(in oklab, var(--color-ground) 88%, transparent)",
            borderColor: overPhoto ? "transparent" : "var(--color-border)",
            backdropFilter: overPhoto ? "none" : "blur(12px)",
            // Kısa: metin rengiyle fotoğrafın gelişi aynı anda olmalı, yoksa
            // bir an koyu yazı koyu fotoğrafın üstünde kalıyor.
            transitionDuration: "var(--dur-micro)",
          }}
        >
          <div className="mx-auto flex h-full max-w-[84rem] items-center px-5 sm:px-8">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Menüyü aç"
              className="btn-quiet -ml-2 grid size-9 place-items-center md:hidden"
              style={{ color: tone?.bar }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>

            {/* Marka SOLA dayalı ve sekmelerden belirgin büyük: ikisi aynı
                boydayken "overload" beşinci bir sekme gibi okunuyordu. */}
            <Link
              href="/"
              className="display text-xl leading-none tracking-tight transition-colors"
              style={{
                color: tone?.bar ?? "var(--color-ink)",
                transitionDuration: "var(--dur-micro)",
              }}
            >
              overload
            </Link>

            {/* Sekmeler EKRANIN ORTASINDA. `left-1/2` ile mutlak ortalama:
                akış içinde ortalamak logo ve avatarın genişliğine bağlı
                kalıyor ve ikisi değişince menü kayıyordu. */}
            <nav
              className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex"
              aria-label="Ana gezinme"
            >
              {GROUPS.map((group, index) => (
                <div
                  key={group.title}
                  className="flex items-center"
                  onMouseEnter={() => hoverOpen(group.title)}
                >
                  {/* Dikey ayraç: sekmeler arasındaki sınır boşlukla değil
                      çizgiyle çiziliyor. Boşluk tek başına dört sekmeyi tek
                      bir kelime öbeği gibi okutuyordu. */}
                  {index > 0 && (
                    <span
                      aria-hidden
                      className="h-4 w-px shrink-0 transition-colors"
                      style={{
                        background: tone?.divider ?? "var(--color-border-strong)",
                        transitionDuration: "var(--dur-micro)",
                      }}
                    />
                  )}

                  {/* Başlık bir BAĞLANTI, düğme değil: tıklayınca grubun ilk
                      ekranına gidiyor. "Antrenman"a tıklayan kişi zaten büyük
                      olasılıkla bugünkü antrenmanı istiyor.

                      Bedeli: dokunmatik bir masaüstü ekranında (>=768px,
                      hover yok) alt ekranlara üstten ulaşılamıyor — orada ilk
                      ekran açılıyor ve gezinme onun içinden sürüyor. */}
                  <Link
                    href={group.items[0]!.href}
                    aria-haspopup="true"
                    aria-expanded={open === group.title}
                    onFocus={() => hoverOpen(group.title)}
                    className="display relative block px-5 py-2 text-base tracking-tight transition-colors"
                    style={{
                      color: tone
                        ? open === group.title
                          ? tone.bar
                          : tone.barDim
                        : groupActive(group)
                          ? "var(--color-ink)"
                          : "var(--color-ink-muted)",
                      transitionDuration: "var(--dur-micro)",
                    }}
                  >
                    {group.title}
                    <ActiveMark shown={groupActive(group)} onPhoto={tone !== null} />
                  </Link>
                </div>
              ))}
            </nav>

            <div className="ml-auto">
              <ProfileMenu tone={tone} />
            </div>
          </div>
        </div>
      </header>

      {/* Telefonda aynı gezinme çekmece olarak.
          Tasarım masaüstü öncelikli ama telefonda GEZİNİLEMEZ olmak tasarım
          tercihi değil, işlev kaybı. */}
      {drawer && <Drawer isActive={isActive} onClose={() => setDrawer(false)} />}

      <main
        className={`mx-auto w-full max-w-[80rem] flex-1 px-5 pt-8 pb-16 sm:px-8 ${
          open !== null ? "behind-panel" : "behind-panel-idle"
        }`}
        // Panel açıkken arkadaki içerik tıklanamaz: bulanık bir yüzeye
        // tıklamak beklenmedik bir gezinme yapıyordu.
        inert={open !== null ? true : undefined}
      >
        {children}
      </main>
    </div>
  );
}

/** Aktif konum işareti: alt kenarda ince bir çizgi. */
function ActiveMark({ shown, onPhoto }: { shown: boolean; onPhoto: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute inset-x-5 bottom-0 h-[2px] transition-opacity"
      style={{
        background: onPhoto ? "var(--color-accent)" : "var(--color-accent-deep)",
        opacity: shown ? 1 : 0,
        transitionDuration: "var(--dur-micro)",
      }}
    />
  );
}

/* --- Fotoğraf örtüsü ve panel --------------------------------------------- */

function PhotoBackdrop({
  group,
  phase,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  phase: "in" | "out";
  isActive: (href: Href) => boolean;
  onNavigate: () => void;
}) {
  const tone = TONES[group.tone];

  return (
    <div
      className="absolute inset-x-0 top-0 hidden overflow-hidden md:block"
      style={{
        // Çubuğun üstünden başlayıp panelin altında bitiyor: tek yüzey,
        // iki bölge.
        height: `calc(${BAR_HEIGHT} + ${PANEL_HEIGHT})`,
        zIndex: 0,
        background: tone.surface,
        boxShadow: "0 18px 40px -24px oklch(21% 0.014 115 / 0.35)",
        /* Giriş perde gibi: görsel yerinde durur, açığa çıkan bölge yukarıdan
           aşağı büyür. `translateY` denendi ve çubuğun arkasındaki fotoğraf
           kayarken üst kenarda boşluk bırakıyordu.

           Çıkış sönerek: kırpmayı geri sarınca çubuğun arkasındaki fotoğraf
           en son kayboluyor ve o ana kadar açık renkli çubuk yazısı zeminini
           kaybediyordu. Sönme, yazı renginin dönüşüyle aynı anda bitiyor. */
        animation:
          phase === "in"
            ? "curtain-down var(--dur-long) var(--ease-out)"
            : "panel-fade var(--dur-short) var(--ease-out) forwards",
      }}
    >
      {/* --- Fotoğraf: soldan %75'e ------------------------------------------
          Sol kenarda geçiş YOK — görsel ekranın kenarına dayanıyor. Sağda
          panelin %60'ından %85'ine kadar zemine soluyor; kutu panelin %85'i
          olduğu için maske kutu-yerel koordinatta %70.6 ile %100 arasında
          çalışıyor.

          Menü yazısı %50'den başlıyor, yani solmanın ÖNÜNDE — bir bölümü
          tam opak görselin üstünde duruyor. Bilinçli: istenen "yazılar
          fotoğrafın üstünde olsun". Okunurluğu perde değil gölge taşıyor
          (bkz. `.on-photo-*`); perde fotoğrafı örterdi. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: "85%",
          maskImage:
            "linear-gradient(to right, #000 0%, #000 70.6%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, #000 0%, #000 70.6%, transparent 100%)",
        }}
      >
        <Photo slug={group.photo} fill className="size-full" />
      </div>

      {/* --- Menü: ekranın yarısından sonra, alt alta --------------------- */}
      <div
        className="absolute inset-y-0 right-0 left-1/2 flex flex-col justify-center pr-8 pl-6 xl:pr-16"
        style={{ paddingTop: BAR_HEIGHT }}
      >
        <p className={`label ${tone.shadow}`} style={{ color: tone.label }}>
          {group.title}
        </p>

        {/* Çerçevesiz: kutu, kenarlık, zemin yok — yalnızca tıklanabilir
            yazı. Kutulu bir liste fotoğrafın yanında ikinci bir yüzey
            kuruyor ve "fotoğraf baskın" fikrini bozuyordu. */}
        <ul className="mt-2 flex flex-col gap-0.5">
          {group.items.map((item, index) => {
            const active = isActive(item.href);
            return (
              <li
                key={String(item.href)}
                className="reveal"
                style={{ ["--i" as string]: index }}
              >
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`photo-link display ${tone.shadow} inline-block py-1 text-2xl leading-tight tracking-tight`}
                  style={{ color: tone.title }}
                >
                  {item.label}
                  <span aria-hidden className="rule" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* --- Telefon çekmecesi ---------------------------------------------------- */

function Drawer({
  isActive,
  onClose,
}: {
  isActive: (href: Href) => boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="md:hidden" style={{ zIndex: "var(--z-modal)" }}>
      <button
        type="button"
        aria-label="Menüyü kapat"
        onClick={onClose}
        className="fixed inset-0 bg-[oklch(21%_0.014_115_/_0.3)]"
        style={{ zIndex: "var(--z-modal)" }}
      />
      <nav
        aria-label="Ana gezinme"
        className="scroll-thin fixed inset-y-0 left-0 flex w-[19rem] flex-col gap-6 overflow-y-auto bg-[var(--color-ground)] px-4 py-6"
        style={{
          zIndex: "var(--z-modal)",
          animation: "reveal var(--dur-short) var(--ease-out) forwards",
        }}
      >
        <Link href="/" onClick={onClose} className="display px-2 text-lg tracking-tight">
          overload
        </Link>

        <DrawerLink item={PANEL} active={isActive(PANEL.href)} onClose={onClose} />

        {GROUPS.map((group) => (
          <div key={group.title}>
            {/* Telefonda fotoğraf grup başlığı olarak: kısa bir şerit, dikey
                kart ekranın yarısını yiyordu. */}
            <Photo slug={group.photo} ratio="21 / 9" scrim>
              <div className="flex size-full items-end p-3">
                <p className="display text-md" style={{ color: "oklch(99% 0 0)" }}>
                  {group.title}
                </p>
              </div>
            </Photo>
            <ul className="mt-2 flex flex-col gap-px">
              {group.items.map((item) => (
                <li key={String(item.href)}>
                  <DrawerLink item={item} active={isActive(item.href)} onClose={onClose} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function DrawerLink({
  item,
  active,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
}) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-[var(--color-surface-raised)] font-medium text-[var(--color-ink)]"
          : "text-[var(--color-ink-muted)]"
      }`}
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/* --- Profil --------------------------------------------------------------- */

function ProfileMenu({ tone = null }: { tone?: (typeof TONES)[keyof typeof TONES] | null }) {
  const me = useMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Dışarı tıklama ve Escape ile kapanma. Menü açıkken sayfanın geri kalanına
  // tıklamak onu kapatmalı; aksi halde kullanıcı tekrar düğmeyi aramak zorunda.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = me.data?.display_name?.trim() || me.data?.email || "";
  const initial = name ? name[0]!.toLocaleUpperCase("tr-TR") : "·";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Hesap menüsü"
        className="grid size-9 place-items-center rounded-full border text-sm font-semibold transition-colors"
        style={{
          // Panel üstündeyken cam gibi: dolu bir daire görselin üzerinde
          // yapıştırılmış duruyordu.
          borderColor: tone?.divider ?? "var(--color-border-strong)",
          background: tone ? "transparent" : "var(--color-surface)",
          color: tone?.bar ?? "var(--color-ink)",
          transitionDuration: "var(--dur-micro)",
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="card-raised absolute right-0 mt-2 w-56 overflow-hidden p-1"
          style={{
            zIndex: "var(--z-dropdown)",
            animation: "reveal var(--dur-short) var(--ease-out) forwards",
          }}
        >
          {name && (
            <p className="truncate px-3 pt-2 pb-1 text-xs text-[var(--color-ink-muted)]">
              {name}
            </p>
          )}
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--color-surface-raised)]"
          >
            Hesap ayarları
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              /* Yönlendirme çıkış isteğini BEKLEMİYOR: kullanıcı "çıkış"a
                 bastıysa ekranın anında değişmesi gerekiyor. İstek arkada
                 tamamlanıyor ve sunucudaki oturum satırını siliyor. */
              void logout();
              router.replace("/login");
            }}
            className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-raised)]"
          >
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
