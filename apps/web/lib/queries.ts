/**
 * Veri erişim katmanı — TanStack Query hook'ları.
 *
 * **Neden bir sorgu kütüphanesi:** bu uygulamada ekranlar birbirini etkiliyor.
 * Bir set kaydedince ana paneldeki seri, kas haritası ve ilerleme grafikleri
 * bayatlıyor. Elle yazılmış `useEffect` + `useState` mantığında bu bağımlılıkları
 * takip etmek kısa sürede dağılıyor; burada tek yapılması gereken doğru
 * `queryKey`'leri geçersizlemek.
 *
 * Anahtar düzeni hiyerarşik: `["workouts", "today"]` gibi. Böylece
 * `invalidateQueries({queryKey: ["workouts"]})` tüm antrenman sorgularını
 * tek seferde tazeliyor.
 */

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "./api";
import { fetchMe, type Me } from "./auth";

// --- Sorgu anahtarları -------------------------------------------------------

export const keys = {
  me: ["me"] as const,
  workouts: ["workouts"] as const,
  today: ["workouts", "today"] as const,
  streak: ["workouts", "streak"] as const,
  muscleVolume: (days: number) => ["workouts", "muscle-volume", days] as const,
  sessions: ["workouts", "sessions"] as const,
  session: (id: string) => ["workouts", "sessions", id] as const,
  records: ["workouts", "records"] as const,
  programs: ["programs"] as const,
  templates: ["programs", "templates"] as const,
  program: (id: string) => ["programs", id] as const,
  exercises: (q: string) => ["exercises", q] as const,
  progress: ["progress"] as const,
  standards: ["progress", "strength-standards"] as const,
  consistency: (days: number) => ["progress", "consistency", days] as const,
  exerciseHistory: (id: string) => ["progress", "exercise", id] as const,
  nutrition: ["nutrition"] as const,
  nutritionDay: (date: string | null, goal: string) =>
    ["nutrition", "day", date, goal] as const,
  weightTrend: ["bodyweight", "trend"] as const,
  supplementsToday: ["supplements", "today"] as const,
  supplements: ["supplements"] as const,
  soreness: ["soreness"] as const,
  injuries: ["injuries"] as const,
  muscleGroups: ["muscle-groups"] as const,
  coachLatest: ["coach", "latest"] as const,
  coachWeek: ["coach", "current-week"] as const,
  pendingActions: ["chat", "pending-actions"] as const,
};

// --- Tipler (backend şemasının kullanılan alt kümesi) ------------------------
//
// Üretilen `api.d.ts` tam sözleşmeyi içeriyor ama derin indeksleme okunaksız.
// Buradaki tipler onun okunur karşılığı; alan adları birebir aynı olmak zorunda
// ve OpenAPI değişirse `pnpm gen:types` sonrası derleme bunları yakalar.

export interface Progression {
  kind: string;
  weight_kg: string;
  reps: number;
  label: string;
  message: string;
  alternative_label: string | null;
  plateau_sessions: number | null;
  warnings: string[];
}

export interface PlannedExercise {
  program_exercise_id: string;
  exercise_id: string;
  name: string;
  equipment: string;
  order_index: number;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  technique: string;
  superset_group: number | null;
  rest_seconds: number | null;
  progression: Progression | null;
  last_session_summary: string | null;
}

export interface TodayWorkout {
  program_name: string | null;
  program_day_id: string | null;
  day_label: string | null;
  exercises: PlannedExercise[];
  active_session_id: string | null;
  is_deload_suggested: boolean;
}

export interface Streak {
  intact_weeks: number;
  this_week_sessions: number;
  weekly_target: number;
  sessions_in_streak: number;
  label: string;
}

export interface MuscleVolumeRow {
  slug: string;
  name_tr: string;
  svg_id: string;
  region: "front" | "back";
  sets: number;
  target: number;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: string;
  reps: number;
  rir: number | null;
  is_warmup: boolean;
  technique: string;
}

