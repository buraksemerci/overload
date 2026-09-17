import { describe, expect, it } from "vitest";
import type { ConsistencyDay, HistorySession, MuscleVolumeRow, StrengthStandard, WeightPoint } from "./queries";
import {
  change,
  consistencySummary,
  muscleBalance,
  rateBand,
  rateVerdict,
  strengthSummary,
  tonnage,
  weekStart,
  weeklyAverages,
  weeklyRate,
  weeklyVolume,
  weightSummary,
} from "./stats";

const session = (startedAt: string, volume: number, completed = true): HistorySession => ({
  id: startedAt,
  day_label: null,
  program_name: null,
  started_at: startedAt,
  completed_at: completed ? startedAt : null,
  notes: null,
  is_deload: false,
  duration_min: null,
  total_sets: 10,
  volume_kg: String(volume),
  exercises: [],
  records: [],
});

describe("weekStart", () => {
  it("pazartesiye iniyor", () => {
    // 17 Eylül 2026 Perşembe.
    const start = weekStart(new Date(2026, 8, 17, 21, 30));
    expect(start.getDate()).toBe(14);
    expect(start.getHours()).toBe(0);
  });

  it("pazar günü önceki pazartesiye", () => {
    expect(weekStart(new Date(2026, 8, 20)).getDate()).toBe(14);
  });
});

describe("weeklyVolume", () => {
  const now = new Date(2026, 8, 17, 12);

  it("boş haftaları sıfır olarak tutuyor", () => {
    const weeks = weeklyVolume([session("2026-09-15T10:00:00", 5000)], 4, now);
    expect(weeks.map((w) => w.volume)).toEqual([0, 0, 0, 5000]);
  });

  it("tamamlanmamış seansı saymıyor", () => {
    const weeks = weeklyVolume(
      [session("2026-09-15T10:00:00", 5000), session("2026-09-16T10:00:00", 3000, false)],
      1,
      now,
    );
    expect(weeks[0]!.volume).toBe(5000);
    expect(weeks[0]!.sessions).toBe(1);
  });

  it("aralık dışını atlıyor", () => {
    const weeks = weeklyVolume([session("2026-06-01T10:00:00", 9000)], 4, now);
    expect(weeks.every((w) => w.volume === 0)).toBe(true);
  });
});

describe("change ve tonnage", () => {
  it("önceki sıfırsa yüzde yok", () => {
    expect(change(100, 0)).toBeNull();
    expect(change(110, 100)).toBeCloseTo(10);
  });

  it("tonu virgülle yazıyor", () => {
    expect(tonnage(12_400)).toEqual({ value: "12,4", unit: "t" });
    expect(tonnage(850)).toEqual({ value: "850", unit: "kg" });
  });
});

describe("weightSummary", () => {
  const point = (date: string, weight: string, average: string | null): WeightPoint => ({
    date,
    weight_kg: weight,
    moving_average: average,
  });

  it("ortalama üzerinden farkı veriyor", () => {
    const summary = weightSummary(
      [point("2026-08-01", "82.0", "82.2"), point("2026-09-10", "80.4", "80.9")],
      30,
    );
    expect(summary?.latest).toBe(80.4);
    expect(summary?.delta).toBeCloseTo(-1.3);
  });

  it("yeterince eski kayıt yoksa fark yok", () => {
    expect(weightSummary([point("2026-09-10", "80", null)])?.delta).toBeNull();
    expect(weightSummary([])).toBeNull();
  });
});

describe("muscleBalance", () => {
  const row = (slug: string, sets: number, target = 12): MuscleVolumeRow => ({
    slug,
    name_tr: slug,
    svg_id: `m-${slug}`,
    region: "front",
    sets,
    target,
  });

  it("en eksikten başlayarak sıralıyor", () => {
    const balance = muscleBalance([row("a", 10), row("b", 2), row("c", 14), row("d", 20)]);
    expect(balance.lagging.map((r) => r.slug)).toEqual(["b", "a"]);
    expect(balance.onTarget).toBe(0.5);
    expect(balance.over.map((r) => r.slug)).toEqual(["d"]);
  });
});

