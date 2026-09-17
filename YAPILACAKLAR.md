# Yapılacaklar — tasarım yenilemesi

Bu liste çalışırken güncelleniyor. `[x]` bitti, `[~]` sürüyor, `[ ]` sırada.
Bir madde bitince altına kısa bir not düşülüyor.

**Hedef:** giriş ekranındaki sinematik dil (karanlık salon, sıcak ışık, büyük
yazı) uygulamanın bütün ekranlarında. Koyu tema. Geniş, dolu, sade; grafikler,
fotoğraflar, ödül alacak kalitede UI/UX.

**Şu an:** ince ayar turu — erişilebilirlik, performans ve dayanıklılık detayları.

---

## 0. Temel

- [x] İçerik genişliği 68rem → 88rem (`CONTENT_WIDTH`), üst çubuk aynı çizgide
- [x] Her ekran fotoğraflı giriş bandıyla açılıyor (`Hero`, `HeroStats`)
- [x] Üst çubuk bandın üstünde cam (giriş ekranındaki gibi)
- [x] Gece karosu, cam, `lift` sınıfları; gece belirteçleri
- [x] Grafik bileşenleri: `Bars`, `Trend`, `Ring`, `Meter` (`components/Charts.tsx`)
- [x] Pano hesapları saf fonksiyonlarda + birim testleri (`lib/stats.ts`)
- [x] Fotoğraflar: giriş videosunun salonundan 15 kare (Higgsfield + video kareleri,
      `scripts/app-photos.mjs`)
- [x] **Koyu tema** — belirteçler, volt üstü yazı rengi (`--color-on-accent`), rozetler,
      ısı ölçeği, tema rengi/manifest `#0d0e0b`
  - Giriş ekranının telefon ekranı `.theme-light` ile açık kalıyor (videoyla aynı)
- [x] Bütün ekranlar bantla açılıyor — yüklenirken ve hata verirken de
      (pano, beslenme, antrenman, hesap, vücut, geçmiş, ağrı, program düzenleme,
      program onayı, asistan). Saydam üst çubuk artık hiçbir durumda içeriğin
      üstüne binmiyor.
  - Program düzenleme ve onay ekranında hata durumunda sonsuz "yükleniyor"
    hatası da düzeldi (hata kontrolü önce).
- [x] Kayma (CLS) denetimi: 15 ekran ölçüldü (masaüstü ve 390px).
  - Önce: mobilde antrenman 0,100 / programlar 0,091 / beslenme 0,043 / ağrı 0,041.
  - Sonra: hepsi ≤0,024. Düzeltmeler: banttaki yer tutucular gelecek içerikle aynı
    yükseklikte, ağrı ekranının açılış cümlesi iki satır, harita karosunun alt sınırı.
  - Ölçüm aracı: `e2e/_cls.spec.ts` (geçici, commit edilmiyor).
- [x] Mobil (390px) ve tablet (768px) turu yapıldı
- [x] Hareket azaltma tercihinde bandın fotoğrafı hiç hareket etmiyor (+ e2e testi)
- [x] Öğün ve salon fotoğrafları tamam (akşam, ara öğün, tebeşir dahil); README güncellendi
- [x] TEK görsel dili: boş durumlar, program hedefleri, ekipman karoları ve menü
      panelleri de aynı salondan. Eski Unsplash setleri (empty-*, goal-*, nav-*,
      equipment-*) silindi; makine ve kablo kareleri üretildi. 45 → 26 dosya.

## 1. Pano (`/`)

- [x] Bant: selamlama, günün işi, 4 büyük sayı
- [x] Haftalık tonaj grafiği, kalori halkası + makrolar, kas dengesi mini harita,
      kilo eğrisi, tutarlılık ızgarası, haftalık rapor karosu, son antrenmanlar,
      bölüm karoları
- [x] Koyu temada kontrol
- [x] Boş hesap görünümü kontrol edildi: her karo veri yerine davet cümlesi gösteriyor
      (tonaj, kalori halkası, kas dengesi, tutarlılık, rekor rafı)

## 2. Vücut

