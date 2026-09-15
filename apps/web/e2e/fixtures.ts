import type { Page, Route } from "@playwright/test";

/**
 * Backend taklidi.
 *
 * Yanıtlar backend şemasıyla birebir aynı alan adlarını kullanıyor. Bir alan
 * adı değişirse `lib/queries.ts` tipleri de değişir ve `pnpm typecheck` bunu
 * yakalar — taklit veri sessizce eskimez.
 */

const API = "http://localhost:8000";

export const FAKE_TOKEN = "test-token";

export const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  display_name: "Test Kullanıcı",
  timezone: "Europe/Istanbul",
  is_active: true,
  is_superuser: false,
  is_verified: true,
  birth_date: "1995-06-15",
  sex: "male",
  height_cm: 180,
  activity_level: "moderate",
};

export const TODAY_WORKOUT = {
  program_name: "5 Günlük Split",
  program_day_id: "11111111-1111-1111-1111-111111111111",
  day_label: "Pazartesi — Göğüs / Omuz / Triceps",
  active_session_id: null,
  is_deload_suggested: false,
  exercises: [
    {
      program_exercise_id: "22222222-2222-2222-2222-222222222222",
      exercise_id: "33333333-3333-3333-3333-333333333333",
      name: "Plate Loaded Chest Press",
      equipment: "plate_loaded",
      order_index: 0,
      target_sets: 2,
      target_rep_min: 5,
      target_rep_max: 6,
      technique: "rir1",
      superset_group: null,
      rest_seconds: 180,
      last_session_summary: "40kg x 6 RIR1",
      progression: {
        kind: "add_weight",
        weight_kg: "42.50",
        reps: 5,
        label: "42.5kg x 5",
        message: "Geçen sefer 40kg x 6 RIR1 yaptın — hedef aralığın üstündesin.",
        alternative_label: "40kg x 7",
        plateau_sessions: null,
        warnings: [],
      },
    },
  ],
};

export const STREAK = {
  intact_weeks: 3,
  this_week_sessions: 2,
  weekly_target: 5,
  sessions_in_streak: 17,
  label: "3 hafta kesintisiz (bu hafta 2/5)",
};

export const MUSCLE_VOLUME = [
  { slug: "chest", name_tr: "Göğüs", svg_id: "m-chest", region: "front", sets: 10, target: 12 },
  { slug: "lats", name_tr: "Kanat (Lat)", svg_id: "m-lats", region: "back", sets: 13, target: 12 },
  { slug: "quads", name_tr: "Quadriceps", svg_id: "m-quads", region: "front", sets: 3, target: 12 },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/** Oturumu açık bir kullanıcı simüle eder. */
export async function signIn(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem("overload.token", token);
  }, FAKE_TOKEN);
}

/** Varsayılan API taklidini kurar. Testler tek tek üzerine yazabilir. */
export async function mockApi(page: Page): Promise<void> {
  await page.route(`${API}/users/me`, (route) => json(route, ME));
  await page.route(`${API}/workouts/today`, (route) => json(route, TODAY_WORKOUT));
  await page.route(`${API}/workouts/streak`, (route) => json(route, STREAK));
  await page.route(`${API}/workouts/muscle-volume**`, (route) => json(route, MUSCLE_VOLUME));
  await page.route(`${API}/workouts/records`, (route) => json(route, []));
  await page.route(`${API}/workouts/records/best`, (route) => json(route, []));
  await page.route(`${API}/workouts/sessions**`, (route) => json(route, []));
  await page.route(`${API}/workouts/history**`, (route) => json(route, []));
  // Boş liste DEĞİL: aktif program rozeti ("AKTİF") yalnızca aktif bir
  // program varken görünüyor ve boş taklit veriyle hiç render edilmiyordu.
  // Tam da o rozet, kaldırılmış bir CSS değişkeni yüzünden görünmez hâlde
  // aylarca durdu ve hiçbir test kırılmadı.
  await page.route(`${API}/programs`, (route) =>
    json(route, [
      {
        id: "44444444-4444-4444-4444-444444444444",
        name: "5 Günlük Split",
        description: null,
        goal: "hypertrophy",
        level: "beginner",
        days_per_week: 5,
        is_template: false,
        is_active: true,
        source_name: null,
        source_url: null,
      },
    ]),
  );
  await page.route(`${API}/programs/templates`, (route) => json(route, []));
  // Boş liste DEĞİL. Hareket satırları render edilmediği için `/exercises`
  // ekranındaki volt METİN hatası (birincil kaslar `--color-accent` ile
  // yazılıydı, kırık beyaz üzerinde ~1.3:1) hiçbir teste yakalanmıyordu.
  await page.route(`${API}/exercises**`, (route) =>
    json(route, [
      {
        id: "55555555-5555-5555-5555-555555555555",
        name: "Barbell Bench Press",
        equipment: "barbell",
        is_custom: false,
        is_unilateral: false,
        primary_muscles: ["Göğüs"],
        secondary_muscles: ["Ön omuz", "Triceps"],
      },
      {
        id: "66666666-6666-6666-6666-666666666666",
        name: "Bulgarian Split Squat",
        equipment: "dumbbell",
        is_custom: true,
        is_unilateral: true,
        primary_muscles: ["Quadriceps"],
        secondary_muscles: ["Kalça"],
      },
    ]),
  );
  await page.route(`${API}/progress/consistency**`, (route) => json(route, []));
  await page.route(`${API}/progress/strength-standards`, (route) =>
    json(route, {
      bodyweight_kg: "80.00",
      is_estimated: true,
      results: [
        {
          lift_key: "barbell bench press",
          lift_label: "Bench Press",
          estimated_1rm: "100.00",
          bodyweight_ratio: "1.25",
          level: "intermediate",
          level_label: "Orta",
          next_level: "advanced",
          next_level_label: "İleri",
          next_level_kg: "140.00",
          progress_to_next: 0.0,
        },
      ],
      unavailable_reason: null,
    }),
  );
  await page.route(`${API}/nutrition/day**`, (route) =>
    json(route, {
      date: "2026-09-14",
      items: [],
      totals: { calories: "0", protein_g: "0", carbs_g: "0", fat_g: "0" },
      target: {
        calories: 2800,
        protein_g: 160,
        carbs_g: 350,
        fat_g: 78,
        tdee: 2800,
        floor_applied: false,
      },
      remaining: { calories: "2800", protein_g: "160", carbs_g: "350", fat_g: "78" },
    }),
  );
  await page.route(`${API}/nutrition/foods/recent`, (route) => json(route, []));
  await page.route(`${API}/nutrition/meal-suggestions**`, (route) =>
    json(route, { suggestions: [], reason: "Kalan makro yok." }),
  );
  await page.route(`${API}/bodyweight/trend**`, (route) => json(route, []));
  await page.route(`${API}/supplements/today`, (route) => json(route, []));
  await page.route(`${API}/muscle-groups`, (route) => json(route, []));
  await page.route(`${API}/soreness**`, (route) => json(route, []));
  await page.route(`${API}/injuries`, (route) => json(route, []));
  await page.route(`${API}/coach/current-week`, (route) =>
    json(route, { metrics: { sessions: 2, total_sets: 18, total_volume_kg: 9400 }, has_report: false }),
  );
  await page.route(`${API}/coach/reports/latest`, (route) =>
    json(route, { detail: "Henüz rapor üretilmedi." }, 404),
  );
  await page.route(`${API}/chat/messages**`, (route) => json(route, []));
  await page.route(`${API}/chat/pending-actions`, (route) => json(route, []));
}
