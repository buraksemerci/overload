"""Sistem promptu ve bağlam özeti üretimi.

**Bu dosyadaki `COACH_SYSTEM_PROMPT` donuktur.** İçine tarih, kullanıcı adı, sayaç
gibi hiçbir dinamik değer girmemeli. Sebep: Anthropic prompt önbelleği bir *önek
eşleşmesi* yapar — sistem promptundaki tek byte değişirse o isteğin önbelleği ve
sonrasındaki her şey düşer. Sistem promptu ve tool tanımları sabit kaldığı sürece
her sohbet turunda bu blok önbellekten okunur (~%90 daha ucuz).

Değişken bağlam (son antrenmanlar, kilo trendi, bugünkü beslenme) sistem promptuna
DEĞİL, en son kullanıcı mesajına eklenir — `build_context_block()`. Böylece önek
sabit kalır, değişen kısım en sona düşer.

Not: "mid-conversation system message" özelliği bu işi daha temiz yapardı ama
Claude Sonnet 5 onu desteklemiyor (400 döner); o yüzden kullanıcı mesajı yolu seçildi.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

COACH_SYSTEM_PROMPT = """\
Sen "overload" adlı kişisel antrenman ve sağlık takip uygulamasının içindeki spor \
asistanısın. Kullanıcı spora yeniden dönen, progresif overload'u merkeze alan biri. \
Türkçe konuş, salon jargonunu doğal kullan (set, tekrar, RIR, failure, hacim).

## Nasıl konuşursun
- Kısa ve somut. Madde madde yaz, paragraf yığma.
- Sayı verirken kaynağını belirt ("geçen salı 40kg x 8 yapmıştın").
- Motive edici ol ama abartma; boş tebrik yerine ilerlemenin kendisini göster.
- Emin olmadığın şeyi uydurmak yerine sor ya da "bu veriye sahip değilim" de.

## Sayılar ve veri
- Ağırlık kilogram, besin miktarı gram, enerji kilokalori.
- Bir sonraki antrenman hedefini ASLA kafandan hesaplama: `get_progression_suggestion` \
çağır. Progresif overload matematiği deterministik kodda yapılır, senin işin sonucu \
açıklamak.
- Kalori/makro değerlerini kafandan yazma: `log_food_item` çağır, değerler gerçek \
besin veritabanından gelir.
- Hareket adı uydurma: her hareketin kas grubu eşlemesi var, uydurulan isim kas \
haritasını sessizce yanlışlar. Önce `search_exercise_library` çağır.

## Onay akışı — bunu kullanıcıya da açıkla
İki tür tool'un var:
1. Doğrudan çalışanlar: yeni kayıt ekleyenler (yemek, aktivite, kilo, ağrı, \
supplement) ve arama. Bunları çağırdığında iş biter.
2. Onay gerektirenler: `propose_program`, `propose_update`, `add_exercise_to_library`. \
Bunlar hiçbir şeyi DEĞİŞTİRMEZ — kullanıcıya bir onay kartı gösterirler. Kullanıcı \
kartı inceleyip onaylayana kadar hiçbir şey kaydedilmez.

Onay gerektiren bir tool çağırdıktan sonra "kaydettim", "programını oluşturdum" deme. \
"Önerimi hazırladım, aşağıdaki kartta inceleyip onaylayabilirsin" de. Kullanıcı \
onaylamadan o veri yok.

## Yapamayacakların
- Hesap ayarlarını (e-posta, şifre, güvenlik) değiştiremezsin. Bunlar için tool'un \
yok ve olmayacak. Kullanıcı isterse "Hesap Ayarları ekranından kendin yapabilirsin" de.
- Var olan bir kaydı doğrudan silemez/değiştiremezsin; sadece `propose_update` ile \
önerirsin.

## Sağlıkla ilgili sınırlar
Antrenman ve beslenme konusunda pratik öneri verirsin. Ama:
- Sakatlık, sürekli ağrı, uyuşma gibi belirtilerde doktora/fizyoterapiste yönlendir.
- Teşhis koyma, ilaç önerme, aşırı kısıtlayıcı diyet (günlük <1200 kcal) kurma.
- Kullanıcı yeme bozukluğuna işaret eden bir şey anlatırsa kalori matematiğine \
girme; destek almasını öner.

## Program önerirken
Önce şunları öğren, eksikse tahmin etme — sor:
- Hedef (güç mü, kas kütlesi mi, genel form mu)
- Haftada kaç gün, seans başına ne kadar süre
- Ekipman erişimi (tam donanımlı salon mu, sınırlı mı)
- Deneyim seviyesi ve varsa sakatlık geçmişi

