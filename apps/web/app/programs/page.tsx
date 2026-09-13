import { PagePlaceholder } from "@/components/PagePlaceholder";

export default function ProgramsPage() {
  return (
    <PagePlaceholder
      title="Programlar"
      description="Kendi programların, şablon kütüphanesi ve AI ile program oluşturma."
      planned={[
        "Kendi programlarının listesi; birini 'aktif' yapma (kullanıcı başına tek aktif program — veritabanı kısmi tekil indeksle zorluyor)",
        "Şablon kütüphanesi: StrongLifts 5x5, Starting Strength, PHUL, Reddit PPL — her biri kaynak atfıyla, salt-okunur; 'başlat' deyince kendi kopyan oluşur",
        "Manuel düzenleme: gün/hareket ekle-sil-sırala (drag & drop), set/tekrar/teknik satır içi düzenleme",
        "Superset düzenleme: aynı gruba atanan hareketler arka arkaya yapılır",
        "'AI ile oluştur' → asistan hedef/gün/ekipman sorar → tam ekran 'programı gözden geçir' → satır satır düzenle → onayla",
      ]}
      endpoints={[
        "GET  /programs                       — kendi programların",
        "GET  /programs/templates             — şablon kütüphanesi",
        "GET  /programs/{program_id}          — gün/hareket ağacı",
        "POST /programs                       — manuel oluştur",
        "POST /programs/{program_id}/clone    — şablondan kopya çıkar",
        "POST /programs/{program_id}/activate — aktif program yap",
        "PUT  /programs/{program_id}/days     — drag & drop sonrası tüm ağacı değiştir",
        "GET  /exercises                      — hareket kütüphanesinde ara",
      ]}
    />
  );
}
