import { PagePlaceholder } from "@/components/PagePlaceholder";

export default function ProgressPage() {
  return (
    <PagePlaceholder
      title="İlerleme"
      description="PR grafikleri, güç standartları ve tutarlılık ısı haritası."
      planned={[
        "Hareket bazında zaman serisi: ağırlık, hacim ve tahmini 1RM (Epley) grafiği",
        "Kişisel rekor rozetleri — dört ayrı tür: max ağırlık, max tekrar, seans hacmi, tahmini 1RM",
        "Tutarlılık ısı haritası (GitHub katkı ızgarası tarzı) — hangi günler antrenman yapılmış",
        "Güç standartları: vücut ağırlığına göre bench/squat/deadlift seviyesi",
        "Plato uyarıları: 3 seanstır ilerlemeyen hareketler ve deload önerisi",
      ]}
      endpoints={[
        "GET /progress/records           — kırılan PR'lar",
        "GET /progress/exercise/{id}     — zaman serisi",
        "GET /progress/consistency       — takvim ızgarası",
      ]}
    />
  );
}
