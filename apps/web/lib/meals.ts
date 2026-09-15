/**
 * Öğün etiketleri ve "şu an hangi öğün" kararı.
 *
 * --------------------------------------------------------------------------
 * NEDEN SAATE BAKIYORUZ
 * --------------------------------------------------------------------------
 * Beslenme ekranı önceden dört öğünü birden gösteriyordu. Ama sabah 8'de
 * akşam yemeği satırının ekranda olmasının kullanıcıya hiçbir faydası yok;
 * o an yapılacak iş kahvaltıyı kaydetmek. Ekran saate bakıp o öğünü öne
 * alıyor, diğerleri bir dokunuş uzakta duruyor.
 *
 * Eşikler Türkiye'deki tipik yeme saatlerine göre seçildi ve KASITLI olarak
 * geniş: 16:00'da ara öğün varsayılan olmalı ama 16:00'da akşam yemeği
 * kaydeden birinin de öğünü elle değiştirebilmesi gerekiyor — bu yüzden
 * seçim kilitli değil, sadece önceden dolu.
 */

export const MEAL_ORDER = ["breakfast", "lunch", "snack", "dinner"] as const;

export type MealType = (typeof MEAL_ORDER)[number];

export const MEAL_LABEL: Record<string, string> = {
  breakfast: "Kahvaltı",
  lunch: "Öğle",
  dinner: "Akşam",
  snack: "Ara öğün",
};

export function mealLabel(meal: string): string {
  return MEAL_LABEL[meal] ?? meal;
}

/** Öğünün başladığı saat (dahil). Bir sonraki eşiğe kadar geçerli. */
const STARTS: ReadonlyArray<readonly [number, MealType]> = [
  [0, "breakfast"],
  [11, "lunch"],
  [15, "snack"],
  [18, "dinner"],
];

/**
 * Verilen saatte varsayılan öğün.
 *
 * Gece yarısından 11'e kadar kahvaltı: 02:00'de bir şey kaydeden kişi büyük
 * olasılıkla dünün gecesini yaşıyor, ama tarih zaten yeni güne geçtiği için
 * o kaydı "akşam yemeği" saymak günün ilk öğününü akşam göstermek olurdu.
 */
export function mealForHour(hour: number): MealType {
  let current: MealType = "breakfast";
  for (const [start, meal] of STARTS) {
    if (hour >= start) current = meal;
  }
  return current;
}

export function currentMeal(now: Date = new Date()): MealType {
  return mealForHour(now.getHours());
}

/** `YYYY-MM-DD` — yerel saate göre. `toISOString()` UTC'ye kaydırıyor ve
 *  Türkiye'de gece yarısından önceki kayıtları bir sonraki güne yazıyordu. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `null` = bugün; sorgu anahtarı ve API parametresi bunu böyle bekliyor. */
export function shiftDay(date: string | null, days: number, today: Date = new Date()): string | null {
  const base = date ? new Date(`${date}T12:00:00`) : today;
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  const iso = isoDate(next);
  return iso === isoDate(today) ? null : iso;
}

/** "Bugün" / "Dün" / "13 Eyl Cum" — gezinme başlığı. */
export function dayLabel(date: string | null, today: Date = new Date()): string {
  if (date === null) return "Bugün";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === isoDate(yesterday)) return "Dün";
  return new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

/** Gelecek günün beslenmesi kaydedilemez — ileri düğmesi orada durmalı. */
export function isToday(date: string | null): boolean {
  return date === null;
}
