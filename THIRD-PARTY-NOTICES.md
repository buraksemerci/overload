# Üçüncü taraf bildirimleri

Bu dosya, projede kullanılan üçüncü taraf çalışmaların lisans bildirimlerini
taşıyor. **Silinmemeli** — MIT lisansı telif bildiriminin korunmasını şart
koşuyor.

---

## react-native-body-highlighter

Kas haritasındaki anatomik vücut SVG yolları bu projeden alındı
(`apps/web/lib/bodyPaths.ts`). Bileşenin kendisi kullanılmıyor — o
`react-native-svg`'ye bağlı; yalnızca yol verisi alınıp kendi web SVG
bileşenimizde çizildi.

- Kaynak: <https://github.com/HichamELBSI/react-native-body-highlighter>
- Sürüm: 3.2.0

```
MIT License

Copyright (c) 2022 ELABBASSI Hicham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Şablon program kaynakları

Hazır program şablonları (`apps/api/src/overload_api/seed/data.py`) kamuya açık
antrenman programlarından derlendi ve her biri kaynağıyla birlikte saklanıyor
(`program.source_name`, `program.source_url`). Program yapıları telif konusu
değil; yine de arayüzde kaynak gösterilerek atıf yapılıyor:

Jim Wendler (5/3/1) · Mark Rippetoe (Starting Strength) · Mehdi Hadim
(StrongLifts) · Layne Norton (PHAT) · Greg Nuckols (Stronger by Science) ·
Alberto Nuñez (3DMJ) · Jonnie Candito · nSuns (r/Fitness) · Cody Lefever
(GZCLP) · Brandon Campbell (PHUL) · r/Fitness (PPL)

---

## Besin verisi

- **USDA FoodData Central** — kamu malı (U.S. Government work).
- **Open Food Facts** — Open Database License (ODbL). Kullanım politikası
  gereği tanımlayıcı bir `User-Agent` gönderiliyor
  (`OFF_USER_AGENT` ayarı).

---

## Fotoğraflar

`apps/web/public/photos/` altındaki fotoğraflar **Unsplash**'ten alındı
([lisans](https://unsplash.com/license)). Lisans ticari ve ticari olmayan
kullanıma izin veriyor ve **atıf zorunlu değil**.

**Lisansın kapsamadığı iki şey var** ve seçim bunlara göre yapıldı:

1. Lisans **tanınabilir kişiler** üzerinde hak vermiyor (model izni yok).
   Seçilen karelerde yüz net görünmüyor; hepsi harekete ya da ekipmana
   odaklı.
2. Lisans **ticari markayı** kapsamıyor. Karelerde marka logosu bulunmuyor.

Yuva listesi, hangi karenin nerede kullanıldığı ve yeni fotoğraf ekleme
yönergesi: `apps/web/public/photos/README.md`.
