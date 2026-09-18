/**
 * 404.
 *
 * Next'in varsayılan sayfası siyah beyaz bir sistem yazısı: uygulamanın
 * içindeyken oraya düşmek "site bozuldu" hissi veriyor. Aynı bant, aynı yazı
 * ailesi, tek bir çıkış yolu — ve suçlama yok ("yanlış yazdın" demiyor;
 * bağlantı eski de olabilir).
 */

import Link from "next/link";
import { Hero, Page } from "@/components/Layout";

export const metadata = {
  title: "Sayfa yok",
};

export default function NotFound() {
  return (
    <Page>
      <Hero
        photo="app-entry"
        size="md"
        eyebrow="404"
        title="Bu sayfa yok"
        lead="Adres değişmiş ya da bağlantı eskimiş olabilir. Panelden devam edebilirsin."
        actions={
          <Link href="/" className="btn btn-primary px-6 py-3">
            Panele dön
          </Link>
        }
      />
    </Page>
  );
}
