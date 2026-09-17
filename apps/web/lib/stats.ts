/**
 * Panoların türettiği sayılar — ekrandan bağımsız, saf fonksiyonlar.
 *
 * Sunucu ham seansları, tartıları ve hacimleri veriyor; "bu hafta geçen
 * haftaya göre" gibi karşılaştırmalar burada. Ekranlarda satır içi
 * yazılsalar birim testi yazılamaz ve iki ekran aynı hesabı iki farklı
 * biçimde yapardı.
 */

import type {
  ConsistencyDay,
  HistorySession,
  MuscleVolumeRow,
  StrengthStandard,
  WeightPoint,
} from "@/lib/queries";

/** Haftanın pazartesisi, yerel saatle, 00:00. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (start.getDay() + 6) % 7; // pazartesi = 0
  start.setDate(start.getDate() - weekday);
  return start;
}

export interface WeekVolume {
  start: Date;
  /** Kilogram. Isınma setleri sunucuda zaten hariç. */
  volume: number;
  sessions: number;
  sets: number;
}

/**
 * Son `count` haftanın tonajı, eskiden yeniye. Seansı olmayan hafta sıfır
 * olarak duruyor — boş haftayı atlamak grafiği yalan söyletirdi.
 */
export function weeklyVolume(
  sessions: readonly HistorySession[],
  count: number,
  now: Date = new Date(),
): WeekVolume[] {
  const current = weekStart(now);
  const weeks: WeekVolume[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = new Date(current);
    start.setDate(start.getDate() - index * 7);
    weeks.push({ start, volume: 0, sessions: 0, sets: 0 });
  }

  for (const session of sessions) {
    if (session.completed_at === null) continue;
    const start = weekStart(new Date(session.started_at)).getTime();
    const week = weeks.find((w) => w.start.getTime() === start);
    if (!week) continue;
    week.volume += Number.parseFloat(session.volume_kg) || 0;
    week.sessions += 1;
    week.sets += session.total_sets;
  }
  return weeks;
}

/** Değişim yüzdesi; önceki değer sıfırsa anlamı yok. */
export function change(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Tonaj için okunur birim: 12 400 kg → "12,4 t", 850 kg → "850 kg". */
export function tonnage(kg: number): { value: string; unit: string } {
  if (kg >= 1000) {
    return {
      value: (kg / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }),
      unit: "t",
    };
  }
  return { value: Math.round(kg).toLocaleString("tr-TR"), unit: "kg" };
}

export interface WeightSummary {
  latest: number;
  /** Hareketli ortalamanın son değeri — tek tartının gürültüsü olmadan. */
  average: number | null;
  /** Ortalamanın `days` gün önceki değerine göre farkı. */
  delta: number | null;
  date: string;
}

export function weightSummary(points: readonly WeightPoint[], days = 30): WeightSummary | null {
  const last = points.at(-1);
  if (!last) return null;

  const value = (point: WeightPoint) =>
    Number.parseFloat(point.moving_average ?? point.weight_kg);

  const lastDate = new Date(`${last.date}T00:00:00`).getTime();
  const cutoff = lastDate - days * 86_400_000;
  const past = [...points].reverse().find(
    (point) => new Date(`${point.date}T00:00:00`).getTime() <= cutoff,
  );

  return {
    latest: Number.parseFloat(last.weight_kg),
    average: last.moving_average === null ? null : Number.parseFloat(last.moving_average),
    delta: past ? value(last) - value(past) : null,
    date: last.date,
  };
}

export interface MuscleBalance {
  /** Hedefe ulaşmış kas gruplarının oranı, 0-1. */
  onTarget: number;
  /** Hedefin en gerisindeki gruplar, en eksikten başlayarak. */
  lagging: MuscleVolumeRow[];
  /** Hedefin belirgin üstündekiler (toparlanma riski). */
  over: MuscleVolumeRow[];
  total: number;
}

export function muscleBalance(rows: readonly MuscleVolumeRow[]): MuscleBalance {
  const ratio = (row: MuscleVolumeRow) => row.sets / Math.max(row.target, 1);
  const reached = rows.filter((row) => ratio(row) >= 1).length;
  return {
    onTarget: rows.length > 0 ? reached / rows.length : 0,
    lagging: [...rows].filter((row) => ratio(row) < 1).sort((a, b) => ratio(a) - ratio(b)),
    over: rows.filter((row) => ratio(row) > 1.5),
    total: rows.length,
  };
}

