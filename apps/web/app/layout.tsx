import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Geist } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { OnboardingGate } from "@/components/OnboardingGate";
import { Providers } from "./providers";
import "./globals.css";

// İki aile: sıkışık endüstriyel bir display + temiz bir arayüz groteski.
//
// Inter kaldırıldı. Teknik bir kusuru yok ama her modelin varsayılanı olduğu
// için kullanıldığı her yerde "üretilmiş" hissi veriyor.
//
// `latin-ext` alt kümesi ZORUNLU: Türkçe ş/ğ/ı/İ/ö/ü/ç orada. Bu alt küme
// olmadan başlıklar kutu karakterlerle doluyor.
// `display: swap` — font inerken metin okunur kalıyor.

// İkisi de değişken font: tek dosya bütün ağırlıkları taşıyor, ayrı ayrı
// ağırlık istemek gereksiz istek demek olurdu.
const display = Big_Shoulders({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-big-shoulders",
});

const sans = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  // Şablon: alt ekranların başlığı "Kilo · overload" olarak çıkıyor. Sekme
  // kalabalığında hangi ekranda olduğun görünüyor; kök sayfa sade kalıyor.
  title: { default: "overload", template: "%s · overload" },
  description: "Progresif overload merkezli antrenman, beslenme ve sağlık takibi.",
  /* Paylaşım görselinin mutlak adresi buradan çözülüyor. Değişken yoksa
     yerel adres: geliştirme sırasında uyarı çıkmasın, üretimde dağıtım
     rehberindeki `NEXT_PUBLIC_SITE_URL` dolduruluyor. */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: "overload",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "overload", statusBarStyle: "default" },
  /* Bağlantı paylaşıldığında görünen kart. Görsel uygulamanın kendi
     salonundan: ön izleme ile ekranın açılışı aynı sahneyi gösteriyor. */
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "overload",
    title: "overload",
    description: "Progresif overload merkezli antrenman, beslenme ve sağlık takibi.",
    images: [{ url: "/photos/app-gym-wide.jpg", width: 2400, height: 1350 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // Koyu tema zemini (--color-ground). Tarayıcı arayüzü sayfayla aynı renkte.
  themeColor: "#0d0e0b",
  // Salonda tek elle kullanılacak: yanlışlıkla yakınlaştırma sinir bozucu,
  // ama tamamen engellemek erişilebilirliği kırar. maximumScale=5 ortası.
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover", // çentikli ekranlarda kenarlara kadar
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <AuthGate>
            <OnboardingGate>
              <AppShell>{children}</AppShell>
            </OnboardingGate>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