export interface WorkoutSession {
  id: string;
  program_day_id: string | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  is_deload: boolean;
  sets: WorkoutSet[];
}

export interface PersonalRecordRow {
  exercise_id: string;
  type: string;
  value: string;
  reps: number | null;
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  level: string;
  days_per_week: number;
  is_template: boolean;
  is_active: boolean;
  source_name: string | null;
  source_url: string | null;
}

export interface ProgramExerciseRow {
  id: string;
  exercise_id: string;
  exercise_name: string;
  equipment: string;
  order_index: number;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  technique: string;
  superset_group: number | null;
  rest_seconds: number | null;
  notes: string | null;
  target_percent_1rm: string | null;
  target_label: string;
}

export interface ProgramDetail extends ProgramSummary {
  days: Array<{
    id: string;
    order_index: number;
    label: string;
    exercises: ProgramExerciseRow[];
  }>;
}

export interface StrengthStandard {
  lift_key: string;
  lift_label: string;
  estimated_1rm: string;
  bodyweight_ratio: string;
  level: string;
  level_label: string;
  next_level: string | null;
  next_level_kg: string | null;
  progress_to_next: number;
}

export interface StrengthStandards {
  bodyweight_kg: string | null;
  is_estimated: boolean;
  results: StrengthStandard[];
  unavailable_reason: string | null;
}

export interface ConsistencyDay {
  date: string;
  sessions: number;
  total_volume_kg: string;
}

export interface NutritionDay {
  date: string;
  items: Array<{
    id: string;
    date: string;
    meal_type: string;
    quantity_g: string;
    food: { id: string; name: string; brand: string | null };
    calories: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
  }>;
  totals: { calories: string; protein_g: string; carbs_g: string; fat_g: string };
  target: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    tdee: number;
    floor_applied: boolean;
  } | null;
  remaining: { calories: string; protein_g: string; carbs_g: string; fat_g: string } | null;
}

export interface WeightPoint {
  date: string;
  weight_kg: string;
  moving_average: string | null;
}

export interface CoachReport {
  id: string;
  week_start: string;
  content: string;
  metrics: Record<string, unknown> | null;
  generated_at: string;
  read_at: string | null;
}

// --- Sorgular ----------------------------------------------------------------

export function useMe(): UseQueryResult<Me> {
  return useQuery({ queryKey: keys.me, queryFn: fetchMe, retry: false });
}

export function useToday(): UseQueryResult<TodayWorkout> {
  return useQuery({
    queryKey: keys.today,
    queryFn: () => api.get<TodayWorkout>("/workouts/today"),
  });
}

export function useStreak(): UseQueryResult<Streak> {
  return useQuery({ queryKey: keys.streak, queryFn: () => api.get<Streak>("/workouts/streak") });
}

export function useMuscleVolume(days = 7): UseQueryResult<MuscleVolumeRow[]> {
  return useQuery({
    queryKey: keys.muscleVolume(days),
    queryFn: () => api.get<MuscleVolumeRow[]>(`/workouts/muscle-volume?days=${days}`),
  });
}

export function useSession(id: string | null): UseQueryResult<WorkoutSession> {
  return useQuery({
    queryKey: keys.session(id ?? ""),
    queryFn: () => api.get<WorkoutSession>(`/workouts/sessions/${id}`),
    enabled: id !== null,
  });
}

export function useSessions(limit = 30): UseQueryResult<WorkoutSession[]> {
  return useQuery({
    queryKey: [...keys.sessions, limit],
    queryFn: () => api.get<WorkoutSession[]>(`/workouts/sessions?limit=${limit}`),
  });
}

export function usePrograms(): UseQueryResult<ProgramSummary[]> {
  return useQuery({ queryKey: keys.programs, queryFn: () => api.get<ProgramSummary[]>("/programs") });
}

