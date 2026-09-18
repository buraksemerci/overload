# Dağıtım

Uygulamayı kendi çevrene (5-10 kişi) açmak için. Yerelde çalıştığını
doğruladıktan sonra oku.

Üç parça var ve üçü ayrı yerlerde duruyor: **web** (Next.js), **API**
(FastAPI), **veritabanı** (Postgres 17). Her birinin ücretsiz katmanı bu
ölçek için yeterli.

---

## 0. Önce şunu yap: yeni bir JWT sırrı üret

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`.env.example` içindeki varsayılan değer **depoda yazılı**. Onunla üretime
çıkmak, herkese kendine geçerli bir oturum jetonu üretme imkânı vermek demek.

API `ENVIRONMENT=production` iken varsayılan sırla **açılmıyor** — açılış
hatası veriyor ve sebebini yazıyor. Bu kontrol tam olarak bu adımı atlamamak
için var.

---

## 1. Veritabanı — Neon

[neon.tech](https://neon.tech) → yeni proje → Postgres 17.

Panelden iki bağlantı dizesi alacaksın; ikisi de aynı veritabanına işaret
ediyor ama sürücüleri farklı:

```
DATABASE_URL=postgresql+asyncpg://...      # uygulama (async)
DATABASE_URL_SYNC=postgresql+psycopg://... # alembic (senkron)
```

Neon'un verdiği dize `postgresql://` ile başlıyor; ön eki **elle**
değiştirmen gerekiyor. Uygulama `postgresql+asyncpg://` ile başlamayan bir
dizeyi reddediyor: asyncpg olmadan her istek olay döngüsünü blokluyor ve
sorun ancak yük altında ortaya çıkıyor.

Şemayı kur:

```bash
cd apps/api && DATABASE_URL_SYNC="<neon-sync-dizesi>" ./.venv/Scripts/alembic upgrade head
```

Paylaşılan referans veriyi (kas grupları, hareket kütüphanesi, şablon
programlar) yükle:

```bash
cd apps/api && ./.venv/Scripts/python -m overload_api.seed.loader
```

---

## 2. API — Railway ya da Render

Repoyu bağla, kök dizin `apps/api`.

**Başlatma komutu** — `--proxy-headers` ŞART:

```
uvicorn overload_api.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
```

Bu olmadan giriş denemesi sınırı bütün istekleri **tek bir IP** (vekilin
adresi) gibi görüyor: bir kişinin yanlış parola denemeleri herkesi kilitliyor.
`--forwarded-allow-ips` yalnızca platformun vekili önünde olduğu için `*`
kabul edilebilir; vekilsiz doğrudan internete açık bir sunucuda bu ayar
saldırganın adresini istediği gibi yazmasına izin verirdi.

**Ortam değişkenleri** (`.env.example` tam listeyi açıklıyor):

| Değişken | Not |
|---|---|
| `ENVIRONMENT` | `production` — açılış denetimlerini etkinleştiriyor |
| `JWT_SECRET` | 0. adımda ürettiğin değer |
| `DATABASE_URL` / `DATABASE_URL_SYNC` | Neon'dan |
| `FRONTEND_URL` | Vercel'in verdiği adres. CORS **yalnızca** bunu kabul ediyor |
| `SMTP_*`, `EMAIL_FROM` | Aşağıya bak |
| `ANTHROPIC_API_KEY` | Asistan için |
| `R2_*` | Fotoğraf yükleme için |
| `USDA_API_KEY` | Besin araması için |

Eksik olanlar açılışta **uyarı** olarak günlüğe yazılıyor; hangi özelliğin
kapalı kaldığı orada yazıyor.

---

## 3. E-posta — Resend ya da Brevo

Parola sıfırlama ve doğrulama bağlantıları buradan gidiyor.

`SMTP_HOST` boşken uygulama çalışmaya devam ediyor ama **parolasını unutan
kullanıcı hesabına giremiyor**: bağlantı yalnızca sunucu günlüğüne yazılıyor.
Beş on kişilik bir grupta bu er geç birinin başına geliyor.

- [Resend](https://resend.com) — ayda 3.000 posta ücretsiz
- [Brevo](https://brevo.com) — günde 300

İkisi de gönderen alan adının doğrulanmasını istiyor (DNS'e birkaç kayıt).
Doğrulanmamış alan adından giden postalar spam'e düşüyor.

`EMAIL_FROM` bu alan adıyla aynı olmak zorunda.

---

## 4. Web — Vercel

Repoyu bağla, kök dizin `apps/web`.

İki değişken:

```
NEXT_PUBLIC_API_URL=https://<api-adresin>
NEXT_PUBLIC_SITE_URL=https://<sitenin-adresi>
```

`NEXT_PUBLIC_` ön eki bu değerin **tarayıcıya gömüldüğü** anlamına geliyor;
oraya gizli bir şey koyma.

`NEXT_PUBLIC_SITE_URL` yalnızca paylaşım önizlemesi (Open Graph) görselinin
mutlak adresini üretmek için: boş bırakılırsa bağlantı paylaşıldığında kart
görselsiz görünür, uygulamanın kendisi çalışmaya devam eder.

Derleme komutu `pnpm build`. Depoda `--webpack` bayrağı var ve bilerek:
Turbopack üretim derlemesinde bu projede kararsız davranıyor.

---

## 5. Açılıştan sonra

**Kendi hesabını aç ve doğrula.** Kayıt olunca doğrulama e-postası
kendiliğinden gidiyor; gelmiyorsa SMTP ayarları yanlış demektir ve bunu
kullanıcıları davet etmeden önce öğrenmen gerekiyor.

**Anthropic panelinde aylık harcama tavanı koy.** Uygulama kullanıcı başına
günlük sınır uyguluyor (`AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_TOKEN_LIMIT`) ama
o sınır kullanıcı sayısıyla çarpılıyor. Tavan, ikinci ve son savunma hattı.

**Yedek.** Neon otomatik anlık görüntü alıyor ama geri yükleme elle. Ayda bir
`pg_dump` alıp başka bir yere koymak, "veritabanı gitti" senaryosunu bir
felaketten bir sıkıntıya indiriyor.

---

## Güncelleme

```bash
git push
```

Vercel ve Railway kendiliğinden yeniden dağıtıyor. **Migration otomatik
KOŞMUYOR** — bu bilinçli: şema değişikliği geri alınamaz ve otomatik koşan
bir migration, hatalı bir dağıtımı veri kaybına çeviriyor.

Yeni migration varsa önce onu koş:

```bash
cd apps/api && DATABASE_URL_SYNC="<neon-sync-dizesi>" ./.venv/Scripts/alembic upgrade head
```

---

## Sorun giderme

**Tarayıcı "CORS hatası" diyor**
`FRONTEND_URL` Vercel'in gerçek adresiyle birebir aynı mı? Üretimde başka
hiçbir kaynak kabul edilmiyor. Sondaki `/` fark yaratıyor.

**Giriş yapılıyor ama her istek 401**
`NEXT_PUBLIC_API_URL` yanlış olabilir ya da API `.env`indeki `JWT_SECRET`
dağıtımlar arasında değişmiş olabilir — sır değişince bütün oturumlar düşer.

**"Çok fazla deneme yapıldı" herkeste çıkıyor**
`--proxy-headers` eksik. 2. adıma bak.

**Asistan "yapılandırılmadı" diyor**
`ANTHROPIC_API_KEY` tanımlı değil. Uygulamanın geri kalanı bu anahtar
olmadan da çalışıyor.
