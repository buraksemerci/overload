"use client";

/** Beslenme (Bölüm 8, ekran 9): günlük log, TDEE hedefi, kalan makrolar. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { api } from "@/lib/api";
import { keys, useNutritionDay } from "@/lib/queries";

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Kahvaltı",
  lunch: "Öğle",
  dinner: "Akşam",
  snack: "Ara öğün",
};

const GOALS = [
  { value: "cut", label: "Yağ kaybı" },
  { value: "maintain", label: "Koruma" },
  { value: "bulk", label: "Kas kazanımı" },
] as const;

interface FoodResult {
  id: string;
  name: string;
  brand: string | null;
  calories_per_100g: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

export default function NutritionPage() {
  const [goal, setGoal] = useState<string>("maintain");
  const day = useNutritionDay(null, goal);
  const client = useQueryClient();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[] | null>(null);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [meal, setMeal] = useState("snack");

  const search = useMutation({
    mutationFn: (q: string) =>
      api.get<FoodResult[]>(`/foods/search?q=${encodeURIComponent(q)}`),
    onSuccess: setResults,
  });

  const addItem = useMutation({
    mutationFn: (body: { food_database_entry_id: string; quantity_g: number; meal_type: string }) =>
      api.post("/nutrition/log", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.nutrition });
      setSelected(null);
      setResults(null);
      setQuery("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/nutrition/log/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.nutrition });
    },
  });

  if (day.isLoading) return <Loading />;
  if (day.isError) return <ErrorBox error={day.error} onRetry={() => void day.refetch()} />;

  const data = day.data!;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Beslenme</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Değerler USDA ve Open Food Facts&apos;ten geliyor — kalori/makro tahmini
          yapılmıyor, gerçek veriden okunuyor.
        </p>
      </header>

      {/* --- Hedef ve kalan --- */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Bugün</h2>
          <div className="flex gap-1">
            {GOALS.map((option) => (
              <button
                key={option.value}
                onClick={() => setGoal(option.value)}
                className={`rounded-[3px] px-2 py-1 text-2xs ${
                  goal === option.value
                    ? "bg-[var(--color-accent)] text-white"
                    : "border border-[var(--color-border-strong)] text-[var(--color-ink-muted)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {data.target ? (
          <>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <MacroCell
                label="kcal"
                current={data.totals.calories}
                target={data.target.calories}
              />
              <MacroCell
                label="Protein"
                current={data.totals.protein_g}
                target={data.target.protein_g}
                unit="g"
              />
              <MacroCell
                label="Karb."
                current={data.totals.carbs_g}
                target={data.target.carbs_g}
                unit="g"
              />
              <MacroCell
                label="Yağ"
                current={data.totals.fat_g}
                target={data.target.fat_g}
                unit="g"
              />
            </div>
            {data.target.floor_applied && (
              <p className="mt-3 text-xs" style={{ color: "var(--color-warning)" }}>
                Hesaplanan hedef 1200 kcal&apos;in altına düştü; güvenlik tabanı
                uygulandı. Bu kadar düşük bir açık kas kaybı riski taşır.
              </p>
            )}
          </>
        ) : (
          <div className="mt-4">
            <Empty
              title="Kalori hedefi hesaplanamıyor"
              hint="Boy, doğum tarihi, cinsiyet ve en az bir kilo kaydı gerekiyor."
              action={
                <div className="flex justify-center gap-2">
                  <Link href="/account" className="btn btn-primary">
                    Profili tamamla
                  </Link>
                  <Link href="/weight" className="btn btn-ghost">
                    Kilo gir
                  </Link>
                </div>
              }
            />
          </div>
        )}
      </section>

      {/* --- Besin ekle --- */}
      <section className="card p-4">
        <h2 className="text-base font-medium">Besin ekle</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          İngilizce ad daha iyi sonuç verir (ör. &ldquo;chicken breast&rdquo;). Fotoğrafla
          eklemek için <Link href="/chat" className="underline">asistanı</Link> kullan.
        </p>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 2) search.mutate(query.trim());
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="chicken breast"
            className="h-11 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
          />
          <button type="submit" className="btn btn-ghost" disabled={search.isPending}>
            {search.isPending ? "…" : "Ara"}
          </button>
        </form>

        {search.isError && <ErrorBox error={search.error} />}

        {results !== null && results.length === 0 && (
          <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
            Sonuç yok. Daha genel bir ad dene.
          </p>
        )}

        {results && results.length > 0 && !selected && (
          <ul className="mt-3 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
            {results.map((food) => (
              <li key={food.id}>
                <button
                  onClick={() => setSelected(food)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{food.name}</span>
                    {food.brand && (
                      <span className="block truncate text-2xs text-[var(--color-ink-faint)]">
                        {food.brand}
                      </span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-xs text-[var(--color-ink-muted)]">
                    {fmt(food.calories_per_100g, 0)} kcal/100g
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="mt-3 rounded-[3px] border border-[var(--color-accent)]/40 p-3">
            <p className="text-sm">{selected.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="flex-1">
                <span className="sr-only">Gram</span>
                <input
                  inputMode="decimal"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  className="tnum h-11 w-full rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-center text-sm outline-none"
                />
              </label>
              <select
                value={meal}
                onChange={(e) => setMeal(e.target.value)}
                className="h-11 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-2 text-sm outline-none"
              >
                {Object.entries(MEAL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <p className="tnum mt-2 text-xs text-[var(--color-ink-muted)]">
              ≈{" "}
              {fmt(
                (Number.parseFloat(selected.calories_per_100g) *
                  (Number.parseFloat(grams.replace(",", ".")) || 0)) /
                  100,
                0,
              )}{" "}
              kcal
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className="btn btn-primary"
                disabled={addItem.isPending}
                onClick={() =>
                  addItem.mutate({
                    food_database_entry_id: selected.id,
                    quantity_g: Number.parseFloat(grams.replace(",", ".")) || 0,
                    meal_type: meal,
                  })
                }
              >
                Ekle
              </button>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>
                Vazgeç
              </button>
            </div>
            {addItem.isError && <ErrorBox error={addItem.error} />}
          </div>
        )}
      </section>

      {/* --- Günün kalemleri --- */}
      <section className="card p-4">
        <h2 className="text-base font-medium">Günlük kayıt</h2>
        {data.items.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
            Bugün henüz bir şey kaydetmedin.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
            {data.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.food.name}</p>
                  <p className="tnum text-2xs text-[var(--color-ink-faint)]">
                    {MEAL_LABEL[item.meal_type]} · {fmt(item.quantity_g, 0)} g ·{" "}
                    P{fmt(item.protein_g, 0)} K{fmt(item.carbs_g, 0)} Y{fmt(item.fat_g, 0)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tnum text-sm">{fmt(item.calories, 0)}</span>
                  <button
                    onClick={() => remove.mutate(item.id)}
                    aria-label="Sil"
                    className="text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-danger)]"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MacroCell({
  label,
  current,
  target,
  unit = "",
}: {
  label: string;
  current: string;
  target: number;
  unit?: string;
}) {
  const value = Number.parseFloat(current) || 0;
  const ratio = target > 0 ? value / target : 0;
  // Hedefin üstü uyarı değil bilgi; kırmızı sadece gerçek hatalar için (Bölüm 7).
  const color =
    ratio > 1.1
      ? "var(--color-warning)"
      : ratio >= 0.9
        ? "var(--color-success)"
        : "var(--color-ink)";

  return (
    <div>
      <p className="text-2xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="tnum mt-0.5 text-sm font-semibold" style={{ color }}>
        {fmt(value, 0)}
      </p>
      <p className="tnum text-2xs text-[var(--color-ink-faint)]">
        / {target}
        {unit}
      </p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, background: color }}
        />
      </div>
    </div>
  );
}
