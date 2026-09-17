"use client";

/**
 * Beslenme — günün kalan kalorisi ve öğünleri.
 *
 * --------------------------------------------------------------------------
 * BANT: TEK SAYI
 * --------------------------------------------------------------------------
 * Gün içinde sorulan tek soru "ne kadar kaldı". Cevabı bandın içinde, salonun
 * barındaki öğünün üstünde, ekranın en büyük yazısı. Halka ne kadarının
 * yendiğini gösteriyor; yanında üç makronun kalanı. Makrolar önceden "?"
 * arkasına saklanmıştı — geniş ekranda gizlenecek kadar yer sıkıntısı yoktu
 * ve kalan proteini görmek için bir düğmeye basmak gereksiz bir adımdı.
 *
 * --------------------------------------------------------------------------
 * ÖĞÜNLER: FOTOĞRAFLI KAROLAR
 * --------------------------------------------------------------------------
 * Dört öğün dört karo; o anki öğün (saate göre, ama kilitli değil) geniş karo
 * ve kalemleriyle birlikte. Diğer üçü fotoğraflı küçük karolar — dokununca
 * odak oraya geçiyor. Fotoğraflar aynı salonun barında çekilmiş öğünler.
 *
 * --------------------------------------------------------------------------
 * VOLT BÜTÇESİ
 * --------------------------------------------------------------------------
 * Ekrandaki tek volt dolgu birincil ekleme düğmesi. Halka ve makro çubukları
 * ince çizgi (`accent-deep`), dolgu değil. `e2e/design-rules.spec.ts` sayıyor.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Meter, Ring } from "@/components/Charts";
import { FoodSheet, type SheetMode } from "@/components/FoodSheet";
import { Photo } from "@/components/Photo";
import { Hero, InfoTip, Page, Section } from "@/components/Layout";
import { ErrorBox, Loading, fmt } from "@/components/States";
import { currentMeal, dayLabel, MEAL_ORDER, mealLabel, shiftDay } from "@/lib/meals";
import {
  useMe,
  useMealSuggestions,
  useNutritionDay,
  type FoodLogRow,
  type NutritionDay,
} from "@/lib/queries";

const GOALS = [
  { value: "cut", label: "Yağ kaybı" },
  { value: "maintain", label: "Koruma" },
  { value: "bulk", label: "Kas kazanımı" },
] as const;

/** Öğün fotoğrafları — hepsi aynı salonun barında. */
const MEAL_PHOTO: Record<string, string> = {
  breakfast: "meal-breakfast",
  lunch: "meal-lunch",
  snack: "meal-snack",
  dinner: "meal-dinner",
};

const num = (value: string | number | null | undefined): number =>
  typeof value === "number" ? value : Number.parseFloat(value ?? "0") || 0;

export default function NutritionPage() {
  const me = useMe();
  /* Seçilmediyse profildeki hedef (tanışma akışında soruluyor). Buradaki
     seçim KAYDEDİLMİYOR: "kas kazanımında olsam ne kadar yerdim" diye bakmak
     hedefi değiştirmek değil. Kalıcı değişiklik Hesap ekranından. */
  const [chosenGoal, setGoal] = useState<string | null>(null);
  const goal = chosenGoal ?? me.data?.nutrition_goal ?? "maintain";
  const [date, setDate] = useState<string | null>(null);
  const day = useNutritionDay(date, goal);

  // Odaktaki öğün saate göre başlıyor ama kilitli değil.
  const [focused, setFocused] = useState<string>(() => currentMeal());
  const [sheet, setSheet] = useState<SheetMode | null>(null);

  const data = day.data;

  const byMeal = useMemo(() => {
    const groups = new Map<string, FoodLogRow[]>(MEAL_ORDER.map((meal) => [meal, []]));
    for (const item of data?.items ?? []) {
      const group = groups.get(item.meal_type);
      if (group) group.push(item);
      else groups.set(item.meal_type, [item]);
    }
    return groups;
  }, [data]);

  const remainingCalories = data?.remaining ? num(data.remaining.calories) : null;

  return (
    <Page>
      <Hero
        photo="app-meal-bar"
        position="60% center"
        size="lg"
        eyebrow={dayLabel(date)}
        title="Beslenme"
        info={
          <>
            Değerler USDA FoodData Central ve Open Food Facts&apos;ten geliyor;
            kalori ve makro <strong>tahmin edilmiyor</strong>, gerçek veriden
            okunuyor. Makrolar 100 gram başına normalize ediliyor çünkü iki
            kaynağın porsiyon tanımları tutarsız. Hedef, kilo geçmişinden
            hesaplanan TDEE üzerine hedefe göre açık/fazla eklenerek çıkıyor.
          </>
        }
        actions={<DayNav date={date} onChange={setDate} />}
      >
        {day.isLoading ? (
          <div className="h-56" aria-busy="true" />
        ) : day.isError ? (
          <div className="max-w-md">
            <ErrorBox error={day.error} onRetry={() => void day.refetch()} />
          </div>
        ) : data ? (
          <Summary data={data} goal={goal} onGoal={setGoal} />
        ) : null}
      </Hero>

      {data && (
        <section aria-label="Öğünler" className="grid gap-3 lg:grid-cols-12">
          <FocusedMeal
            meal={focused}
            items={byMeal.get(focused) ?? []}
            onAdd={() => setSheet({ kind: "add", meal: focused })}
            onEdit={(log) => setSheet({ kind: "edit", log })}
          />
          <OtherMeals focused={focused} byMeal={byMeal} onFocus={setFocused} />
        </section>
      )}

      {data && <Suggestions goal={goal} />}

      {sheet && (
        <FoodSheet
          mode={sheet}
          date={date}
          remainingCalories={remainingCalories}
          onClose={() => setSheet(null)}
        />
      )}
    </Page>
  );
}

