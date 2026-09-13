# Mimari kararlar ve gerekçeleri

Bu doküman "neden böyle" sorularının cevabını topluyor. Kodun içindeki yorumlar
yerel kararları açıklıyor; burada sistem seviyesindeki tercihler var.

---

## 1. Neden polyglot (Python backend + TypeScript frontend)?

Promptun verdiği tercih. Bedeli gerçek: iki dil, iki paket yöneticisi, ve en
önemlisi **sözleşme kayması** — backend bir alan adını değiştirdiğinde frontend
derlenmeye devam eder ve hata çalışma zamanına kaçar.

Bu bedel şöyle kapatıldı: FastAPI'nin ürettiği OpenAPI şeması
`apps/api/openapi.json` dosyasına dökülüyor, `openapi-typescript` onu TS tiplerine
çeviriyor, ve CI'da `dump_openapi.py --check` dosyanın güncel olduğunu doğruluyor.
Şema değişip tipler yenilenmezse CI kırmızı yanar.

Şema dökümü sunucu çalıştırmadan yapılıyor — `app.openapi()` senkron çalışıyor.
Bu, CI'da sadece tip üretmek için uvicorn + veritabanı ayağa kaldırmayı gereksiz kılıyor.

---

## 2. Row-Level Security: sahip rolü tuzağı

**Sorun.** Postgres'te bir tablonun sahibi RLS politikalarını varsayılan olarak
baypas eder. Neon'da (ve çoğu yönetilen Postgres'te) uygulama, tabloları yaratan
rolle bağlanır. Yani politikaları yazıp hiçbir şey korumamış olmak mümkün — ve bu
sessiz: politikalar `pg_policies` içinde durur, sorgular hepsini görmeye devam eder.

**Seçenekler.**
- `FORCE ROW LEVEL SECURITY` — sahip de politikalara tabi olur, ama o zaman seed
  betiği paylaşılan referans veriyi (kas grupları, hareket kütüphanesi, şablon
  programlar) yazamaz hâle gelir.
- Ayrı, sahip olmayan bir uygulama rolü.

**Seçilen.** İkincisi. Migration `0002` `overload_app` rolünü oluşturuyor; her
istek transaction'ı `SET LOCAL ROLE overload_app` ile o role geçiyor. Migration ve
seed sahip rolüyle koşuyor (politikaları baypas ediyor), uygulama istekleri
kısıtlı rolle koşuyor (politikalara tabi).

`SET LOCAL` kritik: transaction bitince hem rol hem `app.user_id` düşer. Bağlantı
havuzunda kimlik sızmasını engelleyen mekanizma bu — aynı fiziksel bağlantıyı alan
sonraki istek temiz başlar.

**Fail-closed.** `app_current_user_id()` fonksiyonu ayarlanmamış değişkende NULL
döner. `user_id = NULL` → NULL → satır gelmez. Kimlik yoksa veri de yok.

**`USING` + `WITH CHECK` ikisi de yazıldı.** Sadece `USING` yazılsaydı kullanıcı
başkasının `user_id`'siyle satır *ekleyebilirdi* (göremese bile).

---

## 3. Progresif overload motoru neden saf?

Motor (`services/progression.py`) veritabanı, ağ ya da zaman bağımlılığı içermiyor.
Girdi düz veri yapıları, çıktı bir öneri nesnesi.

Kazanç: algoritmanın tamamı gerçek Postgres olmadan test edilebiliyor. 26 test
saniyenin altında koşuyor, bu da algoritmayı rahatça değiştirmeyi mümkün kılıyor —
plato eşiğini 3'ten 4'e çekmek isterseniz testi çalıştırıp sonucu görürsünüz.

Veriyi yükleyip motoru çağıran ince katman ayrı: `features/workouts/service.py`.

### Motorun bilinçli kararları

| Karar | Gerekçe |
|---|---|
| Top set (en ağır set) baz alınır | Ortalama yanıltıcı: 4. setteki yorgunluk düşüşü, 1. setteki gerçek ilerlemeyi maskeler |
| Failure setlerinde hacim metriği | Failure'da tekrar sayısı günlük forma göre ±2 oynar; tek setin tekrarına bakmak gürültü ölçmek olur |
| `RIR = None` "bilinmiyor" demek, 0 değil | `None`'ı 0 saymak "bitişe 0 tekrar kaldı" demek olurdu ve motoru sahte biçimde agresifleştirirdi |
| Ağırlık artışı plaka adımına yuvarlanır | "%2.5 artır" 40 kg'da 1 kg eder; hiçbir salonda 1 kg'lık adım yok |
| Yuvarlama **aşağı** (ROUND_FLOOR) | Bandın ortası (%3.75) genelde iki adımın tam arasına düşer. Küçük adım geri dönüşte sürdürülebilir; fazla adım formu bozup platoya sokar |

---

## 4. AI güvenlik mimarisi

### Tool yüzeyi iki kümeye ayrılır

**AUTO_EXECUTE** — yalnızca yeni kayıt ekler ya da salt-okunur. En kötü ihtimalle
fazladan bir satır oluşur; kullanıcı silebilir. Akış kesilmez.

