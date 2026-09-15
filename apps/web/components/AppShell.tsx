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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const closeSoon = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(null), CLOSE_DELAY);
  }, [cancelClose]);

  // Rota değişince menüler kapanır; aksi halde kullanıcı bir bağlantıya
  // dokunduktan sonra panel açık kalıyor ve gittiği sayfayı görmüyor.
  useEffect(() => {
    cancelClose();
    setOpen(null);
    setDrawer(false);
  }, [pathname, cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
        <div className="mx-auto flex h-14 max-w-[80rem] items-center gap-2 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Menüyü aç"
            className="btn-quiet -ml-2 grid size-9 place-items-center rounded-[var(--radius-md)] md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <Link
            href="/"
            className="mr-4 text-base font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            overload
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Ana gezinme">
            <TopLink href={PANEL.href} label={PANEL.label} active={isActive(PANEL.href)} />

            {GROUPS.map((group) => (
              <div key={group.title} onMouseEnter={() => { cancelClose(); setOpen(group.title); }}>
                <button
                  type="button"
                  aria-expanded={open === group.title}
                  aria-haspopup="true"
                  onClick={() => setOpen(open === group.title ? null : group.title)}
                  className={`relative flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors ${
                    open === group.title || groupActive(group)
                      ? "text-[var(--color-ink)]"
                      : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  }`}
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  {group.title}
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden
                    className="mt-px shrink-0 transition-transform"
                    style={{
                      transform: open === group.title ? "rotate(180deg)" : "none",
                      transitionDuration: "var(--dur-micro)",
                    }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  <ActiveMark shown={groupActive(group)} />
                </button>
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
        {open !== null && (
          <MegaPanel
            group={GROUPS.find((g) => g.title === open)!}
            isActive={isActive}
            onNavigate={() => setOpen(null)}
          />
        )}
      </header>

      {/* Telefonda aynı gezinme çekmece olarak.
          Tasarım masaüstü öncelikli ama telefonda GEZİNİLEMEZ olmak tasarım
          tercihi değil, işlev kaybı. */}
      {drawer && <Drawer isActive={isActive} onClose={() => setDrawer(false)} />}

      <main className="mx-auto w-full max-w-[80rem] flex-1 px-5 pt-8 pb-16 sm:px-8">
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
      className="absolute inset-x-3 -bottom-[7px] h-[2px] rounded-full transition-opacity"
      style={{
        background: "var(--color-accent-deep)",
        opacity: shown ? 1 : 0,
        transitionDuration: "var(--dur-micro)",
      }}
    />
  );
}

function TopLink({
  href,
  label,
  active,
}: {
  href: Href;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors ${
        active
          ? "text-[var(--color-ink)]"
          : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      }`}
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      {label}
      <ActiveMark shown={active} />
    </Link>
  );
}

/* --- Açılan geniş panel --------------------------------------------------- */

function MegaPanel({
  group,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  isActive: (href: Href) => boolean;
  onNavigate: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 top-full hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] md:block"
      style={{
        zIndex: "var(--z-dropdown)",
        animation: "reveal var(--dur-short) var(--ease-out) forwards",
        boxShadow: "0 18px 40px -24px oklch(21% 0.014 115 / 0.22)",
      }}
    >
      <div className="mx-auto grid max-w-[80rem] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-12">
        {/* Büyük fotoğraf, üzerinde grup adı. Panel açıldığında hangi bölgede
            olduğun yazıyı okumadan önce anlaşılıyor.

            Oran madde sayısına göre: dört maddeli grupta liste iki sütun ve
            iki satır, yani dikey kart onunla aynı boyda. İki maddeli grupta
            aynı dikey kartı kullanmak panelin yarısını boş bırakıyordu. */}
        <Photo
          slug={group.photo}
          ratio={group.items.length > 2 ? "4 / 5" : "16 / 10"}
          className="rounded-[var(--radius-lg)]"
          scrim
        >
          <div className="flex size-full items-end p-6">
            <p className="display text-2xl" style={{ color: "oklch(99% 0 0)" }}>
              {group.title}
            </p>
          </div>
        </Photo>

        <ul
          className={`grid content-start gap-2 ${
            group.items.length > 2 ? "sm:grid-cols-2" : ""
          }`}
        >
          {group.items.map((item, index) => {
            const { Icon } = item;
            const active = isActive(item.href);
            return (
              <li key={String(item.href)} className="reveal" style={{ ["--i" as string]: index }}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3.5 transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{
                    transitionDuration: "var(--dur-micro)",
                    background: active ? "var(--color-surface-raised)" : undefined,
                  }}
                >
                  <Icon className="mt-0.5 size-[19px] shrink-0 text-[var(--color-ink-faint)]" />
                  <span className="min-w-0">
                    {/* Orta-büyük: bu panelin asıl okunan yazısı. */}
                    <span className="block text-md leading-tight font-medium">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-ink-faint)]">
                      {item.hint}
                    </span>
                  </span>
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
        <Link
          href="/"
          onClick={onClose}
          className="px-2 text-md font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          overload
        </Link>

        <DrawerLink item={PANEL} active={isActive(PANEL.href)} onClose={onClose} />

        {GROUPS.map((group) => (
          <div key={group.title}>
            {/* Telefonda fotoğraf grup başlığı olarak: kısa bir şerit, dikey
                kart ekranın yarısını yiyordu. */}
            <Photo slug={group.photo} ratio="21 / 9" className="rounded-[var(--radius-md)]" scrim>
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
