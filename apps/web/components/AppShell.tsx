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
  items: readonly NavItem[];
};

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

/**
 * Açılan panelin SABİT yüksekliği.
 *
 * Gruplar arasında gezinirken panelin boyu değişmemeli. Önce fotoğrafın
 * oranı madde sayısına göre seçiliyordu ve imleç başlıklar arasında
 * kayarken panel her seferinde zıplıyordu — okunamayan, huzursuz bir
 * hareket. Yükseklik artık gruptan bağımsız.
 */
const PANEL_HEIGHT = "clamp(20rem, 42vh, 27rem)";

const GROUPS: readonly NavGroup[] = [
  {
    title: "Antrenman",
    photo: "nav-antrenman",
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
    items: [
      { href: "/nutrition", label: "Günlük", hint: "Kalan kalori ve öğünler", Icon: IconNutrition },
      { href: "/supplements", label: "Supplement", hint: "Bugün alınacaklar", Icon: IconSupplement },
    ],
  },
  {
    title: "Vücut",
    photo: "nav-vucut",
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
    items: [
      { href: "/chat", label: "Sohbet", hint: "Sor, anlat, fotoğraf gönder", Icon: IconChat },
      { href: "/coach", label: "Haftalık Rapor", hint: "Pazartesi değerlendirmesi", Icon: IconReport },
    ],
  },
];

const CHROMELESS = new Set(["/login"]);

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

  /** Görünür durumdaki grup. Kapanırken `null` — bulanıklık hemen kalkıyor. */
  const open = panel?.phase === "in" ? panel.group : null;
  // Açılış gecikmesini kapanıştan AYRI tutuyor: ikisi aynı zamanlayıcıyı
  // paylaşsaydı, bir gruptan çıkıp diğerine girmek kapanışı iptal ederken
  // açılışı da iptal ederdi.
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Kapanış: önce yukarı kayma animasyonu, sonra DOM'dan çıkış. */
  const close = useCallback(() => {
    cancelOpen();
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    setPanel((current) => (current === null ? null : { ...current, phase: "out" }));
    exitTimer.current = setTimeout(() => setPanel(null), EXIT_MS);
  }, [cancelOpen]);

  const show = useCallback(
    (title: string) => {
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
      setPanel({ group: title, phase: "in" });
    },
    [],
  );

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

  // Rota değişince menüler kapanır; aksi halde kullanıcı bir bağlantıya
  // dokunduktan sonra panel açık kalıyor ve gittiği sayfayı görmüyor.
  useEffect(() => {
    cancelClose();
    cancelOpen();
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    setPanel(null);
    setDrawer(false);
  }, [pathname, cancelClose, cancelOpen]);

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

  if (CHROMELESS.has(pathname)) {
    return <main className="px-6 py-10">{children}</main>;
  }

  const isActive = (href: Href) => {
    const path = String(href);
    return path === "/" ? pathname === "/" : pathname.startsWith(path);
  };

  const groupActive = (group: NavGroup) => group.items.some((item) => isActive(item.href));

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky top-0 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-ground)_88%,transparent)] backdrop-blur-md"
        style={{ zIndex: "var(--z-sticky)" }}
        onMouseLeave={closeSoon}
      >
        <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-2 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Menüyü aç"
            className="btn-quiet -ml-2 grid size-9 place-items-center md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          {/* Marka yazısı hem kimlik hem ana sayfa bağlantısı. Sekmelerden
              belirgin biçimde büyük: ikisi aynı boyda olunca "overload" beşinci
              bir sekme gibi okunuyordu. */}
          <Link href="/" className="display mr-8 text-lg leading-none tracking-tight">
            overload
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Ana gezinme">
            {GROUPS.map((group) => (
              <div key={group.title} onMouseEnter={() => hoverOpen(group.title)}>
                {/* Başlık bir BAĞLANTI, düğme değil: tıklayınca grubun ilk
                    ekranına gidiyor. "Antrenman"a tıklayan kişi zaten büyük
                    olasılıkla bugünkü antrenmanı istiyor; onu bir menü açıp
                    ikinci bir tıklamaya zorlamak gereksiz bir adımdı.

                    Panel yine imleçle açılıyor. Bedeli: dokunmatik bir
                    masaüstü ekranında (>=768px, hover yok) alt ekranlara
                    üstten ulaşılamıyor — orada ilk ekran açılıyor ve
                    gezinme onun içinden sürüyor. */}
                <Link
                  href={group.items[0]!.href}
                  aria-haspopup="true"
                  aria-expanded={open === group.title}
                  onFocus={() => hoverOpen(group.title)}
                  /* Display fontu: marka yazısıyla aynı aile. Sekmeler gövde
                     ailesindeyken "overload" tek başına farklı bir dil
                     konuşuyordu; aynı yüz üst çubuğu tek bir imza hâline
                     getiriyor. Sıkışık yüz bu puntoda hak ettiği ağırlıkta. */
                  className={`display relative block px-3.5 py-2 text-base tracking-tight transition-colors ${
                    open === group.title || groupActive(group)
                      ? "text-[var(--color-ink)]"
                      : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  }`}
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  {group.title}
                  <ActiveMark shown={groupActive(group)} />
                </Link>
              </div>
            ))}
          </nav>

          <div className="ml-auto">
            <ProfileMenu />
          </div>
        </div>

        {/* Panel başlığın DIŞINDA değil içinde: `onMouseLeave` başlığa bağlı
            olduğu için panele inen imleç hâlâ "içeride" sayılıyor ve
            kapanma tetiklenmiyor. */}
        {panel !== null && (
          <MegaPanel
            group={GROUPS.find((g) => g.title === panel.group)!}
            phase={panel.phase}
            isActive={isActive}
            onNavigate={close}
          />
        )}
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
function ActiveMark({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute inset-x-3 -bottom-[7px] h-[2px] transition-opacity"
      style={{
        background: "var(--color-accent-deep)",
        opacity: shown ? 1 : 0,
        transitionDuration: "var(--dur-micro)",
      }}
    />
  );
}