**APPROVAL_REQUIRED** — var olan veriyi değiştirir/siler ya da program kurar.
Çağrıldığında **hiçbir veritabanı değişikliği olmaz**; sadece bir `PendingAction`
satırı doğar.

### Onay yolu modelden geçmez

Sohbetteki "Onayla" butonu AI'ya değil, `POST /chat/pending-actions/{id}/approve`
adresine gider. Değişikliği orada, deterministik Python kodu uygular.

`PendingAction.payload` **modelin yazdığı veridir**, yani güvenilmez girdi. Onay
anında Pydantic şemasıyla yeniden doğrulanır. Tool tanımlarındaki `strict: True`
zaten şema uyumu garantiliyor, ama bu ikinci katman öneri ile uygulama arasındaki
zamanı da kapsıyor.

Ayrıca `propose_program` onaylanırken her `exercise_id` gerçekten var mı ve bu
kullanıcı erişebiliyor mu diye kontrol ediliyor — model uydurmuş ya da başkasının
özel hareketini göstermiş olabilir.

### Hesap ayarları sınırı

E-posta, şifre ve güvenlik ayarları sohbetten **hiçbir koşulda** değiştirilemez.
Bu bir prompt talimatı değil: karşılık gelen tool yok. Model olmayan bir tool'u
çağıramaz. `tests/test_ai_tools.py` bu sınırı test ediyor.

### Hareket uydurma engeli

`propose_program` şeması serbest metin hareket adı kabul etmiyor; sadece
`search_exercise_library`'den dönen `exercise_id`. Sebep: her hareketin kas grubu
eşlemesi var ve uydurulan bir isim kas haritasını **sessizce** yanlışlar.

---

## 5. Prompt caching: bağlam nereye konur?

Orijinal prompt "her mesajda sistem promptu + taze bağlam özeti + tool tanımları
gönderilir" diyordu. Bağlam özeti sistem promptuna konursa önbellek her mesajda çöper.

Anthropic önbelleği bir **önek eşleşmesidir** ve render sırası
`tools → system → messages`. Sistem promptundaki tek byte değişirse o istekten
sonraki her şeyin önbelleği düşer.

**Uygulanan düzen:**

| Bölüm | İçerik | Önbellek |
|---|---|---|
| `tools` | 10 tool tanımı, sabit sırada | ✅ (sistem bloğunun kesme noktasına dahil) |
| `system` | Donuk koç promptu, hiç dinamik veri yok | ✅ kesme noktası burada |
| `messages[:-1]` | Sohbet geçmişi | ✅ ikinci kesme noktası |
| `messages[-1]` | Taze bağlam bloğu + kullanıcının mesajı | ❌ her turda yeni |

Böylece ~6-8 bin token'lık önek her turda önbellekten okunuyor.

> "Mid-conversation system message" bu işi daha temiz yapardı ama Claude Sonnet 5
> onu desteklemiyor (400 döner). Kullanıcı mesajı yolu bu yüzden seçildi.

---

## 6. Model katmanları ve API detayları

| Katman | Model | Kullanım |
|---|---|---|
| Hızlı | `claude-haiku-4-5` | Metin/fotoğraftan besin ayrıştırma — yüksek hacim, basit çıkarım |
| Akıllı | `claude-sonnet-5` | Sohbet, tool kullanımı, haftalık koç raporu |

Haftalık rapor **Batch API** ile gece çalışıyor: gecikme önemsiz, maliyet yarı fiyat.

### Bu sürümde değişen API detayları

Eski örneklerden kopyalarken tuzak olabilecekler — kodda uygulandı:

- Sonnet 5'te `temperature` / `top_p` / `top_k` **kaldırıldı** (400 döner).
- `thinking.budget_tokens` Sonnet 5'te kaldırıldı; tek açık mod `{"type": "adaptive"}`.
  Haiku 4.5 hâlâ `budget_tokens` bekliyor — ama ayrıştırma işinde düşünmeye ihtiyaç
  yok, orada `thinking` hiç geçilmiyor.
- Düşünme derinliği `output_config={"effort": ...}` ile ayarlanıyor.
- Yapılandırılmış çıktı `output_config={"format": ...}`; eski `output_format` kalktı.
- Sonnet 5'te asistan mesajı ön-doldurma (prefill) 400 döner.
- Model kimliklerine **tarih eki eklenmiyor**: `claude-haiku-4-5` doğru,
  `claude-haiku-4-5-20251001` değil.

### Paralel tool çağrısı

Tüm `tool_result` blokları **tek** bir user mesajında dönüyor. Ayrı mesajlara
bölmek modele "paralel tool çağırma" diye sessiz bir sinyal veriyor ve sonraki
turlarda paralellik kayboluyor.

---

## 7. Veri modelindeki dikkat çeken kararlar

### Karşılıklı yabancı anahtar döngüsü kırıldı

