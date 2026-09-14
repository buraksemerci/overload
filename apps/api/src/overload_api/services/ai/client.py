"""Anthropic API istemcisi.

--------------------------------------------------------------------------------
MODEL KATMANLARI
--------------------------------------------------------------------------------
* `anthropic_model_fast`  (varsayılan **claude-haiku-4-5**)  — yüksek hacimli,
  basit ayrıştırma: metin/fotoğraftan besin çıkarma.
* `anthropic_model_smart` (varsayılan **claude-sonnet-5**)   — sohbet ve haftalık
  koç raporu; tool kullanımı ve muhakeme burada.

Model kimliklerine tarih eki EKLENMEZ (`claude-haiku-4-5`, `claude-haiku-4-5-20251001`
değil) — SDK tarih ekli kimlikleri reddediyor.

--------------------------------------------------------------------------------
BU SÜRÜMDE DEĞİŞEN API DETAYLARI (eski örneklerden kopyalarken dikkat)
--------------------------------------------------------------------------------
* Claude Sonnet 5'te `temperature` / `top_p` / `top_k` **kaldırıldı** — gönderilirse
  400 döner. Bu yüzden hiçbir yerde örnekleme parametresi geçmiyoruz.
* `thinking.budget_tokens` de Sonnet 5'te kaldırıldı; tek açık mod
  `{"type": "adaptive"}`. Haiku 4.5 ise hâlâ `budget_tokens` bekler — ama
  ayrıştırma işinde düşünmeye ihtiyaç yok, orada `thinking` hiç geçilmiyor.
* Düşünme derinliği artık `output_config={"effort": ...}` ile ayarlanıyor.
* Yapılandırılmış çıktı `output_config={"format": ...}`; eski `output_format`
  parametresi kullanımdan kalktı.
* Sonnet 5'te asistan mesajı ön-doldurma (prefill) 400 döner.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, cast

import anthropic
from anthropic import AsyncAnthropic
from anthropic.types import (
    MessageParam,
    OutputConfigParam,
    TextBlockParam,
    ToolUnionParam,
)
from anthropic.types.messages.batch_create_params import Request

from overload_api.config import get_settings
from overload_api.services.ai.prompts import COACH_SYSTEM_PROMPT
from overload_api.services.ai.tools import ALL_TOOLS

_client: AsyncAnthropic | None = None

#: Sohbet cevapları için üst sınır. Akışla (streaming) gönderildiği için yüksek
#: tutmanın maliyeti yok; düşük tutmak cevabı cümle ortasında kesme riski demek.
CHAT_MAX_TOKENS = 16_000
PARSE_MAX_TOKENS = 2_000


def get_client() -> AsyncAnthropic:
    """Süreç ömrü boyunca tek istemci — bağlantı havuzu yeniden kullanılsın."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncAnthropic(
            api_key=settings.require_anthropic_key(),
            max_retries=3,  # 429 ve 5xx SDK tarafından üstel geri çekilmeyle yeniden denenir
        )
    return _client


