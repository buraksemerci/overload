"use client";

/**
 * Beslenme — günün o anki öğünü merkezde.
 *
 * --------------------------------------------------------------------------
 * EKRANDA NE VAR, NE YOK
 * --------------------------------------------------------------------------
 * Önceki sürüm dört bölümü alt alta diziyordu: hedef tablosu, arama formu,
 * öğün önerileri ve günün bütün kalemleri. Hepsi doğru veriydi ama sabah
 * 8'de ekranın yarısı akşam yemeğiyle ilgiliydi.
 *
 * Şimdi ekranda üç şey var:
 *
 *   1. Bir sayı — kalan kalori. Kullanıcının gün içinde sorduğu tek soru bu.
 *   2. O anki öğün — saate göre seçiliyor, kalemleri ve ekleme düğmesiyle.
 *   3. Diğer öğünler — tek satırlık özetler, dokununca açılıyor.
 *
 * Makro çubukları, öğün önerileri ve kaynak açıklaması kaldırılmadı; istek
 * üzerine açılıyor. Uygulamanın dürüstlüğü (sayının nereden geldiğini
 * gizlememek) korunuyor, ama her açılışta okunması gerekmiyor.
 *
 * --------------------------------------------------------------------------
 * TEK VOLT ÖĞE
 * --------------------------------------------------------------------------
 * Halka `--color-accent-deep` ile ÇİZGİ olarak çiziliyor, dolgu değil —
 * antrenman ekranındaki dinlenme sayacının aynısı. Ekrandaki tek volt dolgu
 * birincil ekleme düğmesi. Tasarım kuralı `e2e/design-rules.spec.ts` ile
 * sınanıyor.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { FoodSheet, type SheetMode } from "@/components/FoodSheet";
import { Photo } from "@/components/Photo";
import { InfoTip, Page, PageHeader, Section } from "@/components/Layout";
import { ErrorBox, Loading, fmt } from "@/components/States";
import {
  currentMeal,
  dayLabel,
  MEAL_ORDER,
  mealLabel,
  shiftDay,
} from "@/lib/meals";
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

  // Odaktaki öğün saate göre başlıyor ama kilitli değil: kullanıcı başka bir
  // öğüne dokununca odak oraya geçiyor ve orada kalıyor.
  const [focused, setFocused] = useState<string>(() => currentMeal());
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [showMacros, setShowMacros] = useState(false);

  const data = day.data;

  const byMeal = useMemo(() => {
    const groups = new Map<string, FoodLogRow[]>(
      MEAL_ORDER.map((meal) => [meal, []]),
    );
    for (const item of data?.items ?? []) {
      // Harita bütün öğün adlarıyla önceden dolduruluyor; buradaki dal
      // yalnızca sunucudan beklenmeyen bir öğün tipi gelirse çalışıyor.
      const group = groups.get(item.meal_type);
      if (group) group.push(item);
      else groups.set(item.meal_type, [item]);
    }
    return groups;
  }, [data]);

  if (day.isLoading) return <Loading />;
  if (day.isError)
    return <ErrorBox error={day.error} onRetry={() => void day.refetch()} />;
  if (!data) return <Loading />;

  const remainingCalories = data.remaining
    ? num(data.remaining.calories)
    : null;

  return (
    <Page>
      <PageHeader
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
      />

      {/* --- 1. Kalan kalori --------------------------------------------- */}
      <Hero
        data={data}
        goal={goal}
        onGoal={setGoal}
        showMacros={showMacros}
        onToggleMacros={() => setShowMacros((v) => !v)}
      />

      {/* --- 2. O anki öğün ---------------------------------------------- */}
      <FocusedMeal
        meal={focused}
        items={byMeal.get(focused) ?? []}
        onAdd={() => setSheet({ kind: "add", meal: focused })}
        onEdit={(log) => setSheet({ kind: "edit", log })}
      />

      {/* --- 3. Diğer öğünler -------------------------------------------- */}
      <OtherMeals focused={focused} byMeal={byMeal} onFocus={setFocused} />

      <Suggestions goal={goal} />

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
    <div className="flex items-center gap-1">
      <Arrow
        label="Önceki gün"
        direction="left"
        onClick={() => onChange(shiftDay(date, -1))}
      />
      <span className="min-w-[6.5rem] text-center text-sm font-medium">
        {dayLabel(date)}
      </span>
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
      className="btn-quiet grid size-9 place-items-center rounded-[var(--radius-md)] text-[var(--color-ink-muted)] disabled:opacity-30"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

/* --- Kalan kalori --------------------------------------------------------- */

