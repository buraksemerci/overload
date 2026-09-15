# Fotoğraflar

Bu klasördeki dosyalar `<Photo slug="..." />` bileşeni tarafından
`/photos/<slug>.jpg` adresinden okunuyor. **Dosya yoksa ekran bozulmuyor** —
altındaki nötr işlem katmanı görünüyor. Yani bir fotoğraf eklemek dosyayı bu
klasöre doğru adla atmaktan ibaret; kod değişmiyor.

## Hazırlama

Dosyalar elle değil betikle hazırlanıyor:

```bash
cd apps/web
node scripts/photos.mjs ~/Downloads
```

Betik her yuvanın kendi oranına göre kırpıp (`scripts/photos.mjs` içindeki
`JOBS` listesi) `public/photos/` altına yazıyor. Yeni bir fotoğraf eklerken o
listeye bir satır ekleniyor.

Neden betik: yuvaların oranları farklı (gezinme paneli 4/5, giriş hero'su 3/4,
boş durum şeridi 21/9) ve yanlış orandaki bir fotoğraf `cover` ile kırpılırken
konuyu kadrajdan çıkarıyor. Ayrıca indirilen dosyalar 0.6-3.8 MB.

## Şu an hazır olanlar

| Slug | Kaynak | Nerede |
|---|---|---|
| `nav-antrenman` | Tyler Raye / Unsplash | Gezinme paneli — Antrenman |
| `nav-beslenme` | Maahid Photos / Unsplash | Gezinme paneli — Beslenme |
| `nav-vucut` | Tyler Raye / Unsplash | Gezinme paneli — Vücut |
| `nav-asistan` | Samuel Girven / Unsplash | Gezinme paneli — Asistan |
| `hero-login` | Tyler Raye / Unsplash | Giriş ekranı |
| `empty-workout` | Clark Douglas / Unsplash | Antrenman boş durumu |

Toplam ~656 KB.

## Eksik olanlar (isteğe bağlı)

Bu yuvalar kodda tanımlı ama dosyaları yok; o ekranlar şu an nötr dokuyla
çalışıyor ve düzgün görünüyor. Eklemek istersen `scripts/photos.mjs` içindeki
`JOBS` listesine 4/5 oranıyla ekle.

| Slug | Ne arayacaksın | Nerede |
|---|---|---|
| `goal-strength` | `barbell deadlift` / `squat rack` | Program şablonu kartı |
| `goal-hypertrophy` | `dumbbell rack` / `cable machine` | Program şablonu kartı |
| `goal-powerbuilding` | `bench press` | Program şablonu kartı |
| `goal-general-fitness` | `kettlebell` / `bright gym` | Program şablonu kartı |
| `equipment-barbell` | `barbell` | Hareket kütüphanesi kartı |
| `equipment-dumbbell` | `dumbbells` | Hareket kütüphanesi kartı |
| `equipment-machine` | `gym machine` | Hareket kütüphanesi kartı |
| `equipment-plate-loaded` | `plate loaded machine` | Hareket kütüphanesi kartı |
| `equipment-cable` | `cable crossover` | Hareket kütüphanesi kartı |
| `equipment-bodyweight` | `pull up bar` | Hareket kütüphanesi kartı |
| `equipment-kettlebell` | `kettlebell` | Hareket kütüphanesi kartı |
| `equipment-band` | `resistance band` | Hareket kütüphanesi kartı |

## Nereden

- **Unsplash** — <https://unsplash.com/license>
- **Pexels** — <https://www.pexels.com/license/>

İkisi de ticari kullanıma açık ve atıf zorunlu değil. Yine de fotoğrafçılar
yukarıdaki tabloda ve `THIRD-PARTY-NOTICES.md` içinde yazılı.

**İki sınır:**

1. Bu lisanslar **tanınabilir kişiler** üzerinde hak vermiyor; model izni
   yok. Kişisel kullanımda sorun değil, ama uygulama ücretli bir ürüne
   dönerse bir sporcunun fotoğrafı "onaylıyor" gibi okunabilir. Yüzü net
   görünmeyen, harekete odaklı kareler bu sorunu tümden kaldırıyor — şu anki
   altı fotoğrafta da yüz yok.
2. Karede **marka logosu olmasın**. Lisans ticari markayı kapsamıyor.

## Ana panelde fotoğraf yok

Kasıtlı. Ana panel ve günlük ekranları canlı sayı gösteriyor; fotoğraf
arkalarına konunca okunabilirlik düşüyor ve ekran "o an ne yapmalıyım"
sorusunu yanıtlamaktan çıkıyor. Fotoğraflar gezinmede, giriş ekranında ve boş
durumlarda — yani okunacak sayının olmadığı yerlerde.
