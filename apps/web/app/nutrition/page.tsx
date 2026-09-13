import { PagePlaceholder } from "@/components/PagePlaceholder";

export default function NutritionPage() {
  return (
    <PagePlaceholder
      title="Beslenme"
      description="Günlük log, TDEE hedefi ve kalan makrolara göre öğün önerisi."
      planned={[
        "Günlük öğün listesi ve makro toplamı — değerler USDA / Open Food Facts'ten gelir, AI hesaplamaz",
        "Barkod okuma: paketli ürünlerde Open Food Facts'ten doğrudan veri",
        "Metin veya fotoğrafla giriş: asistan ayrıştırır → gerçek besin veritabanıyla eşleştirilir → onayına sunulur",
        "TDEE hesaplayıcı (Mifflin-St Jeor) ve hedefe göre kalori/makro dağılımı",
        "Kalan makrolara göre öğün önerisi",
      ]}
      endpoints={[
        "GET  /nutrition/day/{date}  — günlük log ve toplamlar",
        "POST /nutrition/barcode     — barkodla ürün ara",
        "GET  /nutrition/tdee        — hesaplanan hedef",
        "POST /chat/stream           — metin/fotoğrafla AI girişi",
      ]}
    />
  );
}
