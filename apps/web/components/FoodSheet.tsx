"use client";

/**
 * Besin ekleme / düzenleme paneli — "kontrol ve teyit" adımı.
 *
 * --------------------------------------------------------------------------
 * NEDEN ÜÇ AŞAMA
 * --------------------------------------------------------------------------
 * Önceki sürümde arama alanı, sonuç listesi ve miktar formu aynı anda
 * ekrandaydı. Antrenman akışında çözülen sorunun aynısı: yapılacak iş her an
 * TEK ama ekran üçünü birden gösteriyor.
 *
 *   ara → seç → teyit et
 *
 * Aşamalar arasında geri dönüş var; "yanlış besini seçtim" durumu tek
 * dokunuşla düzeliyor.
 *
 * --------------------------------------------------------------------------
 * TEYİT AŞAMASI NEYİ GÖSTERİYOR
 * --------------------------------------------------------------------------
 * Miktarı yazarken makrolar CANLI hesaplanıyor. Bu sadece süs değil: besin
 * takibinde en sık yapılan hata yanlış porsiyon girmek ve kullanıcı hatayı
 * ancak kaydettikten sonra fark ediyor. Sayılar girdiyle birlikte değişince
 * "180 gram çok fazlaymış" kararı kaydetmeden önce veriliyor.
 *
 * Hedef varsa bir satır daha var: "ekledikten sonra kalan". Karar bu sayıya
 * bakılarak veriliyor — kaç kalori yediğine değil, ne kadar hakkın kaldığına.
 *
 * --------------------------------------------------------------------------
 * DÜZENLEME AYNI PANEL
 * --------------------------------------------------------------------------
 * Kayıtlı bir kalemi düzeltmek için ayrı bir ekran yok; panel `edit` kipinde
 * doğrudan teyit aşamasında açılıyor. Aynı yerleşim, aynı önizleme. Kullanıcı
 * iki farklı arayüz öğrenmiyor.
 */

import { useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, fmt } from "@/components/States";
import { MEAL_ORDER, mealLabel } from "@/lib/meals";
import {
  useAddFoodLog,
  useBarcodeLookup,
  useDeleteFoodLog,
  useFoodSearch,
  useRecentFoods,
  useUpdateFoodLog,
  type FoodLogRow,
  type FoodRow,
} from "@/lib/queries";

/** Porsiyon hazır değerleri. Elle yazmak her zaman açık; bunlar kısayol. */
const PRESETS = [50, 100, 150, 200, 250] as const;

export type SheetMode =
  | { kind: "add"; meal: string }
  | { kind: "edit"; log: FoodLogRow };

interface Props {
  mode: SheetMode;
  /** `null` = bugün. Geçmiş bir güne kayıt açıkça o güne yazılıyor. */
  date: string | null;
  /** Hedefe göre kalan kalori — teyit satırı için. Yoksa satır çıkmıyor. */
  remainingCalories: number | null;
  onClose: () => void;
}

const num = (value: string): number => Number.parseFloat(value.replace(",", ".")) || 0;

