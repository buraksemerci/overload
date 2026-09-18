"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTENT_WIDTH } from "@/components/Layout";
import { Drawer } from "@/components/nav/Drawer";
import { PhotoBackdrop } from "@/components/nav/PhotoBackdrop";
import { ProfileMenu } from "@/components/nav/ProfileMenu";
import {
  BAR_HEIGHT,
  GROUPS,
  TONES,
  type Href,
  type NavGroup,
} from "@/components/nav/items";
import { OfflineNote } from "@/components/OfflineNote";
import { HAS_SMALL } from "@/lib/photo-sm";

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

const CHROMELESS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify",
  // Oturum VAR ama gezinme yok: tanışma akışı bitmeden menüdeki ekranların
  // çoğu boş ya da eksik hesap gösterir. Akışın tek çıkışı kendi sonu.
  "/onboarding",
]);


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
   * tarayıcı boşa çıkınca. Kullanıcı gezinmeye dokunana kadar çoktan
   * önbellekte oluyor.
   *
   * `srcset` ısınmaya da veriliyor: yoksa telefonda TAM BOY dört kare
   * iniyordu (~900 kB), oysa çekmecedeki kutu 19rem — orada küçük varyant
   * gösteriliyor. Isınma ile gerçek kutu aynı adayı seçmezse önbellek
   * ıskalanıyor ve dosya iki kez iniyor.
   */
  useEffect(() => {
    const warm = () => {
      /* Masaüstünde fotoğraf çubuğun altındaki panelde tam genişlik;
         telefonda çekmecedeki 19rem'lik kutuda. `PhotoBackdrop` ve
         `Drawer` ile aynı değerler. */
      const wide = window.matchMedia("(min-width: 768px)").matches;
      for (const group of GROUPS) {
        const image = new Image();
        if (HAS_SMALL.has(group.photo)) {
          image.sizes = wide ? "(min-width: 1600px) 100vw, 1200px" : "19rem";
          image.srcset = `/photos/${group.photo}-sm.jpg 1200w, /photos/${group.photo}.jpg 2400w`;
        }
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
    /* Oturumsuz ekranların hepsi kendi dolgusunu yönetiyor: giriş anlatısı
       tam genişlik bir sahneyle ve yapışkan bir çubukla başlıyor; parola ve
       doğrulama ekranları da fotoğraflı bir kabukla ekranın kenarına
       dayanıyor. Dışarıdan verilen dikey dolgu ikisini de bozuyordu. */
    return <main className="px-6">{children}</main>;
  }

  const isActive = (href: Href) => {
    const path = String(href);
    return path === "/" ? pathname === "/" : pathname.startsWith(path);
  };

  const groupActive = (group: NavGroup) => group.items.some((item) => isActive(item.href));

  /** Çubuk panelin üstünde mi? Zemin rengi buna bağlı. */
  const overPhoto = open !== null;
  /* Çubuk yazısı panelin TONUNA uyuyor: aydınlık bir panelde (kahvaltı)
     beyaz yazı okunmuyordu. Panel kapalıyken çubuk her ekranın giriş
     bandının üstünde duruyor — yani koyu tonda, beyaz yazıyla. */
  const openGroup = GROUPS.find((g) => g.title === open) ?? null;
  const tone = openGroup ? TONES[openGroup.tone] : TONES.dark;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* YAPIŞKAN DEĞİL: çubuk sayfayla birlikte yukarı kayıp gidiyor.
          Yapışkan bir çubuk her ekranda 4.5rem yer tutuyor ve kaydırırken
          fotoğraflı panelin altından geçen içerik onun yarı saydam zeminine
          çarpıyordu. Sekmeleri görmek için sayfanın başına dönmek, gezinmeyi
          bilinçli bir hareket yapıyor.

          `relative`: fotoğraf örtüsü buna göre konumlanıyor. */}
      {/* Çubuk akışta DEĞİL, sayfanın üstünde: her ekran bir fotoğraf
          bandıyla açılıyor ve çubuk o bandın üstünde cam — giriş ekranındaki
          gibi. Akışta dururken bandın üstünde kırık beyaz bir şerit
          kalıyordu. */}
      {/* İçeriğe atlama: klavyeyle gelen kişi her ekranda önce on bağlantılık
          gezinmeyi geçmek zorundaydı. Görünmez ama odaklanınca beliriyor. */}
      <a
        href="#icerik"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:bg-[var(--color-surface-raised)] focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm"
      >
        İçeriğe geç
      </a>

      <header
        className="absolute inset-x-0 top-0"
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
            // Kapalıyken giriş ekranının çubuğuyla aynı cam.
            background: overPhoto ? "transparent" : "oklch(12% 0.01 115 / 0.38)",
            borderColor: overPhoto ? "transparent" : "oklch(99% 0 0 / 0.1)",
            backdropFilter: overPhoto ? "none" : "blur(12px)",
            WebkitBackdropFilter: overPhoto ? "none" : "blur(12px)",
            // Kısa: metin rengiyle fotoğrafın gelişi aynı anda olmalı, yoksa
            // bir an koyu yazı koyu fotoğrafın üstünde kalıyor.
            transitionDuration: "var(--dur-micro)",
          }}
        >
          {/* Panel açıkken çubuk şeffaf ve yazılar DOĞRUDAN fotoğrafın
              üstünde. "overload" tam da salon penceresinin ışığına denk
              geliyordu ve beyaz yazı kayboluyordu. Panelin kendi bağlantıları
              gibi çubuk da gölgeyle okunuyor — perde fotoğrafı örterdi.
              `text-shadow` kalıtımla iniyor, tek yerde veriliyor. */}
          <div
            className={`mx-auto flex h-full items-center px-5 sm:px-8 ${CONTENT_WIDTH} ${
              overPhoto ? tone.shadow : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Menüyü aç"
              className="btn-quiet -ml-2 grid size-9 place-items-center md:hidden"
              style={{ color: tone.bar }}
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
                color: tone.bar,
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
                        background: tone.divider,
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
                      color:
                        open === group.title || (open === null && groupActive(group))
                          ? tone.bar
                          : tone.barDim,
                      transitionDuration: "var(--dur-micro)",
                    }}
                  >
                    {group.title}
                    <ActiveMark shown={groupActive(group)} />
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

      {/* Çubuk `main`in DIŞINDA: `main` üzerinde her zaman bir filtre var ve
          filtreli bir öğe `fixed` torunları için konum kabı oluyor. */}
      <OfflineNote />

      <main
        id="icerik"
        className={`w-full flex-1 px-5 pb-20 sm:px-8 ${
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

/** Aktif konum işareti: alt kenarda ince bir çizgi. Çubuk hep koyu bir
    zeminin üstünde, volt dolgu orada ışık gibi okunuyor. */
function ActiveMark({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute inset-x-5 bottom-0 h-[2px] transition-opacity"
      style={{
        background: "var(--color-accent)",
        opacity: shown ? 1 : 0,
        transitionDuration: "var(--dur-micro)",
      }}
    />
  );
}