export function useTemplates(): UseQueryResult<ProgramSummary[]> {
  return useQuery({
    queryKey: keys.templates,
    queryFn: () => api.get<ProgramSummary[]>("/programs/templates"),
  });
}

export function useProgram(id: string | null): UseQueryResult<ProgramDetail> {
  return useQuery({
    queryKey: keys.program(id ?? ""),
    queryFn: () => api.get<ProgramDetail>(`/programs/${id}`),
    enabled: id !== null,
  });
}

export function useStrengthStandards(): UseQueryResult<StrengthStandards> {
  return useQuery({
    queryKey: keys.standards,
    queryFn: () => api.get<StrengthStandards>("/progress/strength-standards"),
  });
}

export function useConsistency(days = 365): UseQueryResult<ConsistencyDay[]> {
  return useQuery({
    queryKey: keys.consistency(days),
    queryFn: () => api.get<ConsistencyDay[]>(`/progress/consistency?days=${days}`),
  });
}

export function useRecords(): UseQueryResult<PersonalRecordRow[]> {
  return useQuery({
    queryKey: keys.records,
    queryFn: () => api.get<PersonalRecordRow[]>("/workouts/records"),
  });
}

export function useNutritionDay(
  date: string | null = null,
  goal = "maintain",
): UseQueryResult<NutritionDay> {
  const query = new URLSearchParams({ goal });
  if (date) query.set("on", date);
  return useQuery({
    queryKey: keys.nutritionDay(date, goal),
    queryFn: () => api.get<NutritionDay>(`/nutrition/day?${query}`),
  });
}

export function useWeightTrend(limit = 90): UseQueryResult<WeightPoint[]> {
  return useQuery({
    queryKey: [...keys.weightTrend, limit],
    queryFn: () => api.get<WeightPoint[]>(`/bodyweight/trend?limit=${limit}`),
  });
}

export function useLatestCoachReport(): UseQueryResult<CoachReport> {
  return useQuery({
    queryKey: keys.coachLatest,
    queryFn: () => api.get<CoachReport>("/coach/reports/latest"),
    // Rapor henüz üretilmemişse 404 döner; bu bir hata değil, beklenen durum.
    retry: false,
  });
}

// --- Mutasyonlar -------------------------------------------------------------

export function useStartSession(): UseMutationResult<
  WorkoutSession,
  Error,
  { program_day_id?: string | null; notes?: string | null }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<WorkoutSession>("/workouts/sessions", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.workouts });
    },
  });
}

export interface LogSetInput {
  sessionId: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rir: number | null;
  is_warmup?: boolean;
  technique?: string;
}

export function useLogSet(): UseMutationResult<WorkoutSet, Error, LogSetInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...body }) =>
      api.post<WorkoutSet>(`/workouts/sessions/${sessionId}/sets`, body),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: keys.session(variables.sessionId) });
    },
  });
}

export function useCompleteSession(): UseMutationResult<
  { session: WorkoutSession; new_records: PersonalRecordRow[] },
  Error,
  string
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) =>
      api.post<{ session: WorkoutSession; new_records: PersonalRecordRow[] }>(
        `/workouts/sessions/${sessionId}/complete`,
      ),
    onSuccess: () => {
      // Seans kapanınca seri, kas hacmi, rekorlar ve ilerleme grafikleri
      // hepsi bayatlıyor — üst seviye anahtarları geçersizlemek yeterli.
      void client.invalidateQueries({ queryKey: keys.workouts });
      void client.invalidateQueries({ queryKey: keys.progress });
    },
  });
}

export function useActivateProgram(): UseMutationResult<ProgramSummary, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (programId) => api.post<ProgramSummary>(`/programs/${programId}/activate`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.programs });
      void client.invalidateQueries({ queryKey: keys.workouts });
    },
  });
}

export function useCloneProgram(): UseMutationResult<ProgramDetail, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (programId) => api.post<ProgramDetail>(`/programs/${programId}/clone`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.programs });
    },
  });
}

