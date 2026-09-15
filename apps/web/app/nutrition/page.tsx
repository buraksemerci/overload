"use client";

/** Beslenme (Bölüm 8, ekran 9): günlük log, TDEE hedefi, kalan makrolar. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { PageHeader } from "@/components/Layout";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { api } from "@/lib/api";
import { keys, useMealSuggestions, useNutritionDay } from "@/lib/queries";

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
  const suggestions = useMealSuggestions(goal);
  const client = useQueryClient();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[] | null>(null);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [meal, setMeal] = useState("snack");

  const [scanning, setScanning] = useState(false);

  const search = useMutation({
    mutationFn: (q: string) =>
      api.get<FoodResult[]>(`/foods/search?q=${encodeURIComponent(q)}`),
    onSuccess: setResults,
  });

  const barcode = useMutation({
    mutationFn: (code: string) =>
      api.get<FoodResult>(`/foods/barcode/${encodeURIComponent(code)}`),
    // Barkod tek bir ürüne çözülüyor; arama listesi yerine doğrudan
    // miktar girişine geçmek bir adım kısaltıyor.
    onSuccess: (food) => {
      setResults(null);
      setSelected(food);
    },
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
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Beslenme"
        info={
          <>
            Değerler USDA FoodData Central ve Open Food Facts&apos;ten geliyor;
            kalori ve makro <strong>tahmin edilmiyor</strong>, gerçek veriden
            okunuyor. Makrolar 100 gram başına normalize ediliyor çünkü iki
            kaynağın porsiyon tanımları tutarsız.
          </>
        }
      />

      {/* --- Hedef ve kalan --- */}
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base">Bugün</h2>
          <div className="seg" role="group" aria-label="Hedef">
            {GOALS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={goal === option.value}
                onClick={() => setGoal(option.value)}
                className="seg-item text-xs"
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
      <section className="card p-6">
        <h2 className="text-base">Besin ekle</h2>
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
            aria-label="Besin ara"
            className="h-11 min-w-0 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-ground)] px-3 text-sm outline-none"
          />
          <button type="submit" className="btn btn-ghost shrink-0" disabled={search.isPending}>
            {search.isPending ? "…" : "Ara"}
          </button>
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label="Barkod oku"
            className="grid size-11 shrink-0 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-[var(--color-ink-muted)]"
          >
            ▥
          </button>
        </form>

        {scanning && (
          <div className="mt-3">
            <BarcodeScanner
              onClose={() => setScanning(false)}
              onDetected={(code) => {
                setScanning(false);
                barcode.mutate(code);
              }}
            />
          </div>
        )}

        {barcode.isPending && (
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">Barkod aranıyor…</p>
        )}
        {barcode.isError && <ErrorBox error={barcode.error} />}
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

      {/* --- Öğün önerisi --- */}
      <section className="card p-6">
        <h2 className="text-base">Kalan makrolara göre öneri</h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          Porsiyonlar kalan makro açığını dolduracak şekilde hesaplanıyor —
          tahmin değil, aritmetik.
        </p>

        {suggestions.isLoading ? (
          <Loading />
        ) : suggestions.isError ? (
          <ErrorBox error={suggestions.error} />
        ) : suggestions.data?.reason ? (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            {suggestions.data.reason}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(suggestions.data?.suggestions ?? []).map((suggestion, index) => (
              <li
                key={index}
                className="rounded-[3px] border border-[var(--color-border)] p-3"
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
                <p className="tnum mt-2 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-ink-faint)]">
                  {suggestion.total_calories} kcal · P{suggestion.total_protein_g} K
                  {suggestion.total_carbs_g} Y{suggestion.total_fat_g}
                  <span className="ml-2">
                    uyum %{Math.round(suggestion.fit_score * 100)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Günün kalemleri --- */}
      <section className="card p-6">
        <h2 className="text-base">Günlük kayıt</h2>
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
        ? "var(--color-accent-deep)"
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