def _cached_system() -> list[TextBlockParam]:
    """Sistem promptu + (render sırası gereği) tool tanımları tek önbellek bloğunda.

    Anthropic render sırası `tools -> system -> messages`. Önbellek kesme noktasını
    sistem bloğunun sonuna koyduğumuzda önündeki her şey — yani tool tanımlarının
    tamamı — aynı öneke dahil olur ve birlikte önbelleklenir. Tek kesme noktasıyla
    ikisini birden yakalamış oluyoruz.
    """
    return [
        {
            "type": "text",
            "text": COACH_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ]


def _with_history_breakpoint(messages: list[dict[str, Any]]) -> list[MessageParam]:
    """Sohbet geçmişinin sonuna ikinci bir önbellek kesme noktası koyar.

    Geçmiş turlar artık değişmeyeceği için önbelleklenebilir; sadece en son
    kullanıcı mesajı (taze bağlam bloğunu içeren) her seferinde yeniden işlenir.
    Uzun sohbetlerde asıl tasarruf buradan gelir.
    """
    # `cast`: mesajlar veritabanından geliyor ve şekilleri çalışma zamanında
    # doğru, ama dinamik kurulan bir sözlüğün `MessageParam` TypedDict'ine
    # uyduğunu tip denetleyicisi doğrulayamıyor. Sınırda bir kez dönüştürüyoruz.
    if len(messages) < 2:
        return cast(list[MessageParam], messages)

    out = [dict(m) for m in messages]
    prev = out[-2]
    content = prev.get("content")
    if isinstance(content, str):
        prev["content"] = [
            {"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}
        ]
    elif isinstance(content, list) and content:
        blocks = [dict(b) if isinstance(b, dict) else b for b in content]
        last = blocks[-1]
        if isinstance(last, dict):
            last["cache_control"] = {"type": "ephemeral"}
        prev["content"] = blocks
    return cast(list[MessageParam], out)


async def stream_chat(
    messages: list[dict[str, Any]],
    *,
    effort: str = "medium",
) -> AsyncIterator[Any]:
    """Sohbet turunu akış olarak çalıştırır; ham stream olaylarını yayar.

    `effort="medium"`: sohbet cevapları kodlama/ajan işleri kadar derin muhakeme
    istemiyor; `high` varsayılanı burada gereksiz token harcar. Program kurgusu gibi
    ağır turlarda çağıran taraf `high`'a yükseltebilir.
    """
    client = get_client()
    settings = get_settings()

    async with client.messages.stream(
        model=settings.anthropic_model_smart,
        max_tokens=CHAT_MAX_TOKENS,
        system=_cached_system(),
        # Tool tanımları `tools.py`'de sözlük olarak kuruluyor (prompt caching
        # için sıraları sabit); SDK'nın birleşik TypedDict'ine sınırda dönüşüyor.
        tools=cast(list[ToolUnionParam], list(ALL_TOOLS)),
        messages=_with_history_breakpoint(messages),
        thinking={"type": "adaptive"},
        output_config=cast(OutputConfigParam, {"effort": effort}),
    ) as stream:
        async for event in stream:
            yield event
        # Akış bittiğinde tam mesajı da yayınla ki çağıran taraf
        # tool_use bloklarını ve usage bilgisini görebilsin.
        yield await stream.get_final_message()


async def complete_chat(
    messages: list[dict[str, Any]],
    *,
    effort: str = "medium",
) -> anthropic.types.Message:
    """Akışsız tek tur — tool döngüsünün ara adımlarında kullanılır."""
    client = get_client()
    settings = get_settings()
    response: anthropic.types.Message = await client.messages.create(
        model=settings.anthropic_model_smart,
        max_tokens=CHAT_MAX_TOKENS,
        system=_cached_system(),
        # Tool tanımları `tools.py`'de sözlük olarak kuruluyor (prompt caching
        # için sıraları sabit); SDK'nın birleşik TypedDict'ine sınırda dönüşüyor.
        tools=cast(list[ToolUnionParam], list(ALL_TOOLS)),
        messages=_with_history_breakpoint(messages),
        thinking={"type": "adaptive"},
        output_config=cast(OutputConfigParam, {"effort": effort}),
    )
    return response


async def parse_structured(
    *,
    system: str,
    content: list[dict[str, Any]],
    schema: dict[str, Any],
) -> str:
    """Haiku katmanında yapılandırılmış çıktı üretir (besin/foto ayrıştırma).

    `thinking` geçilmiyor: bu iş muhakeme değil çıkarım, ve Haiku 4.5'te
    düşünme `budget_tokens` gerektirir — gereksiz karmaşıklık.
    Dönüş değeri JSON metni; çağıran taraf Pydantic ile doğrular.
    """
    client = get_client()
    settings = get_settings()

    response = await client.messages.create(
        model=settings.anthropic_model_fast,
        max_tokens=PARSE_MAX_TOKENS,
        system=system,
        messages=cast(list[MessageParam], [{"role": "user", "content": content}]),
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    # output_config.format garantisi: ilk text bloğu geçerli JSON.
    text: str = next(b.text for b in response.content if b.type == "text")
    return text


async def submit_weekly_report_batch(
    requests: list[dict[str, Any]],
) -> str:
    """Haftalık koç raporlarını Batch API'ye gönderir (bölüm 4.3: gece çalışır).

    Batch, anlık API'nin yarı fiyatına çalışır ve gecikme önemsiz olduğu için
    bu iş yükü için doğru araç. Dönüş: batch id — sonuçlar `collect_batch_results`
    ile toplanır.
    """
    client = get_client()
    # İstekler `features/coach/service.py` içinde sözlük olarak kuruluyor;
    # SDK'nın `Request` TypedDict'ine sınırda dönüşüyor.
    batch = await client.messages.batches.create(requests=cast(list[Request], requests))
    return batch.id


async def collect_batch_results(batch_id: str) -> dict[str, str]:
    """Tamamlanmış batch'in sonuçlarını `custom_id -> metin` olarak döndürür.

    Sonuçlar **gönderim sırasıyla gelmez**; bu yüzden konuma göre değil,
    `custom_id`'ye göre eşleştiriyoruz.
    """
    client = get_client()
    out: dict[str, str] = {}
    async for entry in await client.messages.batches.results(batch_id):
        if entry.result.type != "succeeded":
            continue
        text = next(
            (b.text for b in entry.result.message.content if b.type == "text"),
            "",
        )
        out[entry.custom_id] = text
    return out


async def batch_status(batch_id: str) -> str:
    client = get_client()
    batch = await client.messages.batches.retrieve(batch_id)
    return batch.processing_status