/* --- Gün gezinme ---------------------------------------------------------- */

function DayNav({
  date,
  onChange,
}: {
  date: string | null;
  onChange: (date: string | null) => void;
}) {
  return (
    <div className="glass flex items-center gap-1 p-1">
      <Arrow label="Önceki gün" direction="left" onClick={() => onChange(shiftDay(date, -1))} />
      <span className="min-w-[6.5rem] text-center text-sm font-medium">{dayLabel(date)}</span>
      {/* Bugünden ileri gidilemiyor: gelecekte yenen bir şey yok. */}
      <Arrow
        label="Sonraki gün"
        direction="right"
        disabled={date === null}
        onClick={() => onChange(shiftDay(date, 1))}
      />
    </div>
  );
}

function Arrow({
  label,
  direction,
  disabled,
  onClick,
}: {
  label: string;
  direction: "left" | "right";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center transition-colors hover:bg-[oklch(99%_0_0_/_0.12)] disabled:opacity-30"
      style={{ color: "var(--color-on-night)", transitionDuration: "var(--dur-micro)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

/* --- Bant: kalan kalori ----------------------------------------------------- */

function Summary({
  data,
  goal,
  onGoal,
}: {
  data: NutritionDay;
  goal: string;
  onGoal: (goal: string) => void;
}) {
  const eaten = num(data.totals.calories);

  if (!data.target) {
    return (
      <div className="max-w-[44rem]">
        <p className="display on-photo-dark text-2xl" style={{ color: "var(--color-on-night)" }}>
          Kalori hedefi hesaplanamıyor
        </p>
        <p className="on-photo-dark mt-2 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
          Boy, doğum tarihi, cinsiyet ve en az bir kilo kaydı gerekiyor. O zamana kadar
          yediklerin kaydedilebilir; sadece hedefle karşılaştırılamaz.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/account" className="btn btn-on-photo">
            Profili tamamla
          </Link>
          <Link href="/weight" className="btn btn-on-photo">
            Kilo gir
          </Link>
        </div>
      </div>
    );
  }

  const target = data.target.calories;
  const remaining = target - eaten;
  const over = remaining < 0;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-14">
      <div className="flex items-center gap-6">
        <Ring value={eaten} max={target} size={188} stroke={10} night>
          <div>
            <p className="display tnum text-4xl leading-none" style={{ color: "var(--color-on-night)" }}>
              {fmt(Math.abs(remaining), 0)}
            </p>
            <p className="label mt-1.5" style={{ color: "var(--color-on-night-muted)" }}>
              {over ? "kcal fazla" : "kcal kaldı"}
            </p>
          </div>
        </Ring>
        <div className="flex flex-col gap-1">
          <p className="tnum text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            <span className="display text-2xl" style={{ color: "var(--color-on-night)" }}>
              {fmt(eaten, 0)}
            </span>{" "}
            / {fmt(target, 0)} kcal yendi
          </p>
          <p className="tnum text-xs" style={{ color: "var(--color-on-night-faint)" }}>
            TDEE {fmt(data.target.tdee, 0)} kcal
          </p>
          {data.target.floor_applied && (
            <p className="mt-1 max-w-[28ch] text-xs" style={{ color: "var(--color-warning)" }}>
              Hedef 1200 kcal tabanına oturtuldu — daha düşük bir açık kas kaybı riski taşır.
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid grid-cols-3 gap-4 sm:gap-8">
          <MacroStat label="Protein" current={num(data.totals.protein_g)} target={data.target.protein_g} />
          <MacroStat label="Karbonhidrat" current={num(data.totals.carbs_g)} target={data.target.carbs_g} />
          <MacroStat label="Yağ" current={num(data.totals.fat_g)} target={data.target.fat_g} />
        </div>
        <div className="glass inline-flex w-full max-w-[30rem] gap-0.5 p-1" role="group" aria-label="Hedef">
          {GOALS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={goal === option.value}
              onClick={() => onGoal(option.value)}
              className="flex-1 px-3 py-2 text-xs transition-colors aria-pressed:bg-[oklch(99%_0_0_/_0.16)] aria-pressed:font-semibold"
              style={{
                color: goal === option.value ? "var(--color-on-night)" : "var(--color-on-night-muted)",
                transitionDuration: "var(--dur-micro)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MacroStat({ label, current, target }: { label: string; current: number; target: number }) {
  const left = target - current;
  // Hedefin üstü uyarı değil bilgi; kırmızı yalnızca gerçek hatalar için.
  const over = current > target * 1.1;
  return (
    <div className="min-w-0">
      <p className="label truncate" style={{ color: "var(--color-on-night-faint)" }}>
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="display tnum text-2xl lg:text-3xl" style={{ color: "var(--color-on-night)" }}>
          {fmt(Math.abs(left), 0)}
        </span>
        <span className="text-xs" style={{ color: "var(--color-on-night-muted)" }}>
          g {left < 0 ? "fazla" : "kaldı"}
        </span>
      </p>
      <div className="mt-2">
        <Meter night value={current} max={target} tone={over ? "warning" : "accent"} />
      </div>
      <p className="tnum mt-1 text-2xs" style={{ color: "var(--color-on-night-faint)" }}>
        {fmt(current, 0)} / {fmt(target, 0)} g
      </p>
    </div>
  );
}

/* --- Odaktaki öğün -------------------------------------------------------- */

function FocusedMeal({
  meal,
  items,
  onAdd,
  onEdit,
}: {
  meal: string;
  items: FoodLogRow[];
  onAdd: () => void;
  onEdit: (log: FoodLogRow) => void;
}) {
  const calories = items.reduce((sum, item) => sum + num(item.calories), 0);
  const protein = items.reduce((sum, item) => sum + num(item.protein_g), 0);

  return (
    <article className="card grid overflow-hidden lg:col-span-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Photo slug={MEAL_PHOTO[meal] ?? "meal-lunch"} fill scrim className="min-h-[15rem] lg:min-h-full">
        <div className="flex size-full flex-col justify-end p-6 lg:p-8">
          <p className="label on-photo-dark" style={{ color: "var(--color-on-night-faint)" }}>
            Şu an
          </p>
          <h2 className="display on-photo-dark mt-1 text-3xl lg:text-4xl" style={{ color: "var(--color-on-night)" }}>
            {mealLabel(meal)}
          </h2>
          <p className="tnum on-photo-dark mt-1 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            {items.length === 0 ? "Henüz bir şey yok." : `${fmt(calories, 0)} kcal · ${fmt(protein, 0)} g protein`}
          </p>
        </div>
      </Photo>

      <div className="flex flex-col p-6 lg:p-8">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center">
            <p className="display text-xl">Bu öğüne ilk kalemi ekle</p>
            <p className="mt-2 max-w-[40ch] text-sm text-[var(--color-ink-muted)]">
              Ara, barkodu okut ya da son yediklerinden seç. Makrolar 100 gramdan hesaplanıyor.
            </p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-[var(--color-border)]">
            {items.map((item, index) => (
              <li key={item.id} className="reveal" style={{ ["--i" as string]: index }}>
                {/* Satırın tamamı düzenlemeyi açıyor. */}
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  aria-label={`${item.food.name} kalemini düzenle`}
                  className="-mx-3 flex w-[calc(100%+1.5rem)] items-center justify-between gap-4 px-3 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{item.food.name}</span>
                    <span className="tnum block text-2xs text-[var(--color-ink-faint)]">
                      {fmt(item.quantity_g, 0)} g · P{fmt(item.protein_g, 0)} K{fmt(item.carbs_g, 0)} Y
                      {fmt(item.fat_g, 0)}
                    </span>
                  </span>
                  <span className="display tnum shrink-0 text-lg">{fmt(item.calories, 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-primary mt-6 self-start px-6 py-3" onClick={onAdd}>
          Besin ekle
        </button>
      </div>
    </article>
  );
}

/* --- Diğer öğünler -------------------------------------------------------- */

function OtherMeals({
  focused,
  byMeal,
  onFocus,
}: {
  focused: string;
  byMeal: Map<string, FoodLogRow[]>;
  onFocus: (meal: string) => void;
}) {
  const others = MEAL_ORDER.filter((meal) => meal !== focused);

  return (
    <ul className="grid gap-3 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1 lg:grid-rows-3">
      {others.map((meal) => {
        const items = byMeal.get(meal) ?? [];
        const calories = items.reduce((sum, item) => sum + num(item.calories), 0);
        return (
          <li key={meal}>
            <button
              type="button"
              onClick={() => onFocus(meal)}
              aria-label={`${mealLabel(meal)} öğününe geç`}
              className="card lift block h-32 w-full overflow-hidden text-left lg:h-full lg:min-h-[8.5rem]"
            >
              <Photo slug={MEAL_PHOTO[meal] ?? "meal-lunch"} fill scrim className="size-full">
                <div className="flex size-full items-end justify-between gap-3 p-4 lg:p-5">
                  <span className="display on-photo-dark text-xl" style={{ color: "var(--color-on-night)" }}>
                    {mealLabel(meal)}
                  </span>
                  <span className="tnum on-photo-dark text-xs" style={{ color: "var(--color-on-night-muted)" }}>
                    {items.length === 0 ? "—" : `${fmt(calories, 0)} kcal`}
                  </span>
                </div>
              </Photo>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* --- Öneri ---------------------------------------------------------------- */

/**
 * "Ne yesem" sorusuna aritmetik yanıt. Kapalı başlıyor: gün içinde her
 * açılışta okunacak bir şey değil, takıldığında bakılacak bir şey.
 */
function Suggestions({ goal }: { goal: string }) {
  const [open, setOpen] = useState(false);
  // Açılana kadar istek yok: uç besin önbelleğinde kombinasyon deniyor.
  const suggestions = useMealSuggestions(goal, open);

  return (
    <Section night className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="label" style={{ color: "var(--color-on-night-faint)" }}>
            Öneri
          </p>
          <p className="display mt-1 text-2xl" style={{ color: "var(--color-on-night)" }}>
            Kalan makrolara göre ne yesem?
          </p>
        </div>
        <button
          type="button"
          className="btn btn-on-photo"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Önerileri gizle" : "Öner"}
        </button>
      </div>

      {open && (
        <div className="reveal mt-6">
          <div className="mb-3 flex items-center gap-2">
            <p className="label" style={{ color: "var(--color-on-night-faint)" }}>
              Öneriler
            </p>
            <InfoTip label="Öneriler nasıl hesaplanıyor" onDark>
              Porsiyonlar kalan makro açığını dolduracak şekilde hesaplanıyor — tahmin değil,
              aritmetik. Besinler senin daha önce kaydettiklerinden seçiliyor.
            </InfoTip>
          </div>

          {suggestions.isLoading ? (
            <Loading />
          ) : suggestions.isError ? (
            <ErrorBox error={suggestions.error} />
          ) : suggestions.data?.reason ? (
            <p className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
              {suggestions.data.reason}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(suggestions.data?.suggestions ?? []).map((suggestion, index) => (
                <li
                  key={index}
                  className="reveal p-5"
                  style={{ ["--i" as string]: index, background: "var(--color-night-raised)" }}
                >
                  <ul className="space-y-1.5">
                    {suggestion.items.map((item) => (
                      <li
                        key={item.food_id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                        style={{ color: "var(--color-on-night)" }}
                      >
                        <span className="min-w-0 truncate">{item.name}</span>
                        <span className="tnum shrink-0" style={{ color: "var(--color-on-night-muted)" }}>
                          {item.quantity_g} g
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p
                    className="tnum mt-3 border-t pt-2 text-2xs"
                    style={{ borderColor: "var(--color-night-line)", color: "var(--color-on-night-faint)" }}
                  >
                    {suggestion.total_calories} kcal · P{suggestion.total_protein_g} K
                    {suggestion.total_carbs_g} Y{suggestion.total_fat_g}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