/** "8 Eyl" */
export const shortDay = (date: Date): string =>
  date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

/* --- Tutarlılık ------------------------------------------------------------------ */

export interface ConsistencySummary {
  /** En az bir antrenman yapılan gün sayısı. */
  trainingDays: number;
  sessions: number;
  /**
   * Üst üste en az bir antrenman yapılan hafta sayısı, bugünden geriye.
   * Bu hafta henüz antrenman yoksa seri BOZULMUYOR — pazartesi sabahı
   * "seri: 0" yazmak, hafta daha bitmemişken cezalandırmak olurdu.
   */
  weekStreak: number;
  longestWeekStreak: number;
  /** Son 12 haftada haftalık ortalama antrenman. */
  perWeek: number;
}

export function consistencySummary(
  days: readonly ConsistencyDay[],
  now: Date = new Date(),
): ConsistencySummary {
  const active = days.filter((day) => day.sessions > 0);
  const weeks = new Set(
    active.map((day) => weekStart(new Date(`${day.date}T00:00:00`)).getTime()),
  );

  const step = (time: number, by: number) => {
    const date = new Date(time);
    date.setDate(date.getDate() + by * 7);
    return date.getTime();
  };

  const current = weekStart(now).getTime();
  let cursor = weeks.has(current) ? current : step(current, -1);
  let weekStreak = 0;
  while (weeks.has(cursor)) {
    weekStreak += 1;
    cursor = step(cursor, -1);
  }

  let longestWeekStreak = 0;
  for (const week of weeks) {
    if (weeks.has(step(week, -1))) continue; // serinin başı değil
    let length = 0;
    let at = week;
    while (weeks.has(at)) {
      length += 1;
      at = step(at, 1);
    }
    longestWeekStreak = Math.max(longestWeekStreak, length);
  }

  const since = step(current, -11);
  const recent = active
    .filter((day) => new Date(`${day.date}T00:00:00`).getTime() >= since)
    .reduce((sum, day) => sum + day.sessions, 0);

  return {
    trainingDays: active.length,
    sessions: active.reduce((sum, day) => sum + day.sessions, 0),
    weekStreak,
    longestWeekStreak,
    perWeek: recent / 12,
  };
}

/* --- Güç seviyesi ------------------------------------------------------------------ */

/** Sunucudaki `StrengthLevel` sırası. Etiketler de sunucudakiyle aynı. */
export const STRENGTH_LEVELS = [
  { key: "untrained", label: "Başlangıç" },
  { key: "novice", label: "Acemi" },
  { key: "intermediate", label: "Orta" },
  { key: "advanced", label: "İleri" },
  { key: "elite", label: "Elit" },
] as const;

export const levelIndex = (level: string): number =>
  Math.max(
    0,
    STRENGTH_LEVELS.findIndex((entry) => entry.key === level),
  );

export interface StrengthSummary {
  /**
   * Ortanca seviye. Ortalama değil: seviyeler sıralı ama aralıklı değil;
   * "Acemi ile İleri'nin ortalaması Orta" demenin anlamı yok. Tek bir
   * hareketteki uç değer de ortancayı oynatmıyor.
   */
  level: (typeof STRENGTH_LEVELS)[number] | null;
  /** Vücut ağırlığına oranı en yüksek hareket. */
  strongest: StrengthStandard | null;
  /** Bir sonraki seviyeye en yakın hareket. */
  closest: StrengthStandard | null;
}

export function strengthSummary(results: readonly StrengthStandard[]): StrengthSummary {
  if (results.length === 0) return { level: null, strongest: null, closest: null };
  const sorted = results.map((row) => levelIndex(row.level)).sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!;
  const ratio = (row: StrengthStandard) => Number.parseFloat(row.bodyweight_ratio) || 0;
  const strongest = results.reduce((best, row) => (ratio(row) > ratio(best) ? row : best));
  const climbing = results.filter((row) => row.next_level !== null);
  const closest =
    climbing.length > 0
      ? climbing.reduce((best, row) => (row.progress_to_next > best.progress_to_next ? row : best))
      : null;
  return { level: STRENGTH_LEVELS[median]!, strongest, closest };
}