function Hero({
  data,
  goal,
  onGoal,
  showMacros,
  onToggleMacros,
}: {
  data: NutritionDay;
  goal: string;
  onGoal: (goal: string) => void;
  showMacros: boolean;
  onToggleMacros: () => void;
}) {
  const eaten = num(data.totals.calories);

  if (!data.target) {
    return (
      <Section>
        <p className="text-sm">Kalori hedefi hesaplanamıyor.</p>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Boy, doğum tarihi, cinsiyet ve en az bir kilo kaydı gerekiyor. O
          zamana kadar yediklerin kaydedilebilir; sadece hedefle
          karşılaştırılamaz.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/account" className="btn btn-ghost">
            Profili tamamla
          </Link>
          <Link href="/weight" className="btn btn-ghost">
            Kilo gir
          </Link>
        </div>
      </Section>
    );
  }

  const target = data.target.calories;
  const remaining = target - eaten;
  const ratio = target > 0 ? Math.min(1.25, eaten / target) : 0;
  const over = remaining < 0;

  return (
    <section className="card px-8 py-10 lg:px-12">
      {/* İçerik kartın içinde ORTALANMIŞ ve genişliği sınırlı: `justify-between`
          denendi, 1440px'te halka ile denetimler arasında yarım ekran boşluk
          bırakıyordu. Sade olmak seyrek olmak değil. */}
      <div className="mx-auto flex max-w-[46rem] flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-14">
        <Ring ratio={ratio} over={over}>
          <p className="figure tnum text-4xl leading-none">
            {fmt(Math.abs(remaining), 0)}
          </p>
          <p className="label mt-1.5">{over ? "kcal fazla" : "kcal kaldı"}</p>
        </Ring>

        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="seg" role="group" aria-label="Hedef">
            {GOALS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={goal === option.value}
                onClick={() => onGoal(option.value)}
                className="seg-item flex-1 text-xs"
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="tnum text-sm text-[var(--color-ink-muted)]">
            <span className="font-semibold text-[var(--color-ink)]">
              {fmt(eaten, 0)}
            </span>{" "}
            / {fmt(target, 0)} kcal yendi
          </p>

          {data.target.floor_applied && (
            <p className="text-xs" style={{ color: "var(--color-warning)" }}>
              Hedef 1200 kcal tabanına oturtuldu — daha düşük bir açık kas kaybı
              riski taşır.
            </p>
          )}

          {/* Makrolar istek üzerine: gün içinde bakılan sayı kalori, makrolar
              planlama sayısı. İkisini birden göstermek ekranı kalabalıklaştırıp
              asıl sayıyı gölgeliyordu. */}
          <div>
            <button
              type="button"
              className="btn btn-quiet -ml-2.5"
              aria-expanded={showMacros}
              onClick={onToggleMacros}
            >
              {showMacros ? "Makroları gizle" : "Makroları gör"}
            </button>

            {showMacros && (
              <div className="reveal mt-3 flex flex-col gap-3">
                <MacroBar
                  label="Protein"
                  current={num(data.totals.protein_g)}
                  target={data.target.protein_g}
                />
                <MacroBar
                  label="Karbonhidrat"
                  current={num(data.totals.carbs_g)}
                  target={data.target.carbs_g}
                />
                <MacroBar
                  label="Yağ"
                  current={num(data.totals.fat_g)}
                  target={data.target.fat_g}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Ring({
  ratio,
  over,
  children,
}: {
  ratio: number;
  over: boolean;
  children: React.ReactNode;
}) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  // Halka ÇİZGİ, dolgu değil: volt dolgu ekranda tek olmalı ve o birincil
  // düğme. Aynı karar antrenman ekranındaki dinlenme sayacında da alındı.
  const stroke = over ? "var(--color-warning)" : "var(--color-accent-deep)";

  return (
    <div className="relative grid size-[13.5rem] shrink-0 place-items-center">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="3"
        />
        {ratio > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            // `round` uç, uzunluk sıfırken bile bir NOKTA çiziyor: hiçbir şey
            // yenmemişken halkanın tepesinde açıklanamayan bir işaret duruyordu.
            // Yay yalnızca gerçekten varsa çiziliyor.
            strokeLinecap="round"
            strokeDasharray={`${Math.min(1, ratio) * circumference} ${circumference}`}
            style={{
              transition: "stroke-dasharray var(--dur-long) var(--ease-out)",
            }}
          />
        )}
      </svg>
      <div className="text-center">{children}</div>
    </div>
  );
}

function MacroBar({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  const ratio = target > 0 ? current / target : 0;
  // Hedefin üstü uyarı değil bilgi; kırmızı yalnızca gerçek hatalar için.
  const color =
    ratio > 1.1 ? "var(--color-warning)" : "var(--color-accent-deep)";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-[var(--color-ink-muted)]">{label}</span>
        <span className="tnum text-xs text-[var(--color-ink-faint)]">
          {fmt(current, 0)} / {target} g
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden bg-[var(--color-surface-raised)]">
        <div
          className="h-full"
          style={{
            width: `${Math.min(100, ratio * 100)}%`,
            background: color,
            transition: "width var(--dur-long) var(--ease-out)",
          }}
        />
      </div>
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

  /**
   * Boş öğün ekranın en ölü ânı — ve arkasında okunacak bir sayı olmadığı
   * için fotoğrafın tam da ait olduğu yer. Kart ikiye bölünmüyor: başlık da
   * davet de eylem de görselin ÜSTÜNDE, tek katman.
   *
   * Dolu öğünde fotoğraf YOK. Orada okunacak satırlar var ve bir listenin
   * arkasına görsel koymak yalnızca kontrastı düşürür.
   */
  if (items.length === 0) {
    return (
      <section className="card overflow-hidden">
        <Photo slug="empty-nutrition" ratio="21 / 9" scrim>
          <div className="flex size-full flex-col justify-between p-6 lg:p-8">
            <h2
              className="display on-photo-dark text-lg"
              style={{ color: "oklch(99% 0 0)" }}
            >
              {mealLabel(meal)}
            </h2>
            <div>
              <p
                className="on-photo-dark text-sm"
                style={{ color: "oklch(94% 0.01 115)" }}
              >
                Henüz bir şey yok.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-3"
                onClick={onAdd}
              >
                Besin ekle
              </button>
            </div>
          </div>
        </Photo>
      </section>
    );
  }

  return (
    <section className="card p-6 lg:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="display text-lg">{mealLabel(meal)}</h2>
          <span className="tnum text-sm text-[var(--color-ink-muted)]">
            {fmt(calories, 0)} kcal
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          Besin ekle
        </button>
      </div>

      <ul className="mt-5 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="reveal"
            style={{ ["--i" as string]: index }}
          >
            {/* Satırın tamamı düzenlemeyi açıyor. Ayrı bir kalem simgesi
                  koymak hem küçük bir hedef hem de öğrenilmesi gereken bir
                  şey olurdu; satıra dokunmak beklenen davranış. */}
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={`${item.food.name} kalemini düzenle`}
              className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
              style={{ transitionDuration: "var(--dur-micro)" }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{item.food.name}</span>
                <span className="tnum block text-2xs text-[var(--color-ink-faint)]">
                  {fmt(item.quantity_g, 0)} g · P{fmt(item.protein_g, 0)} K
                  {fmt(item.carbs_g, 0)} Y{fmt(item.fat_g, 0)}
                </span>
              </span>
              <span className="tnum shrink-0 text-sm">
                {fmt(item.calories, 0)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
    <Section bare>
      <ul className="grid gap-2 sm:grid-cols-3">
        {others.map((meal) => {
          const items = byMeal.get(meal) ?? [];
          const calories = items.reduce(
            (sum, item) => sum + num(item.calories),
            0,
          );
          return (
            <li key={meal}>
              <button
                type="button"
                onClick={() => onFocus(meal)}
                className="card flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                style={{ transitionDuration: "var(--dur-micro)" }}
              >
                <span className="text-sm">{mealLabel(meal)}</span>
                <span className="tnum text-xs text-[var(--color-ink-faint)]">
                  {items.length === 0 ? "—" : `${fmt(calories, 0)} kcal`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
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
    <Section bare>
      <button
        type="button"
        className="btn btn-quiet -ml-2.5"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Önerileri gizle" : "Kalan makrolara göre ne yesem?"}
      </button>

      {open && (
        <div className="reveal mt-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="label">Öneriler</p>
            <InfoTip label="Öneriler nasıl hesaplanıyor">
              Porsiyonlar kalan makro açığını dolduracak şekilde hesaplanıyor —
              tahmin değil, aritmetik. Besinler senin daha önce
              kaydettiklerinden seçiliyor.
            </InfoTip>
          </div>

          {suggestions.isLoading ? (
            <Loading />
          ) : suggestions.isError ? (
            <ErrorBox error={suggestions.error} />
          ) : suggestions.data?.reason ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {suggestions.data.reason}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(suggestions.data?.suggestions ?? []).map(
                (suggestion, index) => (
                  <li
                    key={index}
                    className="card reveal p-4"
                    style={{ ["--i" as string]: index }}
                  >
                    <ul className="space-y-1">
                      {suggestion.items.map((item) => (
                        <li
                          key={item.food_id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="tnum shrink-0 text-[var(--color-ink-muted)]">
                            {item.quantity_g} g
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="tnum mt-3 border-t border-[var(--color-border)] pt-2 text-2xs text-[var(--color-ink-faint)]">
                      {suggestion.total_calories} kcal · P
                      {suggestion.total_protein_g} K{suggestion.total_carbs_g} Y
                      {suggestion.total_fat_g}
                    </p>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
