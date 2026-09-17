# Fotoğraflar

Bu klasördeki dosyalar `<Photo slug="..." />` bileşeni tarafından
`/photos/<slug>.jpg` adresinden okunuyor. **Dosya yoksa ekran bozulmuyor** —
altındaki nötr işlem katmanı görünüyor. Yani bir fotoğraf eklemek dosyayı bu
klasöre doğru adla atmaktan ibaret; kod değişmiyor.

Şu an 41 dosya, toplam ~6 MB.

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

Paneller artık **ekran bantlarıyla aynı kareleri** kullanıyor (`app-grip`,
`app-meal-bar`, `app-body`, `app-review`): menüde gördüğün salon, girdiğin
ekranda devam ediyor. Eski `nav-*` yuvaları (Unsplash) kaldırıldı — aynı
uygulamada iki ayrı salon vardı ve geçiş her seferinde kopuyordu.

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
Aynı kareler `public/video/story-1080.mp4` ve `story-1440.mp4`in dönüm noktaları: video, bu dört
görüntü arasında üretilen üç geçiş parçasının birleşimi.

| Slug | Kameranın olduğu yer |
|---|---|
| `story-entry` | Kapıdan giren kişinin arkası |
| `story-gym` | Zeminde ilerlerken, rafta çalışan birinin yanı |
| `story-meal` | Dipteki bar, öğününü yiyen kişi |
| `story-phone` | Elindeki telefonun ekranı |

Dördü de **aynı salon**: üretim istemlerinde mekân (uzun kemerli pencereler
solda, siyah raf sırası sağda, dipte beton-meşe bar) kelimesi kelimesine
tekrarlandı. Kesme yok; kamera boydan boya tek seferde ilerliyor.

Bu dördü yalnızca **yedek**: video yüklenemezse anlatı onlara düşüyor.
Videonun kendisi `scripts/story-video.mjs` ile hazırlanıyor.

### Ekran bantları

Oturum açıldıktan sonraki **her ekran** fotoğraflı bir bantla (`Hero`) açılıyor.
Kareler giriş anlatısıyla **aynı salondan**: bir kısmı Higgsfield ile aynı mekân
tarifiyle üretildi, bir kısmı anlatı videosunun geçiş parçalarından alınan
kareler. Kaynaklar `~/Downloads/hf-app` ve `~/Downloads/hf2`; hazırlama
`node scripts/app-photos.mjs` (2400×1350, kalite 80). Hiçbir karede yüz
seçilmiyor, logo yok.

| Slug | Kare | Nerede |
|---|---|---|
| `app-grip` | bara kavrayan eller | Menü: Antrenman; antrenman sırasında bant |
| `app-squat` | squat rafı | Antrenman başlamadan; pano |
| `app-chalk` | tebeşirli eller | Antrenman girişi; Geçmiş |
| `app-plates` | plaka yığını | Bitiş; İlerleme; pano |
| `app-gym-wide` | salonun tamamı | Program düzenleme; pano (program yok) |
| `app-stretch` | esneme | Ağrı; pano (dinlenme günü) |
| `app-body` | sırt siluet | Menü: Vücut; Vücut özeti |
| `app-dumbbells` | dambıl rafı | Kas haritası; Hareketler |
| `app-scale` | tartı | Kilo |
| `app-shoes` | ayakkabı bağlama | Programlar |
| `app-meal-bar` | bardaki öğün | Menü: Beslenme; Beslenme |
| `app-supplements` | takviye kavanozları | Takviyeler |
| `app-review` | defter ve telefon | Menü: Asistan; Koç raporu; program onayı |
| `app-cafe` | salonun kafesi (hareket bulanık) | Asistan |
| `app-entry` | salon girişi | Hesap |

### Öğünler

Beslenme ekranındaki öğün kartları. 1200×800, aynı bar tezgâhında.

| Slug | Öğün |
|---|---|
| `meal-breakfast` | kahvaltı |
| `meal-lunch` | öğle |
| `meal-snack` | ara öğün |
| `meal-dinner` | akşam |

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

## Canlı sayılar fotoğrafın üstünde — perdeyle

Önceki kural "sayı olan yerde fotoğraf yok"du. Koyu temayla birlikte
değişti: bantlarda büyük sayılar fotoğrafın üstünde duruyor, ama üç yönlü bir
perdenin (alttan, soldan, üstten) arkasında ve dar ekranda ek bir düz
karartmayla. Sayılar bantın alt yarısında, perdenin en koyu olduğu yerde.

Bandın altındaki karolarda (grafikler, listeler, formlar) fotoğraf **yok**:
orada okunan şey veri ve zemin düz kalıyor.
