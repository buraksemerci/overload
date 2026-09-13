"""OpenAPI şemasını dosyaya döker — sunucu çalıştırmaya gerek yok.

`openapi-typescript` normalde çalışan bir sunucudan URL ile okur. Bu, CI'da
"tipler güncel mi" kontrolü için gereksiz karmaşıklık demek: sadece şemayı
üretmek için uvicorn + veritabanı ayağa kaldırmak gerekirdi. FastAPI şemayı
uygulama nesnesinden senkron üretebiliyor; bu betik onu kullanıyor.

Kullanım:
    python scripts/dump_openapi.py            # apps/api/openapi.json yazar
    python scripts/dump_openapi.py --check    # dosya güncel mi (CI için)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))

from overload_api.main import app  # noqa: E402

TARGET = ROOT / "apps" / "api" / "openapi.json"


def render() -> str:
    # sort_keys: şema üretimi deterministik olsun ki --check gereksiz yere patlamasın.
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Dosyayı yazmaz; güncel değilse 1 ile çıkar (CI).",
    )
    args = parser.parse_args()

    content = render()

    if args.check:
        if not TARGET.exists():
            print(f"HATA: {TARGET.name} yok. `python scripts/dump_openapi.py` çalıştır.")
            raise SystemExit(1)
        if TARGET.read_text(encoding="utf-8") != content:
            print(
                f"HATA: {TARGET.name} güncel değil. "
                "`python scripts/dump_openapi.py && pnpm gen:types` çalıştırıp commit et."
            )
            raise SystemExit(1)
        print(f"{TARGET.name} güncel.")
        return

    TARGET.write_text(content, encoding="utf-8")
    endpoints = sum(len(v) for v in app.openapi()["paths"].values())
    print(f"Yazildi: {TARGET}  ({endpoints} endpoint)")


if __name__ == "__main__":
    main()
