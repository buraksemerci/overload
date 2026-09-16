# Kurulum — senin yapman gerekenler

Yerel geliştirme araçları kuruldu ve doğrulandı. Kalan adımlar **hesap açma ve
anahtar alma** — bunları senin yapman gerekiyor (hesap oluşturma, şifre girme ve
ödeme bilgisi işlemleri benim yapamayacağım şeyler).

Her adımda alacağın değeri `apps/api/.env` dosyasına yazman yeterli; şablonu
kökteki `.env.example`.

---

## Hazır olanlar

| Araç | Sürüm |
|---|---|
| Node.js | 24.19.0 |
| pnpm | 12.4.1 |
| Python | 3.13.15 |
| uv | 0.12.13 |
| Git | 2.55.0 |
| GitHub CLI | 2.100.0 |
| Docker Desktop | 4.90.0 (ilk açılışta lisans sözleşmesini onaylaman gerekiyor) |
| VS Code | 1.135.0 |

---

## 1. Docker Desktop'ı ilk kez aç

Kurulu ama hiç çalıştırılmamış. İlk açılışta **hizmet sözleşmesini onaylaman**
gerekiyor — bunu senin yapman lazım.

Onayladıktan sonra yerel veritabanını başlat:

```bash
docker compose up -d
```

Doğrula:

```bash
docker compose ps
```

`db` ve `db-test` servislerinin `healthy` görünmesi gerekiyor.

---

## 2. Neon (serverless PostgreSQL) — üretim veritabanı

