/**
 * Plaka hesaplayıcı — "bu ağırlık için bara hangi plakaları takayım".
 *
 * Salonda set arasında zihinden yapılan en sık hesap bu ve en sık yanlış
 * yapılan: 92,5 kg için 20 kg'lık barın iki yanına 36,25 kg; bir tarafa
 * 25 + 10 + 1,25. Hesap açgözlü (büyükten küçüğe) çünkü standart plaka
 * setlerinde açgözlü çözüm en az plakalı çözüm.
 *
 * Tam oturmayan ağırlıkta (ör. 21 kg) kalan kısım AÇIKÇA söyleniyor; en
 * yakın yüklenebilir ağırlığa yuvarlamak kullanıcının girdiği sayıyı sessizce
 * değiştirmek olurdu.
 */

/** Tipik bir salonun plakaları, kg. */
export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export interface PlateLoad {
  /** Bir tarafa takılacak plakalar, büyükten küçüğe. */
  perSide: number[];
  /** Tam oturmayan kısım (iki taraf toplamı), kg. 0 = tam. */
  remainder: number;
  /** Barın kendisinden hafif hedef. */
  belowBar: boolean;
}

export function plateLoad(
  target: number,
  bar = 20,
  plates: readonly number[] = STANDARD_PLATES,
): PlateLoad {
  if (!Number.isFinite(target) || target < bar) {
    return { perSide: [], remainder: 0, belowBar: Number.isFinite(target) && target < bar };
  }

  // Gramla çalış: 1,25 gibi değerlerde ondalık hatası birikmesin.
  let side = Math.round(((target - bar) / 2) * 1000);
  const perSide: number[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const grams = Math.round(plate * 1000);
    while (side >= grams) {
      perSide.push(plate);
      side -= grams;
    }
  }
  return { perSide, remainder: (side * 2) / 1000, belowBar: false };
}

/** Bar kullanan ekipman ve barın ağırlığı. Diğerlerinde hesap anlamsız. */
export function barFor(equipment: string): number | null {
  if (equipment === "barbell") return 20;
  // Plaka yüklemeli makinelerde (hack squat, leg press) boş taşıyıcının
  // ağırlığı makineye göre değişiyor; plakalar tek başına hesaplanıyor.
  if (equipment === "plate_loaded") return 0;
  return null;
}

/** Ağırlık adımı: barda en küçük artış iki 1,25'lik plaka. */
export function weightStep(equipment: string): number {
  return equipment === "barbell" || equipment === "plate_loaded" ? 2.5 : equipment === "dumbbell" ? 2 : 2.5;
}
