import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Tek grotesk aile, ayrı display font yok (Bölüm 7). `display: swap` ile
// metin font inerken bile okunur kalıyor — salonda zayıf bağlantıda önemli.
const inter = Inter({
  subsets: ["latin", "latin-ext"], // latin-ext: Türkçe ş/ğ/ı/İ
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "overload",
  description: "Progresif overload merkezli antrenman, beslenme ve sağlık takibi.",
  applicationName: "overload",
  appleWebApp: { capable: true, title: "overload", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#17171A",
  // Salonda tek elle kullanılacak: yanlışlıkla yakınlaştırma sinir bozucu,
  // ama tamamen engellemek erişilebilirliği kırar. maximumScale=5 ortası.
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover", // çentikli ekranlarda kenarlara kadar
};

const NAV = [
  { href: "/", label: "Panel" },
  { href: "/workout", label: "Antrenman" },
  { href: "/programs", label: "Programlar" },
  { href: "/progress", label: "İlerleme" },
  { href: "/nutrition", label: "Beslenme" },
  { href: "/chat", label: "Asistan" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
          <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-ground)]/95 backdrop-blur">
            <div className="flex items-center gap-6 px-4 py-3">
              <Link href="/" className="text-base font-semibold tracking-tight">
                overload
              </Link>
              {/* Masaüstü gezinme */}
              <nav className="hidden gap-1 sm:flex" aria-label="Ana gezinme">
                {NAV.slice(1).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-[3px] px-2.5 py-1.5 text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
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
              {NAV.map((item) => (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    className="flex flex-col items-center gap-0.5 py-2.5 text-2xs text-[var(--color-ink-muted)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </body>
    </html>
  );
}
