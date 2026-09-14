import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Providers } from "./providers";
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
  manifest: "/manifest.webmanifest",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="min-h-dvh">
        <Providers>
          <AuthGate>
            <AppShell>{children}</AppShell>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