1. [neon.tech](https://neon.tech) → GitHub ile giriş yap (ücretsiz katman yeterli)
2. **Create project** → ad: `overload`, bölge: `AWS eu-central-1 (Frankfurt)`
   (Türkiye'ye en yakın, gecikme en düşük)
3. Proje açılınca **Connection string** kutusu gelir. İki farklı biçime ihtiyacın var:

   **Uygulama için** (async sürücü) — `postgresql://` kısmını `postgresql+asyncpg://`
   yap ve `?sslmode=require` yerine `?ssl=require` yaz:
   ```
   DATABASE_URL=postgresql+asyncpg://KULLANICI:SIFRE@ep-xxx.eu-central-1.aws.neon.tech/overload?ssl=require
   ```

   **Alembic için** (senkron sürücü):
   ```
   DATABASE_URL_SYNC=postgresql+psycopg://KULLANICI:SIFRE@ep-xxx.eu-central-1.aws.neon.tech/overload?sslmode=require
   ```

> Bu iki satırın sürücü öneki farkı kasıtlı — uygulama async, migration'lar senkron
> çalışıyor. Sebebi `apps/api/alembic/env.py` başında yazıyor.

---

## 3. Anthropic API anahtarı

1. [console.anthropic.com](https://console.anthropic.com) → hesap aç
2. **Settings → API keys → Create key** → adı `overload-dev`
3. Anahtarı kopyala: `ANTHROPIC_API_KEY=sk-ant-...`
4. **Önemli:** **Settings → Limits** → aylık harcama tavanı koy.
   Kişisel kullanım için $10-20 fazlasıyla yeter. Tavan koymazsan bir döngü
   hatası faturayı sürprizle büyütebilir.

Model katmanları `.env`'de zaten ayarlı — değiştirmene gerek yok:
```
ANTHROPIC_MODEL_FAST=claude-haiku-4-5     # besin/foto ayrıştırma
ANTHROPIC_MODEL_SMART=claude-sonnet-5     # sohbet, koç raporu
```

> Not: Orijinal promptta `claude-haiku-4-5-20251001` yazıyordu. SDK tarih ekli
> kimlikleri kabul etmiyor; doğru biçim tarih eksiz `claude-haiku-4-5`.

---

## 4. USDA FoodData Central anahtarı (ücretsiz, anında)

1. [fdc.nal.usda.gov/api-key-signup](https://fdc.nal.usda.gov/api-key-signup)
2. Ad + e-posta gir → anahtar e-postana gelir
3. `USDA_API_KEY=...`

Open Food Facts anahtar istemiyor; sadece tanımlayıcı bir User-Agent zorunlu,
o da `.env`'de hazır.

---

## 5. Cloudflare R2 (fotoğraf depolama)

Yemek ve ilerleme fotoğrafları için. **Fotoğraf özelliğine gelene kadar
erteleyebilirsin** — diğer her şey bunsuz çalışır.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → hesap aç
2. Sol menü **R2** → ödeme yöntemi ister (ücretsiz katman 10 GB, kart doğrulama için)
3. **Create bucket** → ad: `overload-media`
4. **Manage R2 API Tokens** → **Create API token** → izin: *Object Read & Write*
5. Çıkan değerler:
   ```
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=overload-media
   R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

---

## 6. JWT gizli anahtarı

Rastgele üret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Çıktıyı `JWT_SECRET=` satırına yapıştır.

---

## 7. Veritabanını hazırla

`.env` dolduktan sonra:

```bash
cd apps/api && .venv/Scripts/alembic upgrade head
```

Üç migration uygulanır:
- `0001` — 23 tablo, 35 yabancı anahtar, 34 CHECK kısıtı, 22 indeks
- `0002` — Row-Level Security politikaları ve `overload_app` rolü
- `0003` — `program_exercise.target_percent_1rm` (5/3/1, nSuns gibi yüzde
  tabanlı programlar için)

Sonra referans veriyi yükle:

```bash
cd apps/api && .venv/Scripts/python -m overload_api.seed.loader
```

18 kas grubu, 51 hareket (133 kas eşlemesiyle) ve **11 şablon program** yüklenir
(Bölüm 9'un tamamı: StrongLifts 5x5, Starting Strength, Greg Nuckols, 5/3/1 BBB,
GZCLP, Candito 6 Hafta, PHUL, PHAT, Reddit PPL, Alberto Nuñez U/L, nSuns 5/3/1).

---

## 8. Çalıştır

İki terminal:

```bash
cd apps/api && .venv/Scripts/uvicorn overload_api.main:app --reload
```

```bash
pnpm dev:web
```

- API: http://localhost:8000 (dokümantasyon: http://localhost:8000/docs)
- Web: http://localhost:3000

Kayıt ol (`POST /auth/register` ya da `/docs` üzerinden), sonra kendi 5 günlük
programını yükle:

```bash
cd apps/api && .venv/Scripts/python -m overload_api.seed.loader --user SENIN@EPOSTAN
```

---

---

## 9. Haftalık koç raporu (zamanlanmış iş)

Raporlar otomatik üretilmiyor — bir cron girdisi kurman gerekiyor.

```bash
# Tek komutta gönder, bekle, topla (küçük kullanıcı sayısı için en basiti)
cd apps/api && .venv/Scripts/python -m overload_api.scripts.weekly_reports run

# Ne gönderileceğini gör, hiçbir şey gönderme
cd apps/api && .venv/Scripts/python -m overload_api.scripts.weekly_reports submit --dry-run
```

Railway/Render'da "Cron Job" olarak Pazartesi 03:00'e kur. Batch API sonuçları
24 saate kadar sürebildiği için iki aşamalı kullanım da mümkün
(`submit` → sonra `collect --batch-id ...`).

---

## 10. Uçtan uca testler (isteğe bağlı)

Playwright tarayıcı indirmesi gerektiriyor (~150 MB, tek seferlik):

```bash
cd apps/web && pnpm exec playwright install chromium
cd apps/web && pnpm e2e
```

Testler backend'i taklit ediyor; veritabanı gerekmiyor.

---

## 11. GitHub ve dağıtım

Yerelde çalıştığını doğruladıktan sonra:

```bash
gh auth login
gh repo create overload --private --source=. --push
```

Dağıtımın tamamı ayrı bir belgede: **[docs/dagitim.md](dagitim.md)**. Orada
platform adımları, zorunlu ortam değişkenleri ve atlanması en kolay iki şey
(yeni JWT sırrı, `--proxy-headers`) tek tek yazıyor.

GitHub Actions CI zaten hazır (`.github/workflows/ci.yml`), ilk push'ta
çalışır.

---

## Sorun giderme

**`DATABASE_URL 'postgresql+asyncpg://' ile başlamalı`**
Neon'un verdiği string `postgresql://` ile başlıyor. Öneki değiştir. Bu kontrol
bilerek var: asyncpg olmadan uygulama sessizce senkron sürücüye düşer ve her
istek event loop'u bloklar.

**`permission denied for table ...`**
Migration `0002` çalışmamış. `alembic upgrade head` ile uygula.

**`alembic` komutu `UnicodeDecodeError: 'charmap' codec can't decode byte ...` veriyor**

Alembic `alembic.ini` dosyasını işletim sisteminin **yerel kodlamasıyla** okuyor
(Türkçe Windows'ta cp1254). Dosyada UTF-8 kodlanmış bir Türkçe karakter varsa
migration hiç çalışmıyor. Bu yüzden `alembic.ini` bilerek **saf ASCII** tutuluyor
— dosyanın başında da uyarı var. Oraya Türkçe yorum ekleme.

Projedeki diğer tüm dosyalar UTF-8 ve Türkçe içerebilir; istisna yalnızca bu
dosya.

**`python` komutu Microsoft Store açıyor**
Windows'un Store yer tutucusu PATH'te önde. Ayarlar → Uygulamalar → Uygulama
Takma Adları → `python.exe` ve `python3.exe` kapatılmalı. (Bu makinede gerçek
Python zaten öne geçmiş durumda, sorun yaşamaman lazım.)
