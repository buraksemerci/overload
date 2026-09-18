"use client";

/**
 * Tanışma akışının modeli: cevaplar, adımlar ve seçenek listeleri.
 *
 * Adım içerikleri (`steps.tsx`) ve akışın kendisi (`page.tsx`) aynı tipleri
 * ve aynı seçenek listelerini kullanıyor; ikisi birbirinden almasın diye
 * ortak yer burası.
 */

import {
  birthDateProblem,
  type DailyMovement,
  type Experience,
  type NutritionGoal,
  type Sex,
  type TrainingGoal,
} from "@/lib/onboarding";
import type { Me } from "@/lib/auth";

/* --- Cevaplar --------------------------------------------------------------- */

export interface Answers {
  display_name: string;
  sex: Sex | null;
  birth_date: string;
  height_cm: string;
  weight_kg: string;
  experience: Experience | null;
  goal: TrainingGoal | null;
  days: number | null;
  movement: DailyMovement | null;
  nutrition_goal: NutritionGoal | null;
}

/**
 * Cevaplar profildeki değerlerle TOHUMLANIYOR.
 *
 * Akış yalnızca yeni hesaplara değil, akıştan önce açılmış hesaplara da
 * gösteriliyor. Boş başlasaydı, Hesap ekranında boyunu girmiş biri bir adımı
 * atladığında sunucuya boş gönderilir ve boyu silinirdi.
 */
export function seed(me: Me): Answers {
  return {
    display_name: me.display_name ?? "",
    sex: me.sex === "unspecified" ? null : me.sex,
    birth_date: me.birth_date ?? "",
    height_cm: me.height_cm === null ? "" : String(me.height_cm),
    // Kilo profilde değil, kilo kaydında. Önceki tartıyı buraya taşımak onu
    // bugünün tarihiyle yeniden kaydetmek olurdu.
    weight_kg: "",
    experience: me.training_experience,
    goal: me.training_goal,
    days: me.training_days_per_week,
    movement: null,
    nutrition_goal: me.nutrition_goal,
  };
}

/** "63,5" de "63.5" de geçerli: Türkçe klavyede ondalık ayırıcı virgül. */
export function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/* --- Adımlar ------------------------------------------------------------------ */

export type StepId = "intro" | "basics" | "body" | "experience" | "goal" | "day";

export const STEPS: readonly StepId[] = ["intro", "basics", "body", "experience", "goal", "day"];

/** Adım atlandığında eski hâline dönen alanlar. */
export const STEP_FIELDS: Record<StepId, ReadonlyArray<keyof Answers>> = {
  intro: [],
  basics: ["display_name", "sex", "birth_date"],
  body: ["height_cm", "weight_kg"],
  experience: ["experience"],
  goal: ["goal", "days"],
  day: ["movement", "nutrition_goal"],
};

/** Adımı ilerletmeyi engelleyen sorun. Boş alan sorun değil — atlanabilir. */
export function problem(step: StepId, answers: Answers): string | null {
  if (step === "basics") return birthDateProblem(answers.birth_date);
  if (step === "body") {
    const height = parseDecimal(answers.height_cm);
    if (height !== null && !(height >= 80 && height <= 260)) {
      return "Boy 80 ile 260 cm arasında olmalı.";
    }
    const weight = parseDecimal(answers.weight_kg);
    if (weight !== null && !(weight >= 20 && weight <= 400)) {
      return "Kilo 20 ile 400 kg arasında olmalı.";
    }
  }
  return null;
}

/* --- Seçenekler ----------------------------------------------------------------- */

export const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "female", label: "Kadın" },
  { value: "male", label: "Erkek" },
  { value: "unspecified", label: "Belirtmeyeceğim" },
];

export const EXPERIENCE_OPTIONS: ReadonlyArray<{ value: Experience; label: string; hint: string }> = [
  { value: "new", label: "Yeni başlıyorum", hint: "Hiç ya da birkaç haftadır" },
  { value: "under_1y", label: "Bir yıldan az", hint: "Düzenli ama yeni sayılırım" },
  { value: "one_to_three", label: "Bir ile üç yıl arası", hint: "Temel hareketleri biliyorum" },
  { value: "over_three", label: "Üç yıldan fazla", hint: "Uzun süredir düzenli" },
];

export const GOAL_OPTIONS: ReadonlyArray<{
  value: TrainingGoal;
  label: string;
  hint: string;
  photo: string;
}> = [
  { value: "strength", label: "Güç", hint: "Daha ağır kaldırmak", photo: "app-plates" },
  { value: "hypertrophy", label: "Kas", hint: "Kas kütlesi", photo: "app-dumbbells" },
  {
    value: "powerbuilding",
    label: "İkisi birden",
    hint: "Güç ve kas",
    photo: "app-squat",
  },
  {
    value: "general_fitness",
    label: "Genel form",
    hint: "Sağlıklı ve fit",
    photo: "app-gym-wide",
  },
];

export const MOVEMENT_OPTIONS: ReadonlyArray<{ value: DailyMovement; label: string; hint: string }> = [
  { value: "seated", label: "Çoğunlukla oturarak", hint: "Masa başı, okul, araç" },
  { value: "on_feet", label: "Çoğunlukla ayakta", hint: "Mağaza, sınıf, hastane" },
  { value: "physical", label: "Bedenen ağır", hint: "Şantiye, depo, kuryelik" },
];

export const NUTRITION_OPTIONS: ReadonlyArray<{ value: NutritionGoal; label: string; hint: string }> = [
  { value: "cut", label: "Yağ kaybı", hint: "İhtiyacının %20 altında" },
  { value: "maintain", label: "Koruma", hint: "İhtiyacın kadar" },
  { value: "bulk", label: "Kas kazanımı", hint: "İhtiyacının %10 üstünde" },
];
