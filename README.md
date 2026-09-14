# overload

Progresif overload'u merkeze alan kişisel antrenman, beslenme ve sağlık takip
sistemi. Spor, beslenme, vücut takibi ve AI destekli koçluk tek çatı altında.

> **Durum:** Backend ve frontend uçtan uca kurulu, canlı Postgres'e karşı
> doğrulandı: migration'lar koştu, RLS izolasyonu gerçek veriyle sınandı,
> antrenman kaydetme akışı tarayıcıdan uçtan uca çalıştırıldı.
> **Doğrulanmamış tek alan: Anthropic/USDA/R2 anahtarı gerektiren özellikler**
> — bkz. aşağıdaki "Bilinen sınırlar".

---

## Hızlı başlangıç

Kurulum adımları ve hesap açma rehberi: **[docs/kurulum.md](docs/kurulum.md)**

```bash
docker compose up -d                                    # yerel Postgres
cd apps/api && .venv/Scripts/alembic upgrade head       # şema + RLS + yüzde alanı
cd apps/api && .venv/Scripts/python -m overload_api.seed.loader
cd apps/api && .venv/Scripts/uvicorn overload_api.main:app --reload
pnpm dev:web
```

---

## Mimari

```
apps/
  api/      FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2   (Python 3.13)
  web/      Next.js 16 + React 19 + Tailwind 4 + TanStack Query (TypeScript)
packages/
  shared-types/   FastAPI OpenAPI şemasından üretilen TS tipleri
docs/
scripts/
```

Özellik bazlı klasörleme (MVC değil): `features/workouts`, `features/programs`,
`features/nutrition`, `features/body`, `features/progress`, `features/coach`,
`features/media`, `features/chat` — her biri kendi router/service/schema
dosyalarını barındırır.

Ayrıntılı kararlar ve gerekçeleri: **[docs/mimari.md](docs/mimari.md)**

---

## Durum

### Backend — 73 endpoint

| Alan | Endpoint | Öne çıkan |
|---|---|---|
| Kimlik | `/auth/*`, `/users/me` | JWT (fastapi-users). Hesap ayarları AI'ya kapalı |
| Antrenman | `/workouts/*` | Üç adımlı seans akışı, ilerleme önerisi, kas hacmi, seri, PR'lar |
| Program | `/programs/*`, `/exercises` | Şablon klonlama, aktifleştirme, gün/hareket ağacı |
| İlerleme | `/progress/*` | Güç standartları, tutarlılık ızgarası, zaman serileri |
| Beslenme | `/nutrition/*`, `/foods/*` | USDA + Open Food Facts, TDEE, barkod |
| Vücut | `/bodyweight/*`, `/supplements/*`, `/soreness`, `/injuries` | Trend, uyum takibi, sakatlık uyarıları |
| Koç | `/coach/*` | Haftalık AI raporu + canlı hafta metrikleri |
| Medya | `/media/*` | Ön-imzalı R2 yükleme |
| Asistan | `/chat/*` | SSE akışı, onay kartları, denetim kaydı |

### Frontend — 15 ekran (Bölüm 8'in tamamı)

Onboarding · Ana Panel · Antrenman Modu · Program Yönetimi · Hareket Kütüphanesi ·
Geçmiş · Kas Haritası · İlerleme · Beslenme · Kilo Takibi · Supplement ·
Ağrı Check-in · AI Asistan · Koç Raporu · Hesap Ayarları

PWA olarak kurulabilir (Serwist servis worker + manifest + ikonlar).

### Testler

```
Backend   374  (pytest)     progresif overload, TDEE, güç standartları, öğün önerisi,
                             AI tool sınırları, seed tutarlılığı
Frontend    6  (Vitest)     SSE çerçeve ayrıştırıcısı
E2E         34 (Playwright) oturum, gezinme, set kaydı, program gözden geçirme
```

---

## Bilinen sınırlar

Bunlar eksiklik değil, **bilinçli olarak çizilmiş sınırlar** — sessizce yanlış
modellemek yerine açıkça belirtiliyorlar:

- **AI, besin arama ve fotoğraf yükleme canlıda denenmedi.** Sırasıyla
  `ANTHROPIC_API_KEY`, `USDA_API_KEY` ve Cloudflare R2 kimlik bilgisi gerekiyor;
  üçü de `.env`'de boş. Kod yazıldı ve birim testleri geçiyor, ama gerçek bir
  API çağrısı hiç yapılmadı.
- **Router'ların otomatik testi yok.** Testler saf servis/motor katmanını
  kapsıyor; endpoint'ler elle ve tarayıcıdan doğrulandı. Bu boşluk gerçek bir
  hatayı gizlemişti: `SessionOut.sets` ORM'deki `set_logs` ilişkisiyle
  eşleşmediği için kaydedilmiş setler cevaba hiç girmiyordu (bkz.
  `tests/test_api_schemas.py`). Şema düzeyinde test eklendi, HTTP düzeyinde
  hâlâ yok.
- **Periyodizasyon (hafta dalgaları) modellenmedi.** 5/3/1, nSuns ve Candito
  4-6 haftalık dalgalar hâlinde çalışıyor; veri modelinde "hafta" kavramı yok.
  Şablonlar 1. hafta yüzdeleriyle kaydediliyor, sonraki haftalar açıklamada
  yazıyor.
- **Süre bazlı hareketler (plank) "tekrar" alanında saniye tutuyor.** Ayrı bir
  süre alanı yok.
- **Güç standardı oranları yaklaşıktır** ve yaş düzeltmesi içermiyor;
  `Sex.unspecified` için bilinçli olarak sonuç üretilmiyor.
- **E2E testleri backend'i taklit ediyor**, gerçek API'yi çağırmıyor.

---

## Komutlar

```bash
# Backend
cd apps/api
.venv/Scripts/python -m pytest -q
.venv/Scripts/ruff check . && .venv/Scripts/ruff format --check .
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m overload_api.seed.loader --user EPOSTA

# Haftalık koç raporu (cron)
.venv/Scripts/python -m overload_api.scripts.weekly_reports run

# Frontend
pnpm dev:web
pnpm --filter @overload/web build       # not: --webpack (Serwist için)
pnpm --filter @overload/web typecheck
pnpm --filter @overload/web test
pnpm --filter @overload/web e2e

# Tip köprüsü — backend şeması değiştiğinde
python scripts/dump_openapi.py && pnpm gen:types

# PWA ikonlarını yeniden üret
python scripts/generate_icons.py
```

---

## Güvenlik modelinin özeti

Üç katman, üçü de bağımsız:

1. **JWT + servis katmanı filtreleme** — her sorgu `user_id` ile filtrelenir.
2. **Row-Level Security** — uygulama kodunda bir filtre unutulsa bile veritabanı
   satır döndürmez. Uygulama tablo sahibi olmayan `overload_app` rolüyle çalışır
   (sahip RLS'i baypas ederdi — bu sessiz bir tuzak).
3. **AI onay akışı** — model veri değiştiremez. Riskli tool'lar sadece
   `PendingAction` üretir; değişikliği kullanıcının onayıyla tetiklenen
   deterministik kod uygular ve payload'ı yeniden doğrular.

Hesap ayarları (e-posta, şifre, profil) AI'ya tamamen kapalı — bu bir prompt
talimatı değil, **tool yüzeyinin yokluğu**. `tests/test_ai_tools.py` bu sınırı
test eder.

Fotoğraflar ön-imzalı URL'lerle doğrudan R2'ye gider; bucket herkese açık değil
ve veritabanında URL değil **anahtar** saklanır.
