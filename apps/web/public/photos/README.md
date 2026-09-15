# Fotoğraflar

Bu klasördeki dosyalar `<Photo slug="..." />` bileşeni tarafından
`/photos/<slug>.jpg` adresinden okunuyor. **Dosya yoksa ekran bozulmuyor** —
altındaki nötr işlem katmanı görünüyor. Yani bir fotoğraf eklemek dosyayı bu
klasöre doğru adla atmaktan ibaret; kod değişmiyor.

## Nereden

- **Unsplash** — <https://unsplash.com/license>
- **Pexels** — <https://www.pexels.com/license/>

İkisi de ticari kullanıma açık ve atıf zorunlu değil.

**İki sınır:**

1. Bu lisanslar **tanınabilir kişiler** üzerinde hak vermiyor; model izni
   yok. Kişisel kullanımda sorun değil, ama uygulama ücretli bir ürüne
   dönerse bir sporcunun fotoğrafı "onaylıyor" gibi okunabilir. Yüzü net
   görünmeyen, harekete odaklı kareler bu sorunu tümden kaldırıyor.
2. Karede **marka logosu olmasın** (Nike, Adidas, salon markaları). Lisans
   ticari markayı kapsamıyor.

## Nasıl hazırlanır

Dosyalar ELLE optimize ediliyor; `next/image` kullanılmıyor (gerekçesi
`components/Photo.tsx` içinde).

```
En: 1600 px (hero için 2400 px)
Biçim: .jpg, kalite 78-82
Hedef boyut: her dosya 150 KB altı, hero 300 KB altı
```

Squoosh (<https://squoosh.app>) tarayıcıda yeterli: genişliği ayarla,
MozJPEG kalite 80, indir.

## Liste

Slug'lar kodda sabit. Aşağıdaki adlarla kaydet.

### Giriş ekranı

| Slug | Ne arayacaksın | Oran |
|---|---|---|
| `hero-login` | `barbell gym dark` / `weight plates` — yüz olmasın, doku ve ağırlık | 3/4 dikey |

### Program şablonları

Şablonun `goal` alanına göre seçiliyor; dördü yeterli.

| Slug | Ne arayacaksın |
|---|---|
| `goal-strength` | `barbell deadlift` / `squat rack` |
| `goal-hypertrophy` | `dumbbell rack` / `cable machine` |
| `goal-powerbuilding` | `bench press` / `olympic barbell` |
| `goal-general-fitness` | `kettlebell` / `bright gym interior` |

### Kas grupları (hareket kütüphanesi)

Hareket başına fotoğraf YOK — 400+ hareket için tutarlı ve ücretsiz bir
kaynak yok. Ekipmana göre 8 fotoğraf bütün kütüphaneyi kaplıyor.

| Slug | Ne arayacaksın |
|---|---|
| `equipment-barbell` | `barbell` |
| `equipment-dumbbell` | `dumbbells` |
| `equipment-machine` | `gym machine` |
| `equipment-cable` | `cable crossover` |
| `equipment-bodyweight` | `pull up bar` / `calisthenics` |
| `equipment-kettlebell` | `kettlebell` |
| `equipment-band` | `resistance band` |
| `equipment-plate-loaded` | `plate loaded machine` |

### Boş durumlar

| Slug | Ne arayacaksın | Oran |
|---|---|---|
| `empty-workout` | `empty gym morning light` | 21/9 |

## Ana panelde fotoğraf yok

Kasıtlı. Ana panel ve günlük ekranları canlı sayı gösteriyor; fotoğraf
arkalarına konunca okunabilirlik düşüyor ve ekran "o an ne yapmalıyım"
sorusunu yanıtlamaktan çıkıyor.