// --- Hareket kütüphanesi, vücut takibi, koç ---------------------------------

export interface ExerciseRow {
  id: string;
  name: string;
  equipment: string;
  is_custom: boolean;
  is_unilateral: boolean;
  primary_muscles: string[];
  secondary_muscles: string[];
}

export interface MuscleGroupRow {
  id: string;
  slug: string;
  name_tr: string;
  name_en: string;
  region: "front" | "back";
  svg_id: string;
  weekly_set_target: number;
}

export interface SupplementRow {
  id: string;
  name: string;
  dose: string | null;
  schedule: string;
  is_active: boolean;
}

export interface SupplementTodayRow {
  supplement: SupplementRow;
  taken: boolean | null;
  due_today: boolean;
}

export interface SorenessRow {
  id: string;
  date: string;
  muscle_group_slug: string;
  muscle_group_name: string;
  level: number;
}

export interface InjuryRow {
  id: string;
  muscle_group_slug: string;
  muscle_group_name: string;
  description: string;
  started_on: string;
  resolved_on: string | null;
  is_active: boolean;
}

export interface CurrentWeek {
  metrics: Record<string, unknown>;
  has_report: boolean;
}

export function useExercises(query: string, equipment?: string): UseQueryResult<ExerciseRow[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (equipment) params.set("equipment", equipment);
  return useQuery({
    queryKey: keys.exercises(`${query}|${equipment ?? ""}`),
    queryFn: () => api.get<ExerciseRow[]>(`/exercises?${params}`),
  });
}

export function useMuscleGroups(): UseQueryResult<MuscleGroupRow[]> {
  return useQuery({
    queryKey: keys.muscleGroups,
    queryFn: () => api.get<MuscleGroupRow[]>("/muscle-groups"),
    // Referans veri; oturum boyunca değişmiyor.
    staleTime: Infinity,
  });
}

export function useSupplementsToday(): UseQueryResult<SupplementTodayRow[]> {
  return useQuery({
    queryKey: keys.supplementsToday,
    queryFn: () => api.get<SupplementTodayRow[]>("/supplements/today"),
  });
}

export function useSoreness(days = 7): UseQueryResult<SorenessRow[]> {
  return useQuery({
    queryKey: [...keys.soreness, days],
    queryFn: () => api.get<SorenessRow[]>(`/soreness?days=${days}`),
  });
}

export function useInjuries(): UseQueryResult<InjuryRow[]> {
  return useQuery({
    queryKey: keys.injuries,
    queryFn: () => api.get<InjuryRow[]>("/injuries"),
  });
}

export function useCurrentWeek(): UseQueryResult<CurrentWeek> {
  return useQuery({
    queryKey: keys.coachWeek,
    queryFn: () => api.get<CurrentWeek>("/coach/current-week"),
  });
}

export function useMarkIntake(): UseMutationResult<
  unknown,
  Error,
  { supplementId: string; taken: boolean }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ supplementId, taken }) =>
      api.post(`/supplements/${supplementId}/intake`, { taken }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.supplementsToday });
    },
  });
}

export function useCreateSupplement(): UseMutationResult<
  SupplementRow,
  Error,
  { name: string; dose?: string | null; schedule?: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<SupplementRow>("/supplements", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.supplements });
      void client.invalidateQueries({ queryKey: keys.supplementsToday });
    },
  });
}

export function useLogSoreness(): UseMutationResult<
  SorenessRow,
  Error,
  { muscle_group_slug: string; level: number }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<SorenessRow>("/soreness", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.soreness });
    },
  });
}

export function useLogBodyweight(): UseMutationResult<
  unknown,
  Error,
  { weight_kg: number; date?: string | null }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/bodyweight", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.weightTrend });
      void client.invalidateQueries({ queryKey: keys.nutrition });
      void client.invalidateQueries({ queryKey: keys.standards });
    },
  });
}
