# Fotoğraflar

Bu klasördeki dosyalar `<Photo slug="..." />` bileşeni tarafından
`/photos/<slug>.jpg` adresinden okunuyor. **Dosya yoksa ekran bozulmuyor** —
altındaki nötr işlem katmanı görünüyor. Yani bir fotoğraf eklemek dosyayı bu
klasöre doğru adla atmaktan ibaret; kod değişmiyor.

Şu an 19 dosya, toplam ~1.3 MB.

## Hazırlama

Dosyalar elle değil betikle hazırlanıyor:

```bash
cd apps/web
node scripts/photos.mjs ~/Downloads
```

Betik `JOBS` listesindeki her yuvayı kaynak dosyasından üretiyor. Yeni bir
fotoğraf eklerken o listeye bir satır ekleniyor; kaynak dosya bulunamazsa o
yuva atlanıyor ve diğerleri yine üretiliyor.

İki kırpma kipi var:

- **`cover`** — kutuyu doldur, taşanı kes. Kart ve şeritlerde. `position`
  konunun kadrajda kalacağı tarafı seçiyor.
- **`inside`** — hiç kırpma, kutuya sığdır. Şu an kullanılmıyor ama betikte
  duruyor; bir yuvada kırpmasız bir kare gerekirse hazır.

## Yuvalar

### Gezinme panelleri

Fotoğraf panelin **sol %85'ini** kaplıyor: sol kenara dayalı, dikey boşluk
yok. **%60 ile %85 arasında** zemine soluyor (maske). Menü yazıları %50'den
başlıyor, yani bir bölümü tam opak görselin üstünde — okunurluğu perde değil
gölge taşıyor (`.on-photo-*`), çünkü perde fotoğrafı örterdi.

Kutu geniş (≈2.3) olduğu için hepsi **yatay** kare; dikey bir kaynak bu
kırpmada konuyu tamamen kaybediyor. `position` her kare için ayrı seçildi.

Panelin zemin tonu fotoğrafa göre (`tone: "dark" | "light"`): görsel o renge
soluyor ve üst çubuğun bütün renkleri onunla birlikte dönüyor.

| Slug | Kare |
|---|---|
| `nav-antrenman` | omuz pressi |
| `nav-beslenme` | kahvaltı tabağı |
| `nav-vucut` | sırt — bölümün adını birebir karşılıyor |
| `nav-asistan` | deadlift |

### Giriş ekranı

| Slug | Kare | Oran |
|---|---|---|
| `hero-login` | squat | 3/4 dikey |

### Boş durumlar ve bitiş

Geniş şerit (21/9). Boş durum ekranın en ölü ânı; fotoğraf "hiçbir şey yok"
cümlesini bir davete çeviriyor.

| Slug | Kare | Nerede |
|---|---|---|
| `empty-workout` | deadlift | Bugün — program yok |
| `empty-nutrition` | salata | Beslenme — öğün boş |
| `empty-history` | salon | Geçmiş — kayıt yok |
| `celebration` | koşu bandı | Antrenman bitti |

### Program şablonları

`goal` alanına göre seçiliyor. 3/4 **dikey** kart: içerik (ad, özet, iki düğme) fotoğrafın üstünde duruyor
ve yatay bir kart o metni taşıyacak yüksekliği bırakmıyordu. Aktif program
kartı aynı dosyaları 21/9 olarak kullanıyor.

| Slug | Kare |
|---|---|
| `goal-strength` | deadlift |
| `goal-hypertrophy` | incline dumbbell press |
| `goal-powerbuilding` | barbell rack |
| `goal-general-fitness` | ev antrenmanı |

### Ekipman kartları

Hareket başına fotoğraf **yok** — 400+ hareket için tutarlı ve ücretsiz bir
kaynak yok. Ekipmana göre altı fotoğraf bütün kütüphaneyi kaplıyor.

| Slug | Kare |
|---|---|
| `equipment-barbell` | barbell rack |
| `equipment-dumbbell` | incline dumbbell press |
| `equipment-machine` | makine |
| `equipment-plate-loaded` | makine |
| `equipment-cable` | salon |
| `equipment-bodyweight` | ev antrenmanı |

**Kettlebell ve direnç bandı kasıtlı olarak boş.** Elde o ekipmanın karesi
yok ve yanlış bir görsel koymak, hiç koymamaktan kötü — o kartlar nötr
dokuyla çalışıyor ve düzgün görünüyor.

### Karşılama anlatısı

Karşılama ekranındaki dört kare **Higgsfield ile üretildi** (Unsplash değil).
Aynı kareler `public/video/story.mp4`in anahtar kareleri olarak da
kullanıldı: video, bu dört görüntü arasında üretilen üç geçiş parçasının
birleşimi.

| Slug | Faz |
|---|---|
| `story-outdoor` | Sabah — dışarıda koşu |
| `story-gym` | Antrenman — salonda ağırlık |
| `story-meal` | Sonrası — öğün |
| `story-phone` | Zamanla — telefonda panel |

Bu dördü yalnızca **yedek**: video yüklenemezse anlatı onlara düşüyor.
Videonun kendisi `scripts/story-video.mjs` ile hazırlanıyor.

## Nereden

- **Unsplash** — <https://unsplash.com/license>
- **Pexels** — <https://www.pexels.com/license/>

İkisi de ticari kullanıma açık ve atıf zorunlu değil.

**Lisansın kapsamadığı iki şey var:**

1. **Tanınabilir kişiler** üzerinde hak vermiyor (model izni yok). Kişisel
   kullanımda sorun değil, ama uygulama ücretli bir ürüne dönerse bir
   sporcunun fotoğrafı "onaylıyor" gibi okunabilir. Yüzü net görünmeyen,
   harekete odaklı kareler bu sorunu kaldırıyor.
2. **Ticari markayı** kapsamıyor — karede logo olmasın.

## Ana panelde ve canlı sayıların arkasında fotoğraf yok

Kasıtlı. Ana panel, beslenme günlüğü ve ilerleme ekranları canlı sayı
gösteriyor; fotoğraf arkalarına konunca okunabilirlik düşüyor ve ekran "o an
ne yapmalıyım" sorusunu yanıtlamaktan çıkıyor.

Fotoğraflar gezinmede, giriş ekranında, kart kapaklarında ve boş
durumlarda — yani okunacak sayının olmadığı yerlerde.