export function FoodSheet({ mode, date, remainingCalories, onClose }: Props) {
  const editing = mode.kind === "edit" ? mode.log : null;

  const [stage, setStage] = useState<"search" | "results" | "confirm">(
    editing ? "confirm" : "search",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodRow[] | null>(null);
  const [food, setFood] = useState<FoodRow | null>(editing?.food ?? null);
  const [grams, setGrams] = useState(editing ? String(num(editing.quantity_g)) : "100");
  const [meal, setMeal] = useState(editing?.meal_type ?? (mode.kind === "add" ? mode.meal : "snack"));
  const [scanning, setScanning] = useState(false);

  const recent = useRecentFoods();
  const search = useFoodSearch();
  const barcode = useBarcodeLookup();
  const add = useAddFoodLog();
  const update = useUpdateFoodLog();
  const remove = useDeleteFoodLog();

  /** Besini seç ve teyit aşamasına geç. Miktar önceden dolu geliyor. */
  const pick = (next: FoodRow, quantity = 100, forMeal?: string) => {
    setFood(next);
    setGrams(String(quantity));
    if (forMeal) setMeal(forMeal);
    setStage("confirm");
  };

  const busy = add.isPending || update.isPending || remove.isPending;
  const error = add.error ?? update.error ?? remove.error;

  const submit = async () => {
    const quantity = num(grams);
    if (quantity <= 0 || !food) return;
    if (editing) {
      await update.mutateAsync({ id: editing.id, quantity_g: quantity, meal_type: meal });
    } else {
      await add.mutateAsync({
        food_database_entry_id: food.id,
        quantity_g: quantity,
        meal_type: meal,
        ...(date ? { date } : {}),
      });
    }
    onClose();
  };

  const title =
    stage === "confirm"
      ? editing
        ? "Kalemi düzenle"
        : "Miktarı onayla"
      : "Besin ekle";

  return (
    <Sheet
      title={title}
      onClose={onClose}
      width={stage === "confirm" ? "26rem" : "32rem"}
      footer={
        stage === "confirm" && food ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1 py-3"
              disabled={busy || num(grams) <= 0}
              onClick={() => void submit()}
            >
              {busy ? "Kaydediliyor…" : editing ? "Kaydet" : "Öğüne ekle"}
            </button>
            {editing ? (
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={async () => {
                  await remove.mutateAsync(editing.id);
                  onClose();
                }}
              >
                Sil
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setStage("search")}>
                Geri
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {error && <ErrorBox error={error} />}

      {stage === "confirm" && food ? (
        <Confirm
          food={food}
          grams={grams}
          meal={meal}
          remainingCalories={remainingCalories}
          previousCalories={editing ? num(editing.calories) : 0}
          verb={editing ? "Kaydettikten" : "Ekledikten"}
          onGrams={setGrams}
          onMeal={setMeal}
        />
      ) : (
        <Find
          query={query}
          results={results}
          recent={recent.data ?? []}
          scanning={scanning}
          searchPending={search.isPending}
          barcodePending={barcode.isPending}
          searchError={search.error ?? barcode.error}
          onQuery={setQuery}
          onScan={() => setScanning(true)}
          onScanClose={() => setScanning(false)}
          onSearch={async () => {
            if (query.trim().length < 2) return;
            const found = await search.mutateAsync(query.trim());
            setResults(found);
            setStage("results");
          }}
          onBarcode={async (code) => {
            setScanning(false);
            // Barkod tek ürüne çözülüyor: liste aşaması atlanıyor.
            pick(await barcode.mutateAsync(code));
          }}
          onPick={pick}
        />
      )}
    </Sheet>
  );
}

/* --- Ara / seç ------------------------------------------------------------ */

function Find({
  query,
  results,
  recent,
  scanning,
  searchPending,
  barcodePending,
  searchError,
  onQuery,
  onScan,
  onScanClose,
  onSearch,
  onBarcode,
  onPick,
}: {
  query: string;
  results: FoodRow[] | null;
  recent: Array<{
    food: FoodRow;
    times_logged: number;
    last_quantity_g: string;
    last_meal_type: string;
  }>;
  scanning: boolean;
  searchPending: boolean;
  barcodePending: boolean;
  searchError: Error | null;
  onQuery: (value: string) => void;
  onScan: () => void;
  onScanClose: () => void;
  onSearch: () => void;
  onBarcode: (code: string) => void;
  onPick: (food: FoodRow, quantity?: number, meal?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="chicken breast"
          aria-label="Besin ara"
          autoFocus
          className="field h-11 min-w-0 flex-1 px-3 text-sm"
        />
        <button type="submit" className="btn btn-ghost shrink-0" disabled={searchPending}>
          {searchPending ? "…" : "Ara"}
        </button>
        <button
          type="button"
          onClick={onScan}
          aria-label="Barkod oku"
          className="field grid size-11 shrink-0 place-items-center text-[var(--color-ink-faint)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M4 5v14M8 5v14M12 5v14M16 5v10M20 5v14" />
          </svg>
        </button>
      </form>

      <p className="text-2xs text-[var(--color-ink-faint)]">
        Kaynak USDA ve Open Food Facts — İngilizce ad daha iyi sonuç verir.
      </p>

      {scanning && <BarcodeScanner onClose={onScanClose} onDetected={onBarcode} />}
      {barcodePending && (
        <p className="text-xs text-[var(--color-ink-faint)]">Barkod aranıyor…</p>
      )}
      {searchError && <ErrorBox error={searchError} />}

      {results !== null ? (
        results.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Sonuç yok. Daha genel bir ad dene — &ldquo;yogurt&rdquo; yerine
            &ldquo;milk&rdquo; gibi.
          </p>
        ) : (
          <FoodList
            label="Sonuçlar"
            rows={results.map((food) => ({ food }))}
            onPick={(food) => onPick(food)}
          />
        )
      ) : recent.length > 0 ? (
        <FoodList
          label="Sık kullandıkların"
          rows={recent}
          onPick={(food, quantity, meal) => onPick(food, quantity, meal)}
        />
      ) : null}
    </div>
  );
}

function FoodList({
  label,
  rows,
  onPick,
}: {
  label: string;
  rows: Array<{
    food: FoodRow;
    times_logged?: number;
    last_quantity_g?: string;
    last_meal_type?: string;
  }>;
  onPick: (food: FoodRow, quantity?: number, meal?: string) => void;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <ul className="mt-2 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {rows.map((row, index) => {
          const repeat = row.last_quantity_g !== undefined;
          return (
            <li key={row.food.id} className="reveal" style={{ ["--i" as string]: index }}>
              <button
                type="button"
                onClick={() =>
                  onPick(
                    row.food,
                    repeat ? Number.parseFloat(row.last_quantity_g!) : undefined,
                    row.last_meal_type,
                  )
                }
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                style={{ transitionDuration: "var(--dur-micro)" }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{row.food.name}</span>
                  <span className="tnum block truncate text-2xs text-[var(--color-ink-faint)]">
                    {row.food.brand ? `${row.food.brand} · ` : ""}
                    {fmt(row.food.calories_per_100g, 0)} kcal/100g
                    {/* Tekrar için: geçen sefer ne kadar ve hangi öğün. Bu iki
                        bilgi olmadan "sık kullanılan" listesi yine miktar
                        girmeyi gerektiriyordu. */}
                    {repeat &&
                      ` · geçen sefer ${fmt(row.last_quantity_g, 0)} g, ${mealLabel(row.last_meal_type ?? "")}`}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-[var(--color-ink-faint)]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --- Teyit ---------------------------------------------------------------- */

function Confirm({
  food,
  grams,
  meal,
  remainingCalories,
  previousCalories,
  verb,
  onGrams,
  onMeal,
}: {
  food: FoodRow;
  grams: string;
  meal: string;
  remainingCalories: number | null;
  /** Düzenleme kipinde eski değer; "kalan" hesabı ondan arındırılıyor —
   *  yoksa aynı miktarı kaydetmek kalan kaloriyi bir kez daha düşürüyor. */
  previousCalories: number;
  verb: string;
  onGrams: (value: string) => void;
  onMeal: (value: string) => void;
}) {
  const quantity = num(grams);
  const scale = quantity / 100;
  const kcal = num(food.calories_per_100g) * scale;
  const protein = num(food.protein_g) * scale;
  const carbs = num(food.carbs_g) * scale;
  const fat = num(food.fat_g) * scale;

  const after =
    remainingCalories === null ? null : remainingCalories + previousCalories - kcal;

  const step = (delta: number) => onGrams(String(Math.max(1, Math.round(quantity + delta))));

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="min-w-0">
        <h3 className="display text-lg">{food.name}</h3>
        {food.brand && (
          <p className="mt-0.5 truncate text-xs text-[var(--color-ink-faint)]">{food.brand}</p>
        )}
      </div>

      {/* Miktar ekranın merkezinde ve büyük — panelin tek işi bu sayı.
          Birim yazısı `<label>` DIŞINDA: içine konduğunda erişilebilir ad
          "Gram gram" oluyordu, çünkü etiketin bütün metni ada katılıyor. */}
      <div className="flex items-center gap-3">
        <Stepper label="10 gram azalt" onClick={() => step(-10)} glyph="−" />
        <div className="flex flex-col items-center">
          <input
            aria-label="Miktar"
            inputMode="decimal"
            value={grams}
            autoFocus
            onChange={(event) => onGrams(event.target.value)}
            // Alan DOLU geliyor; odakta içeriği seçmek ilk tuş vuruşunun
            // rakam eklemek yerine değiştirmesini sağlıyor.
            onFocus={(event) => event.currentTarget.select()}
            className="field figure h-[4.5rem] w-[7.5rem] text-center text-2xl"
          />
          <span aria-hidden className="label mt-1.5">
            gram
          </span>
        </div>
        <Stepper label="10 gram arttır" onClick={() => step(10)} glyph="+" />
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={quantity === preset}
            onClick={() => onGrams(String(preset))}
            className="seg-item tnum rounded-full border border-[var(--color-border)] px-3 py-1 text-xs"
          >
            {preset} g
          </button>
        ))}
      </div>

      {/* Canlı önizleme: miktar değişince bu satır değişiyor. */}
      <div
        key={`${Math.round(kcal)}-${Math.round(protein)}`}
        className="animate-tick grid w-full grid-cols-4 gap-px overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-border)]"
      >
        <Cell label="kcal" value={kcal} strong />
        <Cell label="protein" value={protein} unit="g" />
        <Cell label="karb." value={carbs} unit="g" />
        <Cell label="yağ" value={fat} unit="g" />
      </div>

      <div className="w-full">
        <p className="label mb-2">Öğün</p>
        <div className="seg w-full" role="group" aria-label="Öğün">
          {MEAL_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={meal === option}
              onClick={() => onMeal(option)}
              className="seg-item flex-1 text-xs"
            >
              {mealLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {after !== null && (
        <p className="tnum text-xs text-[var(--color-ink-muted)]">
          {verb} sonra kalan{" "}
          <span
            className="font-semibold"
            style={{
              color: after < 0 ? "var(--color-warning)" : "var(--color-accent-deep)",
            }}
          >
            {fmt(Math.abs(after), 0)} kcal
          </span>
          {after < 0 && " fazla"}
        </p>
      )}
    </div>
  );
}

function Stepper({
  label,
  glyph,
  onClick,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-[var(--color-border-strong)] text-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      {glyph}
    </button>
  );
}

function Cell({
  label,
  value,
  unit = "",
  strong,
}: {
  label: string;
  value: number;
  unit?: string;
  strong?: boolean;
}) {
  return (
    <div className="bg-[var(--color-surface)] px-2 py-2.5">
      <p
        className={`tnum ${strong ? "text-md font-semibold" : "text-sm"}`}
        style={{ color: strong ? "var(--color-ink)" : "var(--color-ink-muted)" }}
      >
        {fmt(value, 0)}
        {unit}
      </p>
      <p className="text-2xs text-[var(--color-ink-faint)]">{label}</p>
    </div>
  );
}
