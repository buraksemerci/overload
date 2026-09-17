import type { Metadata } from "next";

/**
 * Sekme başlığı. Sayfanın kendisi bir istemci bileşeni ve `metadata`
 * dışa aktaramıyor; bölüm düzeni (layout) sunucuda çalıştığı için başlık
 * buradan veriliyor. Kök düzendeki şablon sonuna "· overload" ekliyor.
 */
export const metadata: Metadata = {
  title: "Geçmiş",
  description: "Tamamlanan antrenmanlar, haftalık tonaj ve seans ayrıntıları.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