- [x] Yeni özet ekranı `/body` — tek cümle + 4 sayı + harita + kilo + ağrı + güç + rekor
- [x] Menüde "Vücut → Özet" ilk sırada; panodaki "Vücut" karosu buraya gidiyor
- [x] Kas haritası bileşeni modernleşti: gece sahnesi, ön+arka yan yana, ışıma
- [x] `/muscle-map` ekranı yeni harita ile: seçilen kasın detay paneli, aralık seçici,
      denge skoru, kas listesi
  - Bant: denge %, hedefte/eksik/fazla/toplam set. Sahne: gece zemininde ön+arka,
    yanında seçili kas (seçim yoksa en geride kalan), "sonra gelenler", ön/arka dengesi.
    Liste iki sütun, satıra dokununca kas seçiliyor, hedef çizgisi işaretli.
- [x] `/progress` yeniden: güç seviyeleri büyük, rekor rafı, hareket grafiği
  - Bant: ortanca güç seviyesi, en güçlü hareket (× VA), rekor sayısı, haftalık seri, 12 ay.
  - Gece karosunda hareket başına büyük 1RM + beş basamaklı seviye merdiveni.
  - Rekor rafı: kart başına tek büyük sayı. Tutarlılık: gün / haftada / en uzun seri +
    büyük ızgara (dar ekranda en yeniye kayıyor). Grafik: rekorlu hareket kısayolları.
  - `consistencySummary`, `strengthSummary` saf fonksiyon + 7 yeni birim testi.
- [x] `/weight` yeniden: büyük eğri, hedefe göre hız, hızlı tartı girişi
  - Bantta tartı girişi: dünkü kiloyla dolu, ±0,1 düğmeleri, tek dokunuşla kaydet.
  - Bant: güncel, haftalık hız, 30 gün, 7 günlük ortalama; cümle hedefe göre yorum.
  - Gece karosunda 30/90/180 gün eğrisi (ortalama volt alan, ölçüm kesikli), tam sayı eksen.
  - "Hedefe göre hız": beslenme hedefinden (yağ kaybı/koruma/kas) vücut ağırlığına oranlı
    sağlıklı bant ve bugünkü hızın yeri. Haftalık ortalamalar tablosu.
  - `weeklyRate`, `rateBand`, `rateVerdict`, `weeklyAverages` + 5 birim testi; 2 yeni e2e.
- [x] `/soreness` yeniden: vücut üzerinde ağrı işaretleme
  - Haritada bölgeye dokun → seviye paneli. Ağrı için AYRI renk ailesi (kehribar),
    hacim voltuyla karışmıyor; 4. seviye ışıyor.
  - Bant: bölge sayısı, en yüksek seviye, aktif sakatlık. Sağ sütun: bugün listesi
    (şiddet kutucukları), "bugün için" tavsiye kartı, son 7 gün şeridi.
  - `MuscleMap` artık `scale="soreness"` destekliyor; yeni e2e: haritadan işaretleme.

## 3. Antrenman

- [x] `/workout` bant + seans akışı yeniden (sahne + günün hareketleri yan sütunu,
      bantta set/süre/hareket/tonaj, ilerleme çubuğu)
- [x] Kod geliştirmeleri: ekran uyanık kalıyor (Wake Lock), titreşim, plaka
      hesaplayıcı (`lib/plates.ts` + test), ±15 sn dinlenme, ağırlık adımı ekipmana göre,
      yarım kalan set taslakları yerelde saklanıyor, önceki seti tekrarla
- [x] Set silme: kayıtlı seti sahneden sil (`DELETE /workouts/sets/{id}` vardı, arayüzde
      karşılığı yoktu); yanlışlıkla açılan boş slotu haritadan "−" ile geri al
- [x] Isınma seti işaretlenebiliyor: kayıt tutuluyor ama hacme, rekora ve ilerleme
      motoruna girmiyor (sunucu `is_warmup` alanına bakıyordu, arayüzde karşılığı yoktu)
- [x] Plana bir set daha eklenebiliyor (haritadaki "+"): sunucu plan dışı sırayı
      zaten kabul ediyordu, ekranda slot açılmıyordu. Kaydedilmiş fazladan setler
      sayfa yenilense de görünüyor (sunucudaki en yüksek sıradan türetiliyor).
