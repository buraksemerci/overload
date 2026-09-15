"use client";

import { useEffect, useRef, useState } from "react";
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
import { logout } from "@/lib/auth";
import { useMe } from "@/lib/queries";

/**
 * Uygulama kabuğu — masaüstü öncelikli: kalıcı sol kenar çubuğu, sağ üstte profil.
 *
 * **Neden gruplanmış kenar çubuğu, düz bir liste değil.** On dört ekranı tek
 * bir düzlemde listelemek kullanıcıyı arama moduna sokuyor: aradığını bulmak
 * için her seferinde tüm listeyi tarıyor. Dört başlık altında ikişer-dörtlü
 * gruplar, listeyi taranacak bir şey olmaktan çıkarıp hatırlanacak bir haritaya
 * çeviriyor.
 *
 * Gruplama niyete göre, veri türüne göre değil: "bugün ne yapacağım"
 * (Antrenman), "ne yedim" (Beslenme), "vücudum ne durumda" (Vücut),
 * "birine sorayım" (Asistan).
 */

// Next 16 rotaları tipliyor: `href` gelişigüzel bir string olamaz, projede
// gerçekten var olan bir rota olmak zorunda. Bu tip onu `Link`'ten türetiyor,
// yani rota adı yanlış yazılırsa derleme zamanında yakalanıyor.
type Href = React.ComponentProps<typeof Link>["href"];

type NavItem = {
  href: Href;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

const PANEL: NavItem = { href: "/", label: "Panel", Icon: IconPanel };

const GROUPS: ReadonlyArray<{ title: string; items: readonly NavItem[] }> = [
  {
    title: "Antrenman",
    items: [
      { href: "/workout", label: "Bugün", Icon: IconDumbbell },
      { href: "/programs", label: "Programlar", Icon: IconProgram },
      { href: "/exercises", label: "Hareketler", Icon: IconLibrary },
      { href: "/history", label: "Geçmiş", Icon: IconHistory },
    ],
  },
  {
    title: "Beslenme",
    items: [
      { href: "/nutrition", label: "Günlük", Icon: IconNutrition },
      { href: "/supplements", label: "Supplement", Icon: IconSupplement },
    ],
  },
  {
    title: "Vücut",
    items: [
      { href: "/progress", label: "İlerleme", Icon: IconProgress },
      { href: "/muscle-map", label: "Kas Haritası", Icon: IconBody },
      { href: "/weight", label: "Kilo", Icon: IconScale },
      { href: "/soreness", label: "Ağrı", Icon: IconAche },
    ],
  },
  {
    title: "Asistan",
    items: [
      { href: "/chat", label: "Sohbet", Icon: IconChat },
      { href: "/coach", label: "Haftalık Rapor", Icon: IconReport },
    ],
  },
];

const CHROMELESS = new Set(["/login"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  // Rota değişince çekmece kapanır; aksi halde kullanıcı bir bağlantıya
  // dokunduktan sonra menü açık kalıyor ve gittiği sayfayı görmüyor.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  if (CHROMELESS.has(pathname)) {
    return <main className="px-6 py-10">{children}</main>;
  }

  const isActive = (href: Href) => {
    const path = String(href);
    return path === "/" ? pathname === "/" : pathname.startsWith(path);
  };

  return (
    <div className="flex min-h-dvh">
      {/* Masaüstünde kalıcı kenar çubuğu. */}
      <Sidebar isActive={isActive} className="sticky top-0 hidden h-dvh md:flex" />

      {/* Telefonda aynı menü çekmece olarak.
          Tasarım masaüstü öncelikli ama telefonda GEZİNİLEMEZ olmak tasarım
          tercihi değil, işlev kaybı. Bu yüzden ayrı bir mobil menü
          tasarlanmıyor — aynı bileşen kaydırılarak gösteriliyor. */}
      {drawer && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setDrawer(false)}
            className="fixed inset-0 bg-[oklch(21%_0.014_115_/_0.25)]"
            style={{ zIndex: "var(--z-modal)" }}
          />
          <Sidebar
            isActive={isActive}
            className="fixed top-0 left-0 flex h-dvh bg-[var(--color-ground)]"
            style={{ zIndex: "var(--z-modal)" }}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setDrawer(true)} />
        {/* Sağda soldan daha fazla nefes payı: kenar çubuğu zaten sol tarafı
            ağırlaştırıyor, içeriği de simetrik ortalamak dengeyi düzleştirir. */}
        <main className="flex-1 px-5 pt-8 pb-16 sm:px-8 xl:pr-16">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  isActive,
  className = "",
  style,
}: {
  isActive: (href: Href) => boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <aside
      style={style}
      className={`w-[232px] shrink-0 flex-col border-r border-[var(--color-border)] px-3 py-6 ${className}`}
    >
      <Link
        href="/"
        className="mb-8 px-3 text-md font-bold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        overload
      </Link>

      <nav
        className="scroll-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-2"
        aria-label="Ana gezinme"
      >
        <NavLink item={PANEL} active={isActive(PANEL.href)} />

        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="label mb-1.5 px-3">{group.title}</p>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => (
                <li key={String(item.href)}>
                  <NavLink item={item} active={isActive(item.href)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-[var(--color-surface-raised)] font-medium text-[var(--color-ink)]"
          : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
      }`}
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      {/* Aktif işaret: sol kenarda ince bir volt çubuğu.
          Voltu dolgu olarak kullanmanın en ölçülü hâli — 3px genişlik,
          ekranın binde biri. Kural 2 hâlâ geçerli: bu bir "aksiyon" değil,
          konum işareti. */}
      <span
        aria-hidden
        className="absolute left-0 h-5 w-[3px] rounded-r-full transition-opacity"
        style={{
          background: "var(--color-accent-deep)",
          opacity: active ? 1 : 0,
          transitionDuration: "var(--dur-micro)",
        }}
      />
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-ground)_88%,transparent)] px-5 backdrop-blur-md sm:px-8">
      {/* Kenar çubuğu gizlenen genişlikte menü düğmesi ve marka burada. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Menüyü aç"
        className="btn-quiet -ml-2 grid size-9 place-items-center rounded-[var(--radius-md)] md:hidden"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <Link
        href="/"
        className="text-base font-bold tracking-tight md:hidden"
        style={{ fontFamily: "var(--font-display)" }}
      >
        overload
      </Link>

      <div className="ml-auto">
        <ProfileMenu />
      </div>
    </header>
  );
}

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
