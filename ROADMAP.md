# Rota

Her ekranı aynı tasarım diline getirme planı. Sırayla ilerliyor; bir madde
"bitti" sayılması için o ekranın **çalışıyor** olması, tasarım denetimlerini
geçmesi ve testinin bulunması gerekiyor.

## Tasarım dili — her ekranda geçerli

Bunlar tek tek ekranlarda tartışılmıyor; kabul edilmiş kurallar.

1. **Bento kart mimarisi.** İçerik büyük, ferah, parçalı kartlarda. Yoğun
   metin bloğu yok; bir kart bir şey anlatıyor.
2. **Fotoğraf kartın kendisi**, kapağı değil. Başlık, özet ve eylem
   görselin üstünde tek katmanda — "kapak + içerik" ikiye bölünmesi yok.
3. **Keskin köşe.** `--radius-*` sıfır. Editoryal dil.
4. **Az göster, isteyince aç.** Ekran açılınca yalnızca o an gereken;
   ayrıntı `?` arkasında ya da açılır bölümde.
5. **Volt bütçesi.** Ekran başına bir dolgu. Volt metin rengi değil.
6. **Display yüzü kimlik anlarında**: sayfa başlığı, kart adı, büyük sayı.
7. **Boş durum bir davet.** Fotoğraf + tek cümle + tek eylem.

## Sıra

### 0. Altyapı — BİTTİ
- [x] `Photo` bileşeni (yer tutucu, feather, fill kipleri)
- [x] `scripts/photos.mjs` — yuva üretimi
- [x] Üst gezinme + fotoğraflı açılır panel
- [x] Tasarım denetimleri (`lib/design-tokens.test.ts`, `e2e/design-rules`)

### 1. Karşılama ekranı (`/`) — BİTTİ
- [x] Kullanıcıyı adıyla karşılama
- [x] Kaydırmaya bağlı video: kaydırma yüzdesi `currentTime`e yazılıyor
- [x] Tek kesintisiz çekim, tek mekân — salona giriş, zeminde ilerleme,
      bardaki öğün, telefona yaklaşma. Kesme yok.
- [x] Her fazın altında o bölüme giden bağlantı
- [x] Görseller ve video Higgsfield ile üretiliyor
- [x] Video yokken fotoğraf karelerine, hareket azaltmada düz kartlara düşüş

### 2. Profil (`/account`) — BİTTİ
- [x] Kimlik kapak kartı (fotoğraf + ad + e-posta + baş harf)
- [x] Bento: Kimlik / Vücut / Aktivite / Saat dilimi ayrı kartlarda —
      hangi bilginin neyi etkilediği kartın başlığında
- [x] Kaydet çubuğu yalnızca değişiklik varken, yanında "geri al"
- [x] Son tartı gösteriliyor ama buradan DEĞİŞTİRİLEMİYOR (kilo `/weight`de)

**AI sınırı kartı yok** çünkü gösterilecek veri yok: kullanıcı başına AI
bütçesi henüz uygulanmadı. Uydurma bir sayı göstermektense kart hiç
konmadı; bütçe geldiğinde buraya eklenecek.

### 3. Antrenman
- [ ] `/workout` — akış zaten iyi; kart dili hizalanacak
- [ ] `/programs` — BİTTİ (fotoğraflı kartlar)
- [ ] `/exercises` — BİTTİ (ekipman kartları)
- [ ] `/history` — bento birikim kartları
- [ ] `/programs/[id]/edit` — düzenleyici, kart dili
- [ ] `/programs/review/[id]` — AI önerisi onayı

### 4. Beslenme
- [ ] `/nutrition` — halka + öğün kartları bento'ya
- [ ] `/supplements` — kart dili

### 5. Vücut
- [ ] `/progress` — bento: güç kartı, tutarlılık, rekor rafı
- [ ] `/muscle-map` — harita + liste dengesi
- [ ] `/weight` — hero + grafik
- [ ] `/soreness` — BİTTİ

### 6. Asistan
- [ ] `/chat` — sohbet yüzeyi, kart dili
- [ ] `/coach` — haftalık rapor

### 7. Kapanış
- [ ] Bütün ekranlarda tasarım denetimi yeşil
- [ ] e2e kapsamı her ekran için en az bir davranış testi
- [ ] Fotoğraf yuvalarının tamamı dolu ya da bilinçli boş
