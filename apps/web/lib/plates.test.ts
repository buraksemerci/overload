import { describe, expect, it } from "vitest";
import { barFor, plateLoad } from "./plates";

describe("plateLoad", () => {
  it("bir tarafa büyükten küçüğe", () => {
    expect(plateLoad(92.5)).toEqual({ perSide: [25, 10, 1.25], remainder: 0, belowBar: false });
  });

  it("sadece bar", () => {
    expect(plateLoad(20)).toEqual({ perSide: [], remainder: 0, belowBar: false });
  });

  it("tam oturmayanı söylüyor, yuvarlamıyor", () => {
    const load = plateLoad(21);
    expect(load.perSide).toEqual([]);
    expect(load.remainder).toBeCloseTo(1);
  });

  it("bardan hafif hedef", () => {
    expect(plateLoad(15).belowBar).toBe(true);
  });

  it("ondalık hatası birikmiyor", () => {
    // 142,5 → bir taraf 61,25 = 25+25+10+1,25
    expect(plateLoad(142.5).perSide).toEqual([25, 25, 10, 1.25]);
    expect(plateLoad(142.5).remainder).toBe(0);
  });

  it("taşıyıcısız plaka yüklemeli makine", () => {
    expect(plateLoad(40, 0).perSide).toEqual([20]);
  });
});

describe("barFor", () => {
  it("dambılda hesap yok", () => {
    expect(barFor("dumbbell")).toBeNull();
    expect(barFor("barbell")).toBe(20);
  });
});
