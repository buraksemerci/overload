import { describe, expect, it } from "vitest";
import { currentMeal, dayLabel, isoDate, mealForHour, shiftDay } from "./meals";

describe("mealForHour", () => {
  it("sabahı kahvaltı sayar", () => {
    expect(mealForHour(7)).toBe("breakfast");
    expect(mealForHour(10)).toBe("breakfast");
  });

  it("eşikte bir sonrakine geçer", () => {
    expect(mealForHour(11)).toBe("lunch");
    expect(mealForHour(15)).toBe("snack");
    expect(mealForHour(18)).toBe("dinner");
  });

  it("gece yarısı sonrası akşam değil kahvaltı", () => {
    // Tarih yeni güne geçti; o kaydı akşam yemeği saymak günün İLK öğününü
    // akşam göstermek olurdu.
    expect(mealForHour(0)).toBe("breakfast");
    expect(mealForHour(2)).toBe("breakfast");
  });

  it("günün her saati bir öğüne düşer", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(mealForHour(hour)).toBeTruthy();
    }
  });

  it("currentMeal verilen tarihin saatini kullanır", () => {
    expect(currentMeal(new Date(2026, 8, 15, 19, 30))).toBe("dinner");
  });
});

describe("isoDate", () => {
  it("yerel saate göre biçimlendirir", () => {
    // `toISOString()` UTC'ye kaydırıyor: TR'de 15 Eylül 01:00 için "09-14"
    // üretirdi ve kayıt bir önceki güne yazılırdı.
    expect(isoDate(new Date(2026, 8, 15, 1, 0))).toBe("2026-09-15");
    expect(isoDate(new Date(2026, 8, 15, 23, 30))).toBe("2026-09-15");
  });

  it("tek haneli ay ve günü sıfırla doldurur", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("shiftDay", () => {
  const today = new Date(2026, 8, 15, 10, 0);

  it("bugünden geri gidince tarih döner", () => {
    expect(shiftDay(null, -1, today)).toBe("2026-09-14");
  });

  it("bugüne dönünce null olur", () => {
    // `null` ile "2026-09-15" aynı günü gösterir; ikisi ayrı sorgu anahtarı
    // olursa aynı gün iki kez çekilir ve biri bayat kalır.
    expect(shiftDay("2026-09-14", 1, today)).toBeNull();
  });

  it("ay sınırını geçer", () => {
    expect(shiftDay("2026-09-01", -1, today)).toBe("2026-08-31");
  });

  it("yaz saati geçişinde günü kaydırmaz", () => {
    // Öğlen 12:00 sabitlenmesi bunun için: gece yarısı temel alınsaydı
    // saat kayması olan günlerde ±1 saat tarihi atlatabiliyordu.
    expect(shiftDay("2026-03-29", -1, today)).toBe("2026-03-28");
    expect(shiftDay("2026-10-25", -1, today)).toBe("2026-10-24");
  });
});

describe("dayLabel", () => {
  const today = new Date(2026, 8, 15, 10, 0);

  it("bugün ve dün adlandırılır", () => {
    expect(dayLabel(null, today)).toBe("Bugün");
    expect(dayLabel("2026-09-14", today)).toBe("Dün");
  });

  it("daha eski günler tarih olarak yazılır", () => {
    expect(dayLabel("2026-09-10", today)).toMatch(/10/);
  });
});