- [x] Kayıtlı bir sete haritadan dönünce ekran bunu söylüyor ("Bu set kayıtlı —
      değiştirirsen üzerine yazılır", düğme "Seti güncelle"). Sunucu zaten üzerine
      yazıyordu; arayüz sessizdi.
- [x] Klavye kısayolları: Enter seti kaydeder, dinlenmede Enter atlar, ← → ±15 sn;
      ok tuşları alanlarda adım adım değiştirir. Alana yazarken kısayol kapalı
      (`useHotkeys`), kısayol listesi günün hareketleri sütununun altında yazıyor.
- [x] `/programs`: aktif program BANDIN kendisi (hedef fotoğrafı, ad, gün/hareket sayısı,
      "bugünkü antrenman"), altında program günleri kartları; diğerleri ve şablonlar açılır
- [x] `/exercises`: bantta cam arama kutusu + sayılar; ekipman karoları büyüdü
- [x] `/history` bant + haftalık tonaj grafiği + seans kartları
  - Bant: toplam ton, seans (bu ay), set, rekor. Gece karosunda son 12 haftanın tonajı.
  - Satır yerine kart ızgarası: büyük gün rakamı, hareket adları, rozetler.
- [x] Program onayı ekranı: bant + gün/hareket/set sayıları + gece karosunda gerekçe

## 4. Beslenme

- [x] `/nutrition` bant (kalan kalori halkası) + öğün fotoğrafları + makrolar + gün gezinmesi
- [x] `/supplements`: bantta bugün/işaretlenen/tanımlı sayıları, satırlar büyüdü

## 5. Asistan

- [x] `/chat` bant + büyük örnek kartları + "nasıl çalışıyor" yan sütunu +
      günlük kullanım göstergesi + yapışık yazı alanı
- [x] `/coach`: haftanın sayıları banda çıktı, rapor metni büyük ve 62ch okuma genişliğinde

## 6. Hesap ve diğerleri

- [x] `/account` bant + kimlik bloğu
- [x] `/onboarding`: açılış adımı tam genişlik sahne (salona giren kişi), büyük başlık
- [x] Giriş ekranı koyu temada kontrol edildi: anlatı sahneleri ve finalde
      telefon ekranındaki açık temalı form yerinde
- [x] Parola kurtarma / doğrulama ekranları: fotoğraflı ikili kabuk (`components/AuthScreen.tsx`)
  - Geniş ekranda solda salon sağda form; dar ekranda fotoğraf tam sayfa, perde ağır.

## 7. Kalite

- [x] e2e testleri yeni tasarıma göre güncellendi (pano, antrenman, beslenme, hoş geldin)
- [x] Tasarım kuralları testi: yeni ekran `/body` eklendi (124/124 geçti)
- [x] Tam test paketi (393 e2e) + `pnpm build` başarılı
  - Gezinme testi paralel yük altında derleme gecikmesiyle düşüyordu; bekleme 20 sn.
- [x] Commit: "Koyu tema ve sinematik ekranlar" (2026-09-17)
- [x] ROADMAP güncellendi (Bölüm 5 ve yeni Bölüm 8: koyu tema ve sinematik dil)
- [x] Sekme başlıkları: her bölümün kendi `layout.tsx` metadata'sı ("Kilo · overload")
- [x] Dar ekranda yatay kayma denetimi testi (`design-rules`)
- [x] Menüdeki eski Unsplash kareleri kaldırıldı; menü ve bant aynı salonu gösteriyor
- [x] **Panel hatası düzeldi:** `main` üzerindeki filtre `position: fixed` için konum
      kabı oluyordu; sayfa kaydırılmışken paneller ekranın dışına taşıyordu. Panel
      artık `<body>`ye portal ediliyor (+ regresyon testi).
- [x] "?" düğmelerinin dokunma alanı 18 → 38 piksel (görünen daire aynı) + test
- [x] Bant fotoğrafı öncelikli yükleniyor (LCP), diğerleri tembel
- [x] Yükleniyor durumu iskelet oldu (`.skeleton`, hareket azaltmada durağan)
- [x] Çevrimdışı uyarısı: bağlantı yokken tek satırlık çubuk (+ test)

---

## Notlar

- Higgsfield kredisi: 8 kaldı (2026-09-18). `gpt_image_2_5` 16:9 görsel = 1 kredi.
  Son üretilenler: `app-machine`, `app-cable` (ekipman karoları).
- Üretilen ham görseller: `~/Downloads/hf-app`. Anlatı segmentleri: `~/Downloads/hf2`.
- Tur ekran görüntüleri için geçici test: `apps/web/e2e/_tour.spec.ts`
  (`MSYS_NO_PATHCONV=1 TOUR=/,/body TOUR_TAG=dk npx playwright test e2e/_tour.spec.ts --project=masaüstü`).
  Commit'e girmiyor (`_tour`, `_flow`).
