# overload

Progresif overload'u merkeze alan kişisel antrenman, beslenme ve sağlık takip
sistemi. Spor, beslenme, vücut takibi ve AI destekli koçluk tek çatı altında.

> **Durum:** Backend temeli çalışır durumda (252 test geçiyor), frontend derleniyor.
> Hangi parçaların bittiği, hangilerinin iskelet olduğu aşağıda açıkça yazıyor.

---

## Hızlı başlangıç

Kurulum adımları ve hesap açma rehberi: **[docs/kurulum.md](docs/kurulum.md)**

```bash
docker compose up -d                                    # yerel Postgres
cd apps/api && .venv/Scripts/alembic upgrade head       # şema + RLS
cd apps/api && .venv/Scripts/python -m overload_api.seed.loader
cd apps/api && .venv/Scripts/uvicorn overload_api.main:app --reload
pnpm dev:web
```

---

## Mimari

```
apps/
  api/      FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2   (Python 3.13)
  web/      Next.js 16 + React 19 + Tailwind 4                 (TypeScript)
packages/
  shared-types/   FastAPI OpenAPI şemasından üretilen TS tipleri
docs/
scripts/
```

Özellik bazlı klasörleme (MVC değil): `features/chat`, `features/workouts` — her
biri kendi router/service/schema dosyalarını barındırır.

Ayrıntılı kararlar ve gerekçeleri: **[docs/mimari.md](docs/mimari.md)**

---

## Ne bitti, ne bitmedi

### Çalışıyor ve test edilmiş

| Parça | Durum |
|---|---|
| Veri modeli — 23 tablo, 35 FK, 34 CHECK, 22 indeks | ✅ migration üretildi ve derleniyor |
| Row-Level Security — politikalar + ayrı uygulama rolü | ✅ migration `0002` |
| Progresif overload motoru | ✅ 26 birim testi |
| TDEE + makro hedefi (Mifflin-St Jeor) | ✅ 16 birim testi |
| AI tool yüzeyi ve risk katmanlaması | ✅ 21 sınır testi |
| Seed verisi tutarlılığı | ✅ 183 test |
| **REST API — 46 endpoint** | ✅ antrenman, program, beslenme, kilo, asistan |
| TS tip köprüsü (`openapi-typescript`) | ✅ 2993 satır tip üretiliyor |
| Frontend derlemesi — 8 rota | ✅ TypeScript temiz |
| Kas ısı haritası bileşeni | ✅ ön/arka, hacim renklendirmesi |
| Antrenman modu (set girişi + dinlenme sayacı) | ✅ arayüz hazır, örnek veriyle |
| AI sohbet arayüzü + onay kartları | ✅ SSE tüketimi ve onay/ret akışı |
| CI (GitHub Actions) | ✅ backend + frontend + OpenAPI senkron kontrolü |

### API hazır, arayüz bağlanmadı

Bu ekranların endpoint'leri **çalışıyor**; eksik olan sadece React tarafı.
`PagePlaceholder` her birinde hangi endpoint'e bağlanacağını listeliyor —
sahte veriyle "çalışıyormuş gibi" görünmüyorlar.

- **Programlar** — şablon kütüphanesi, drag & drop düzenleme, AI ile oluşturma ekranı
- **İlerleme** — PR grafikleri, güç standartları, tutarlılık ısı haritası
- **Beslenme** — günlük log, barkod okuma, TDEE hesaplayıcı

Ana panel, Antrenman modu ve Kas haritası ekranları da hâlâ örnek veriyle
çalışıyor; gerçek endpoint'lere bağlanmaları gerekiyor.

### Henüz başlanmadı

- Cloudflare R2 yükleme akışı (yapılandırma hazır, istemci yazılmadı)
- Haftalık koç raporu zamanlayıcısı (Batch API sarmalayıcısı hazır, cron yazılmadı)
- Supplement ve soreness endpoint'leri (modeller ve AI tool'ları hazır, REST yok)
- Güç standartları tablosu
- PWA servis worker (Serwist)
- Playwright uçtan uca testleri
- **Canlı veritabanına karşı doğrulama** — RLS politikaları ve migration'lar
  henüz gerçek Postgres'te koşmadı (Docker lisans onayı ya da Neon hesabı bekliyor)

---

## Komutlar

```bash
# Backend
cd apps/api
.venv/Scripts/python -m pytest -q          # testler
.venv/Scripts/ruff check . && .venv/Scripts/ruff format --check .
.venv/Scripts/alembic upgrade head         # migration
.venv/Scripts/python -m overload_api.seed.loader --user EPOSTA

# Frontend
pnpm dev:web
pnpm --filter @overload/web build
pnpm --filter @overload/web typecheck

# Tip köprüsü — backend şeması değiştiğinde
python scripts/dump_openapi.py && pnpm gen:types
```

---

## Güvenlik modelinin özeti

Üç katman, üçü de bağımsız:

1. **JWT + servis katmanı filtreleme** — her sorgu `user_id` ile filtrelenir.
2. **Row-Level Security** — uygulama kodunda bir filtre unutulsa bile veritabanı
   satır döndürmez. Uygulama tablo sahibi olmayan `overload_app` rolüyle çalışır
   (sahip RLS'i baypas ederdi).
3. **AI onay akışı** — model veri değiştiremez. Riskli tool'lar sadece
   `PendingAction` üretir; değişikliği kullanıcının onayıyla tetiklenen
   deterministik kod uygular ve payload'ı yeniden doğrular.

Hesap ayarları (e-posta, şifre, güvenlik) AI'ya tamamen kapalı — bu bir prompt
talimatı değil, **tool yüzeyinin yokluğu**. `tests/test_ai_tools.py` bu sınırı test eder.