İlk tasarımda `user.active_program_id → program.id` ve `program.owner_id → user.id`
vardı. Bu, tabloların oluşturulma sırasını çözülemez hâle getiriyor (SQLAlchemy
`sorted_tables` uyarı veriyor, migration patlıyor).

Çözüm: "aktif program" işareti program tarafına taşındı (`program.is_active`) ve
"kullanıcı başına en fazla bir aktif program" kuralı **kısmi tekil indeksle**
veritabanı seviyesinde garanti altına alındı:

```sql
CREATE UNIQUE INDEX uq_program_one_active_per_owner ON program (owner_id) WHERE is_active;
```

Uygulama kodunda "önce eskisini pasifleştir" unutulsa bile ikinci aktif program oluşamaz.

### Superset ayrı satırlar

Kaynak veride "Hammer curl + Reverse barbell curl" tek satır gibi görünüyor ama
iki ayrı hareket. Tek satıra sıkıştırmak kas eşlemesini — dolayısıyla ısı
haritasını ve hacim dengesini — bozardı. İki satır yazılıp aynı `superset_group`
değeri veriliyor.

### `user_id` alt tablolarda da var (denormalizasyon)

`set_log.user_id` teknik olarak `workout_session` üzerinden türetilebilir. Ama RLS
politikası her satır için JOIN yapmak zorunda kalırdı — hem yavaş hem kırılgan.

### Native olmayan enum

Enum'lar `VARCHAR + CHECK` olarak saklanıyor (`native_enum=False`). Postgres'in
gerçek ENUM tipine yeni değer eklemek `ALTER TYPE` gerektiriyor ve migration'ları
gereksiz yere kırılgan yapıyor. Bizde bir enum'a değer eklemek sadece CHECK
kısıtını güncellemek demek.

### Adlandırma kuralı (naming convention)

Postgres kısıtlamalarına otomatik ad verilmezse Alembic autogenerate, isimsiz
kısıtlamaları güvenilir biçimde `DROP`/`ALTER` edemez ve migration'lar zamanla
kırılır. `db/base.py` bunu baştan sabitliyor.

---

## 8. İlk migration neden elle üretildi?

`alembic revision --autogenerate` çalışan bir Postgres bağlantısı istiyor
(`compare/schema.py` içinde `assert connection is not None`). Ama ilk migration
için karşılaştırılacak bir şey yok — hedef zaten boş şema.

`scripts/build_initial_migration.py` ops ağacını doğrudan metadata'dan kurup
Alembic'in kendi render motoruyla basıyor. Sonraki migration'lar normal akışla
(`alembic revision --autogenerate`) üretilir.

Betiğin ürettiği dosyaya `import fastapi_users_db_sqlalchemy` elle ekleniyor:
`user.id` ve ona referans veren tüm FK sütunları
`fastapi_users_db_sqlalchemy.generics.GUID()` tipiyle render ediliyor, ama Alembic
render motoru import'u eklemiyor — import olmadan migration `NameError` ile patlıyor.

---

## 9. Frontend kararları

**JWT `localStorage`'da, cookie'de değil.** Uygulama PWA olarak çalışacak ve
servis worker + çapraz köken cookie davranışı tarayıcılar arasında öngörülemez
(özellikle iOS Safari'de "ana ekrana ekle" sonrası). Bedeli XSS'e açık olmak;
karşılığında üçüncü parti script eklenmediği sürece kabul edilebilir bir takas.
Eklenirse `httpOnly` cookie'ye geçilmeli.

**SSE, WebSocket değil.** Sohbet akışı tek yönlü: sunucudan istemciye token akışı.
WebSocket çift yönlü kanal kurup yeniden bağlanma/kalp atışı yönetimi getirirdi.
`EventSource` kullanılmıyor çünkü o yalnızca GET yapıyor ve `Authorization`
başlığı göndermiyor; `fetch` + `ReadableStream` ikisini de çözüyor.

**Kas haritası şematik, anatomik değil.** Tasarım dilinin kendisi bunu söylüyor:
"dekorasyon yok, hız ve netlik var". Detaylı anatomi çizimi telefonda 200px
genişlikte okunmaz hâle gelir ve dosya boyutunu şişirir.

**`typedRoutes` açık.** Var olmayan bir rotaya link vermek derleme hatası veriyor.
İlk derlemede tam da bunu yakaladı.

**`inputMode="decimal"`, `type="number"` değil.** iOS'ta `type="number"`'ın ok
tuşları ekranı daraltıyor; salonda tek elle kullanımda sorun çıkarıyor.

---

## 10. Ruff'ta kapatılan kurallar

`RUF001/002/003` ("belirsiz Unicode karakter") kapatıldı. Bu kural homoglif
saldırılarını (Kiril `а` yerine Latin `a` gibi) yakalamak için var ve İngilizce kod
tabanlarını varsayıyor. Bu projede yorumlar ve docstring'ler bilinçli olarak Türkçe;
`ı`, `ş`, `ğ`, `İ` harfleri kasıtlı ve doğru. Açık bırakılırsa ~2000 sahte uyarı
üretip gerçek bulguları gömüyor.
