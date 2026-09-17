# Yapılacaklar — tasarım yenilemesi

Bu liste çalışırken güncelleniyor. `[x]` bitti, `[~]` sürüyor, `[ ]` sırada.
Bir madde bitince altına kısa bir not düşülüyor.

**Hedef:** giriş ekranındaki sinematik dil (karanlık salon, sıcak ışık, büyük
yazı) uygulamanın bütün ekranlarında. Koyu tema. Geniş, dolu, sade; grafikler,
fotoğraflar, ödül alacak kalitede UI/UX.

**Şu an:** `/history` yeniden tasarımı → ardından `/programs`, `/exercises`, `/supplements`, `/coach`.

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
- [ ] Kayma (CLS) denetimi: her ekranda ölçüm, yükleme iskeletleri sabit yükseklikte
- [ ] Mobil (390px) ve tablet (768px) turu
- [ ] Hareket azaltma tercihinde bantların animasyonu
- [ ] Eksik fotoğraflar: akşam yemeği, ara öğün, tebeşir (yeniden üret)

## 1. Pano (`/`)

- [x] Bant: selamlama, günün işi, 4 büyük sayı
- [x] Haftalık tonaj grafiği, kalori halkası + makrolar, kas dengesi mini harita,
      kilo eğrisi, tutarlılık ızgarası, haftalık rapor karosu, son antrenmanlar,
      bölüm karoları
- [x] Koyu temada kontrol
- [ ] Boş hesap (hiç veri yok) görünümü: karolar anlamlı davet göstermeli

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
- [ ] Klavye kısayolları (Enter = seti kaydet, +/- ağırlık)
- [~] `/programs` bant (var) + kartlar
- [~] `/exercises` bant (var) + ekipman karoları + kas etiketleri
- [~] `/history` bant (var) + haftalık grafik + seans kartları
- [x] Program onayı ekranı: bant + gün/hareket/set sayıları + gece karosunda gerekçe

## 4. Beslenme

- [x] `/nutrition` bant (kalan kalori halkası) + öğün fotoğrafları + makrolar + gün gezinmesi
- [~] `/supplements` bant (var) + kartlar

## 5. Asistan

- [x] `/chat` bant + büyük örnek kartları + "nasıl çalışıyor" yan sütunu +
      günlük kullanım göstergesi + yapışık yazı alanı
- [~] `/coach` bant (var) + rapor okuma düzeni

## 6. Hesap ve diğerleri

- [x] `/account` bant + kimlik bloğu
- [ ] `/onboarding` koyu temada kontrol
- [ ] Giriş ekranı koyu temada kontrol (telefon ekranı açık kalmalı)
- [ ] Parola kurtarma / doğrulama ekranları koyu tema

## 7. Kalite

- [x] e2e testleri yeni tasarıma göre güncellendi (pano, antrenman, beslenme, hoş geldin)
- [x] Tasarım kuralları testi: yeni ekran `/body` eklendi (124/124 geçti)
- [~] Tam test paketi + `pnpm build` (e2e 385/387 → iki kırık kas haritası testi yeni ekranla düzeldi; build sırada)
- [x] Commit: "Koyu tema ve sinematik ekranlar" (2026-09-17)
- [ ] ROADMAP güncelle

---

## Notlar

- Higgsfield kredisi: ~11 kaldı (2026-09-17). Görsel başına 1,5 kredi (2k orta).
- Üretilen ham görseller: `~/Downloads/hf-app`. Anlatı segmentleri: `~/Downloads/hf2`.
- Tur ekran görüntüleri için geçici test: `apps/web/e2e/_tour.spec.ts`
  (`MSYS_NO_PATHCONV=1 TOUR=/,/body TOUR_TAG=dk npx playwright test e2e/_tour.spec.ts --project=masaüstü`).
  Commit'e girmiyor (`_tour`, `_flow`).
