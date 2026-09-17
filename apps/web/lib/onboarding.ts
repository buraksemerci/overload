/**
 * Tanışma akışının hesapları — ekrandan bağımsız, saf fonksiyonlar.
 *
 * Ekran (`app/onboarding/page.tsx`) yalnızca soruyor ve gösteriyor. Cevaplardan
 * ne çıkarıldığı burada, çünkü iki çıkarım da yanlış yapıldığında sessizce
 * yanlış sayı üretiyor: yanlış aktivite katsayısı kalori hedefini günde
 * yüzlerce kalori kaydırıyor, yanlış şablon yeni başlayan birine ileri seviye
 * bir program veriyor. İkisi de birim testli (`lib/onboarding.test.ts`).
 */

import type { ProgramSummary } from "@/lib/queries";

export type Sex = "male" | "female" | "unspecified";
export type Experience = "new" | "under_1y" | "one_to_three" | "over_three";
export type TrainingGoal = "strength" | "hypertrophy" | "powerbuilding" | "general_fitness";
export type NutritionGoal = "cut" | "maintain" | "bulk";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

/** Antrenman DIŞINDA gün nasıl geçiyor. Saklanmıyor; yalnızca katsayıya giriyor. */
export type DailyMovement = "seated" | "on_feet" | "physical";

/* --- Aktivite katsayısı ---------------------------------------------------
 *
 * NEDEN DOĞRUDAN SORULMUYOR
 * Kalori formülünün katsayısı (`services/nutrition/tdee.py`) iki şeyi TEK
 * sayıda karıştırıyor: haftada kaç gün antrenman ve gün içinde ne kadar
 * hareket. "Hafif — haftada 1-3 gün" gibi bir seçenek, masa başı çalışan
 * ama haftada dört gün salona giden birini hangi kutuya koyacağını
 * bilmez hâlde bırakıyordu.
 *
 * Akış zaten antrenman gününü soruyor. Kalan tek bilinmeyen gün içi hareket
 * ve onu herkes tereddütsüz cevaplayabilir. Katsayı ikisinden türetiliyor;
 * gün içi hareket cevabı hiçbir yere yazılmıyor — tek tüketicisi bu hesap.
 */

const LEVELS: readonly ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

/** Gün içi hareketin katsayıya eklediği basamak. */
const MOVEMENT_STEP: Record<DailyMovement, number> = {
  seated: 0,
  on_feet: 1,
  physical: 2,
};

/**
 * Antrenman günü + gün içi hareket → formülün aktivite düzeyi.
 *
 * Antrenman günleri formülün kendi tanımından: 0 gün hareketsiz, 1-3 hafif,
 * 4-5 orta, 6-7 aktif. Ayakta geçen bir iş bir basamak, bedenen ağır iş iki
 * basamak ekliyor; en üst basamakta duruyor.
 *
 * Gün sayısı bilinmiyorsa (soru atlandı) hareketsiz sayılıyor. Bilinmeyen bir
 * antrenmanı varsaymak kalori hedefini şişirir; eksik tahmin edilen hedef ise
 * ilk tartılarda kendini gösterir ve düzeltilir.
 *
 * Gün içi hareket sorusu atlandıysa bu fonksiyon HİÇ çağrılmıyor ve profildeki
 * düzey olduğu gibi kalıyor: Hesap ekranında "aktif" seçmiş birinin düzeyi,
 * atladığı bir soru yüzünden değişmemeli.
 */
export function activityFrom(days: number | null, movement: DailyMovement): ActivityLevel {
  const trainingDays = days ?? 0;
  const base = trainingDays === 0 ? 0 : trainingDays <= 3 ? 1 : trainingDays <= 5 ? 2 : 3;
  return LEVELS[Math.min(base + MOVEMENT_STEP[movement], LEVELS.length - 1)]!;
}