describe("consistencySummary", () => {
  const day = (date: string, sessions = 1): ConsistencyDay => ({
    date,
    sessions,
    total_volume_kg: "1000",
  });
  // 17 Eylül 2026 Perşembe; hafta 14 Eylül pazartesi başlıyor.
  const now = new Date(2026, 8, 17, 12);

  it("bu hafta boşsa seri geçen haftadan sayılıyor", () => {
    const summary = consistencySummary(
      [day("2026-08-31"), day("2026-09-02"), day("2026-09-08"), day("2026-09-10", 0)],
      now,
    );
    expect(summary.weekStreak).toBe(2);
    expect(summary.trainingDays).toBe(3);
    expect(summary.sessions).toBe(3);
  });

  it("bu hafta antrenman varsa seriye giriyor", () => {
    const summary = consistencySummary([day("2026-09-08"), day("2026-09-15")], now);
    expect(summary.weekStreak).toBe(2);
  });

  it("boşluk seriyi kırıyor ama en uzun seri kalıyor", () => {
    const summary = consistencySummary(
      [day("2026-07-06"), day("2026-07-13"), day("2026-07-20"), day("2026-09-15")],
      now,
    );
    expect(summary.weekStreak).toBe(1);
    expect(summary.longestWeekStreak).toBe(3);
  });

  it("haftalık ortalama son 12 hafta", () => {
    const summary = consistencySummary([day("2026-09-15", 2), day("2026-09-08"), day("2025-01-01", 5)], now);
    expect(summary.perWeek).toBeCloseTo(3 / 12);
  });
});

describe("strengthSummary", () => {
  const lift = (key: string, level: string, ratio: string, progress: number, next: string | null = "x"): StrengthStandard => ({
    lift_key: key,
    lift_label: key,
    estimated_1rm: "100",
    bodyweight_ratio: ratio,
    level,
    level_label: level,
    next_level: next,
    next_level_label: next,
    next_level_kg: next ? "120" : null,
    progress_to_next: progress,
  });

  it("ortanca seviye, en güçlü ve en yakın", () => {
    const summary = strengthSummary([
      lift("bench", "novice", "1.0", 0.2),
      lift("squat", "intermediate", "1.5", 0.9),
      lift("deadlift", "advanced", "2.1", 0.4),
      lift("press", "novice", "0.6", 0.5),
    ]);
    expect(summary.level?.key).toBe("novice");
    expect(summary.strongest?.lift_key).toBe("deadlift");
    expect(summary.closest?.lift_key).toBe("squat");
  });

  it("elit harekette bir sonraki seviye yok", () => {
    const summary = strengthSummary([lift("bench", "elite", "2.0", 1, null)]);
    expect(summary.level?.label).toBe("Elit");
    expect(summary.closest).toBeNull();
  });

  it("boş liste", () => {
    expect(strengthSummary([]).level).toBeNull();
  });
});

describe("kilo hızı", () => {
  const series = (days: number, start: number, perDay: number): WeightPoint[] =>
    Array.from({ length: days }, (_, index) => ({
      date: new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10),
      weight_kg: (start + index * perDay).toFixed(2),
      moving_average: index < 6 ? null : (start + (index - 3) * perDay).toFixed(2),
    }));

  it("14 günden az veride hız yok", () => {
    expect(weeklyRate(series(10, 80, -0.05))).toBeNull();
  });

  it("ortalamadan haftalık hız", () => {
    expect(weeklyRate(series(20, 80, -0.05))).toBeCloseTo(-0.35);
  });

  it("hedef bandı vücut ağırlığına göre", () => {
    expect(rateBand("cut", 80)).toEqual({ min: -0.8, max: -0.4 });
    expect(rateBand("bulk", 80)).toEqual({ min: 0.2, max: 0.4 });
  });

  it("karar", () => {
    expect(rateVerdict("cut", -0.5, 80)).toBe("in-band");
    expect(rateVerdict("cut", -1.2, 80)).toBe("too-fast");
    expect(rateVerdict("cut", -0.1, 80)).toBe("too-slow");
    expect(rateVerdict("cut", 0.3, 80)).toBe("wrong-way");
    expect(rateVerdict("bulk", 0.6, 80)).toBe("too-fast");
    expect(rateVerdict("maintain", 0.05, 80)).toBe("in-band");
    expect(rateVerdict("maintain", -0.5, 80)).toBe("wrong-way");
  });

  it("haftalık ortalamalar en yeniden, bitişik haftayla fark", () => {
    const points: WeightPoint[] = [
      { date: "2026-08-31", weight_kg: "80.00", moving_average: null },
      { date: "2026-09-02", weight_kg: "81.00", moving_average: null },
      { date: "2026-09-08", weight_kg: "80.00", moving_average: null },
      { date: "2026-09-21", weight_kg: "79.00", moving_average: null },
    ];
    const weeks = weeklyAverages(points);
    expect(weeks.map((week) => week.average)).toEqual([79, 80, 80.5]);
    expect(weeks[0]!.change).toBeNull(); // arada boş hafta var
    expect(weeks[1]!.change).toBeCloseTo(-0.5);
    expect(weeks[2]!.count).toBe(2);
  });
});