/* --- Açılan geniş panel --------------------------------------------------- */

function MegaPanel({
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
  return (
    <div
      // Dış kap `overflow-hidden`: içerideki yüzey tam boyundan yukarıda
      // başlayıp aşağı kayıyor ve taşan kısım kırpılıyor. Perde etkisi bu.
      className="absolute inset-x-0 top-full hidden overflow-hidden border-b border-[var(--color-border)] md:block"
      style={{
        zIndex: "var(--z-dropdown)",
        boxShadow: "0 18px 40px -24px oklch(21% 0.014 115 / 0.3)",
        // Sabit yükseklik: gruplar arasında gezinirken panel zıplamıyor.
        height: PANEL_HEIGHT,
      }}
    >
      <div
        className="size-full"
        style={{
          animation:
            phase === "in"
              ? "panel-down var(--dur-long) var(--ease-out)"
              : // `forwards`: animasyon bittiğinde yukarıda KALIYOR. Olmadan
                // son karede geri düşüp bir an görünüyordu.
                "panel-up var(--dur-short) var(--ease-in) forwards",
        }}
      >
        {/* Fotoğraf paneli TAMAMEN kaplıyor — kenardan kenara, kartsız.
            Önce 22rem'lik bir sütundaydı ve panelin geri kalanı boş beyazdı;
            fotoğraf bir öğeydi, zemin değil. Zemin olunca panel bir bölüm
            kapağı gibi okunuyor. */}
        <Photo slug={group.photo} fill scrim className="size-full">
          <div className="mx-auto flex size-full max-w-[80rem] flex-col justify-end gap-1 px-5 pb-8 sm:px-8">
            <p className="label" style={{ color: "oklch(84% 0.01 115)" }}>
              {group.title}
            </p>

            {/* Çerçevesiz: kutu, kenarlık, zemin yok — yalnızca tıklanabilir
                yazı. Kutulu bir liste fotoğrafın üstünde ikinci bir yüzey
                kuruyor ve "fotoğraf baskın" fikrini bozuyordu.

                Dokunma hedefi yine de büyük: satırlar `py-1.5` ve display
                yüzü bu puntoda yüksek. */}
            <ul className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
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
                      className="photo-link display block py-1.5 text-2xl leading-none tracking-tight"
                      style={{ color: "oklch(99% 0 0)" }}
                    >
                      {item.label}
                      <span aria-hidden className="rule" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </Photo>
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

function ProfileMenu() {
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
        className="grid size-9 place-items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-sm font-semibold transition-colors hover:bg-[var(--color-surface-raised)]"
        style={{ transitionDuration: "var(--dur-micro)" }}
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
              logout();
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