/* --- Şablon önerisi -------------------------------------------------------
 *
 * Seviye beyandan, ama TEMKİNLİ: bir yıldan kısa süredir çalışan birine
 * yalnızca başlangıç şablonları öneriliyor, üç yıldan uzun çalışana bile
 * ileri seviye ancak başka seçenek yoksa. Aynı ilke başlangıç ağırlıklarında
 * da geçerli (`services/starting_weight.py`): fazla ağır tahminin bedeli
 * sakatlık, hafif tahminin bedeli bir iki hafta.
 */

const LEVEL_ORDER: Record<Experience, readonly string[]> = {
  new: ["beginner"],
  under_1y: ["beginner"],
  one_to_three: ["beginner", "intermediate"],
  over_three: ["intermediate", "beginner", "advanced"],
};

/** Gün bilinmiyorsa uygulamanın haftalık hedef varsayılanı. */
const DEFAULT_DAYS = 3;

export interface Recommendation {
  template: ProgramSummary;
  /**
   * Öneri hedefle birebir örtüşmüyorsa sebebi. Kullanıcı "hipertrofi" dedi ve
   * ona güç programı çıktıysa neden olduğunu görmeli.
   */
  note: string | null;
}

export function recommendTemplate(
  templates: readonly ProgramSummary[],
  answers: {
    goal: TrainingGoal | null;
    experience: Experience | null;
    days: number | null;
  },
): Recommendation | null {
  const levels = LEVEL_ORDER[answers.experience ?? "new"];
  const days = answers.days ?? DEFAULT_DAYS;

  const fitting = templates.filter((t) => levels.includes(t.level));
  if (fitting.length === 0) return null;

  const sameGoal = fitting.filter((t) => t.goal === answers.goal);
  const pool = sameGoal.length > 0 ? sameGoal : fitting;

  const ranked = [...pool].sort((a, b) => {
    // 1) Seviye sırası: beyana en uygun seviye önce.
    const level = levels.indexOf(a.level) - levels.indexOf(b.level);
    if (level !== 0) return level;
    // 2) Ayrılabilecek günü AŞMAYAN şablonlar önce. Haftada üç gün
    //    gelebilen birine dört günlük program, ilk haftadan yarım kalan
    //    bir program demek.
    const overA = a.days_per_week > days ? 1 : 0;
    const overB = b.days_per_week > days ? 1 : 0;
    if (overA !== overB) return overA - overB;
    // 3) Güne en yakın olan: ayrılan zamanı kullanan.
    return Math.abs(a.days_per_week - days) - Math.abs(b.days_per_week - days);
  });

  const template = ranked[0]!;
  let note: string | null = null;
  if (answers.goal !== null && template.goal !== answers.goal) {
    // İki ayrı durum, iki ayrı cümle: "seviyene uygun yok" ile "bu hedefe
    // hiç şablon yok" kullanıcıya farklı şeyler söylüyor.
    note = templates.some((t) => t.goal === answers.goal)
      ? "Hedefine ayrılmış şablonlar senin seviyenin üstünde. Temelleri oturtmak her hedefe hizmet ediyor; sonra geçebilirsin."
      : "Bu hedefe ayrılmış bir şablon henüz yok; sana en uygun genel program bu.";
  } else if (template.days_per_week > days) {
    note = `Haftada ${days} günlük uygun bir şablon yok; en yakını ${template.days_per_week} gün.`;
  }
  return { template, note };
}

/* --- Yaş sınırı -----------------------------------------------------------
 *
 * Sunucu 13-100 dışını reddediyor (`features/account/onboarding.py`). Aynı
 * sınır burada da var ki kullanıcı hatayı son adımda değil, tarihi girdiği
 * adımda görsün.
 */

export function ageOn(birth: string, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const beforeBirthday =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - (beforeBirthday ? 1 : 0);
}

export function birthDateProblem(birth: string, today = new Date()): string | null {
  if (birth === "") return null;
  const age = ageOn(birth, today);
  if (age === null || age < 13 || age > 100) {
    return "Bu tarih geçerli görünmüyor. Yılı kontrol eder misin?";
  }
  return null;
}
