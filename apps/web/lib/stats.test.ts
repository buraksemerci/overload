import { describe, expect, it } from "vitest";
import type { HistorySession, MuscleVolumeRow, WeightPoint } from "./queries";
import { change, muscleBalance, tonnage, weekStart, weeklyVolume, weightSummary } from "./stats";

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
