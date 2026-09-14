"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

/**
 * Uygulama kabuğu: başlık, gezinme, içerik.
 *
 * İstemci bileşeni çünkü aktif rotayı bilmesi gerekiyor (`usePathname`) —
 * giriş ekranında gezinme çubuğu gösterilmemeli ve aktif sekme
 * işaretlenmeli.
 */

/** Mobil alt çubukta görünen ana rotalar — en sık kullanılan beşi. */
const PRIMARY = [
  { href: "/", label: "Panel" },
  { href: "/workout", label: "Antrenman" },
  { href: "/nutrition", label: "Beslenme" },
  { href: "/progress", label: "İlerleme" },
  { href: "/chat", label: "Asistan" },
] as const;

/** Masaüstü başlığındaki tam liste. */
const SECONDARY = [
  { href: "/programs", label: "Programlar" },
  { href: "/exercises", label: "Hareketler" },
  { href: "/history", label: "Geçmiş" },
  { href: "/muscle-map", label: "Kas Haritası" },
  { href: "/weight", label: "Kilo" },
  { href: "/supplements", label: "Supplement" },
  { href: "/soreness", label: "Ağrı" },
  { href: "/coach", label: "Koç Raporu" },
] as const;

const CHROMELESS = new Set(["/login"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (CHROMELESS.has(pathname)) {
    return <main className="px-4 py-6">{children}</main>;
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-ground)]/95 backdrop-blur">
        <div className="flex items-center gap-4 px-4 py-3">
          <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
            overload
          </Link>

          <nav className="hidden min-w-0 flex-1 gap-0.5 overflow-x-auto sm:flex" aria-label="Ana gezinme">
            {[...PRIMARY.slice(1), ...SECONDARY].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`shrink-0 rounded-[3px] px-2 py-1.5 text-xs transition-colors ${
                  isActive(item.href)
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href="/account"
              className="rounded-[3px] px-2 py-1.5 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Hesap
            </Link>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-[3px] px-2 py-1.5 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-24 sm:pb-6">{children}</main>

      {/* Mobil alt gezinme — salonda başparmakla erişilebilir olmalı.
          Güvenli alan dolgusu iPhone'da ana ekran çubuğunun altında kalmasın diye. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Mobil gezinme"
      >
        <ul className="flex">
          {PRIMARY.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className="flex flex-col items-center gap-0.5 py-2.5 text-2xs"
                style={{
                  color: isActive(item.href)
                    ? "var(--color-accent)"
                    : "var(--color-ink-muted)",
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
