"""AI tool yüzeyinin güvenlik sınırlarını doğrulayan testler.

Bu testler "model şunu yapmasın" talimatını değil, **yapamayacağını** test eder.
Prompt talimatı aşılabilir; olmayan bir tool çağrılamaz.
"""

from __future__ import annotations

import json

import pytest

from overload_api.db.models.ai import ActionType
from overload_api.services.ai import tools
from overload_api.services.ai.executors import (
    ProposeUpdatePayload,
    ToolExecutionError,
    _UPDATABLE,
    _validate,
)


class TestToolSurface:
    def test_no_tool_can_touch_account_settings(self) -> None:
        """Bölüm 4.3'ün sabit sınırı: hesap ayarları sohbetten değiştirilemez.

        Garanti prompt metninde değil, tool yüzeyinin yokluğunda.
        """
        forbidden_words = {"password", "email", "account", "auth", "user_settings", "security"}
        for tool in tools.ALL_TOOLS:
            name = tool["name"].lower()
            assert not (forbidden_words & set(name.split("_"))), (
                f"'{tool['name']}' hesap ayarlarına dokunuyor olabilir"
            )

    def test_every_tool_is_classified(self) -> None:
        """Her tool ya otomatik ya onaylı olmalı — sınıflandırılmamış tool,
        runtime'da sessizce reddedilen bir tool demektir."""
        classified = tools.AUTO_EXECUTE | tools.APPROVAL_REQUIRED
        declared = {ActionType(t["name"]) for t in tools.ALL_TOOLS}
        assert declared == classified

    def test_the_two_risk_sets_are_disjoint(self) -> None:
        assert not (tools.AUTO_EXECUTE & tools.APPROVAL_REQUIRED)

    def test_mutating_tools_all_require_approval(self) -> None:
        """Var olan veriyi değiştirebilen her tool onay kümesinde olmalı."""
        for action in (
            ActionType.propose_program,
            ActionType.propose_update,
            ActionType.add_exercise_to_library,
        ):
            assert tools.requires_approval(action)

    def test_auto_tools_only_append_or_read(self) -> None:
        """Otomatik kümede 'propose_' ile başlayan bir şey olmamalı."""
        for action in tools.AUTO_EXECUTE:
            assert action.value.startswith(("log_", "search_", "get_"))


class TestToolSchemas:
    @pytest.mark.parametrize("tool", tools.ALL_TOOLS, ids=lambda t: t["name"])
    def test_schema_is_strict_and_closed(self, tool: dict) -> None:
        """`strict: True` için `additionalProperties: False` ve eksiksiz `required`
        zorunlu — yoksa API 400 döner ya da model fazladan alan uydurabilir."""
        schema = tool["input_schema"]
        assert tool["strict"] is True
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"]), (
            f"{tool['name']}: strict şemada her alan required olmalı"
        )

    def test_definitions_are_json_serializable_and_stable(self) -> None:
        """Prompt caching önek eşleşmesi yapar; tanımlar deterministik
        serileşmeli, yoksa önbellek her istekte düşer."""
        first = json.dumps(tools.ALL_TOOLS, sort_keys=False, ensure_ascii=False)
        second = json.dumps(tools.ALL_TOOLS, sort_keys=False, ensure_ascii=False)
        assert first == second

    def test_program_exercises_must_reference_library_ids(self) -> None:
        """Kas haritasının doğruluğu buna bağlı: serbest metin hareket adı kabul
        edilmemeli, sadece kütüphaneden gelen id."""
        schema = tools.PROPOSE_PROGRAM["input_schema"]
        ex_schema = schema["properties"]["days"]["items"]["properties"]["exercises"]["items"]
        assert "exercise_id" in ex_schema["required"]
        assert "exercise_name" not in ex_schema["properties"]


class TestUpdateGuardrails:
    def test_forbidden_entities_are_rejected(self) -> None:
        for entity in ("user", "action_log", "pending_action"):
            with pytest.raises(ToolExecutionError):
                _validate(
                    ProposeUpdatePayload,
                    {
                        "entity": entity,
                        "operation": "update",
                        "entity_id": "00000000-0000-0000-0000-000000000001",
                        "changes": {"email": "attacker@example.com"},
                        "reason": "x",
                    },
                )

    def test_updatable_whitelist_excludes_forbidden(self) -> None:
        assert not (set(_UPDATABLE) & tools.FORBIDDEN_ENTITIES)

    def test_entity_enum_matches_schema(self) -> None:
        """JSON şemasındaki entity listesi ile uygulanabilir liste tutarlı olmalı;
        şemada olup uygulanamayan bir değer modele yalan söylemek olur."""
        schema_entities = set(
            tools.PROPOSE_UPDATE["input_schema"]["properties"]["entity"]["enum"]
        )
        assert not (schema_entities & tools.FORBIDDEN_ENTITIES)

    def test_unknown_field_is_rejected_not_ignored(self) -> None:
        """Beyaz listede olmayan alan sessizce atlanmamalı."""
        allowed = _UPDATABLE["body_weight_log"][1]
        assert "user_id" not in allowed
        assert "id" not in allowed