Sonra her hareket için `search_exercise_library` ile gerçek id bul, `propose_program` \
ile öner. Gerekçeni `rationale` alanına yaz — kullanıcı onay kartında bunu görecek.
"""


def profile_line(
    *,
    age: int | None,
    sex: str | None,
    height_cm: int | None,
    experience: str | None,
    training_goal: str | None,
    days_per_week: int | None,
    nutrition_goal: str | None,
) -> str | None:
    """Profilin modele giden özeti — tek satır, yalnızca bilinenler.

    Önce hiç yoktu: asistan "haftada kaç gün çalışmalıyım" sorusunu
    kullanıcının deneyimini, hedefini ve kaç gün ayırabildiğini bilmeden
    cevaplıyordu. Genel bir tavsiye verip kullanıcıya tekrar sormak zorunda
    kalıyordu — bilgi zaten onboarding'de verilmişti.

    Ad, e-posta ya da doğum tarihi GÖNDERİLMİYOR: model yaşı biliyor, doğum
    gününe ihtiyacı yok. Yalnızca öneriyi değiştiren alanlar.
    """
    parts: list[str] = []
    if age is not None:
        parts.append(f"{age} yaş")
    if sex in _SEX_TR:
        parts.append(_SEX_TR[sex])
    if height_cm is not None:
        parts.append(f"{height_cm} cm")
    if experience in _EXPERIENCE_TR:
        parts.append(f"antrenman geçmişi: {_EXPERIENCE_TR[experience]}")
    if training_goal in _TRAINING_GOAL_TR:
        parts.append(f"antrenman hedefi: {_TRAINING_GOAL_TR[training_goal]}")
    if days_per_week is not None:
        parts.append(f"haftada {days_per_week} gün ayırabiliyor")
    if nutrition_goal in _NUTRITION_GOAL_TR:
        parts.append(f"beslenme hedefi: {_NUTRITION_GOAL_TR[nutrition_goal]}")
    return f"Profil: {', '.join(parts)}" if parts else None


_SEX_TR = {"male": "erkek", "female": "kadın"}
_EXPERIENCE_TR = {
    "new": "yeni başlıyor",
    "under_1y": "1 yıldan az",
    "one_to_three": "1-3 yıl",
    "over_three": "3 yıldan fazla",
}
_TRAINING_GOAL_TR = {
    "strength": "güç",
    "hypertrophy": "kas kütlesi",
    "powerbuilding": "güç ve kas",
    "general_fitness": "genel form",
}
_NUTRITION_GOAL_TR = {"cut": "yağ kaybı", "maintain": "koruma", "bulk": "kas kazanımı"}


def build_context_block(
    *,
    today: date,
    display_name: str | None,
    profile: str | None = None,
    bodyweight_trend: list[tuple[date, Decimal]],
    recent_sessions: list[dict[str, Any]],
    todays_nutrition: dict[str, Any] | None,
    active_program_name: str | None,
    streak_label: str,
    open_injuries: list[str],
) -> str:
    """Modele gönderilecek taze veritabanı özeti.

    Bu metin en son kullanıcı mesajının başına eklenir (sistem promptuna DEĞİL —
    modül docstring'ine bakın). Kasıtlı olarak kısa tutulur: her turda tekrar
    gönderilir ve önbelleğe girmez.
    """
    lines: list[str] = ["<guncel_veriler>", f"Bugün: {today.isoformat()}"]

    if display_name:
        lines.append(f"Kullanıcı: {display_name}")
    if profile:
        lines.append(profile)
    if active_program_name:
        lines.append(f"Aktif program: {active_program_name}")
    # Seri programa göre ölçülür (haftalık hedefi tutturmak), takvim gününe göre
    # değil — 5 günlük bir programda iki gün dinlenmek planın parçası.
    lines.append(f"Antrenman serisi: {streak_label}")

    if open_injuries:
        lines.append("Aktif sakatlık notu: " + "; ".join(open_injuries))

    if bodyweight_trend:
        trend = ", ".join(f"{d.isoformat()}: {w} kg" for d, w in bodyweight_trend[-5:])
        lines.append(f"Son kilo kayıtları: {trend}")
    else:
        lines.append("Kilo kaydı yok.")

    if recent_sessions:
        lines.append("Son antrenmanlar:")
        for s in recent_sessions[:5]:
            lines.append(f"  - {s['date']} — {s['label']}: " + "; ".join(s["highlights"]))
    else:
        lines.append("Kayıtlı antrenman yok.")

    if todays_nutrition:
        n = todays_nutrition
        lines.append(
            f"Bugünkü beslenme: {n['calories']:.0f} kcal "
            f"(P {n['protein_g']:.0f}g / K {n['carbs_g']:.0f}g / Y {n['fat_g']:.0f}g)"
        )
        if n.get("target_calories"):
            remaining = n["target_calories"] - n["calories"]
            lines.append(f"Kalori hedefi: {n['target_calories']:.0f} kcal, kalan {remaining:.0f}")
    else:
        lines.append("Bugün beslenme kaydı yok.")

    lines.append("</guncel_veriler>")
    return "\n".join(lines)


#: Fotoğraf/metinden besin ayrıştırma için ayrı, çok daha küçük sistem promptu.
#: Haiku katmanında çalışır — sohbet promptunun tamamını göndermek israf olurdu.
FOOD_PARSE_SYSTEM_PROMPT = """\
Sen bir besin ayrıştırıcısısın. Kullanıcının metnini ya da yemek fotoğrafını \
incele ve içindeki besin kalemlerini çıkar.

Kurallar:
- Her kalem için: İngilizce besin adı (veritabanı araması için), tahmini gram miktarı.
- Kalori ya da makro HESAPLAMA — o iş gerçek besin veritabanında yapılacak.
- Fotoğrafta porsiyon belirsizse standart porsiyon varsay ve tahmin olduğunu belirt.
- Emin olamadığın bir kalemi atlamak yerine düşük güvenle raporla.
"""
