/**
 * Polyglot mimaride tip güvenliği köprüsü (bölüm 6.1).
 *
 * `api.d.ts` FastAPI'nin ürettiği OpenAPI şemasından türetilir ve commit
 * EDİLMEZ (.gitignore'da) — backend şeması değiştiğinde yeniden üretilir:
 *
 *     pnpm gen:types      # backend localhost:8000'de çalışıyorken
 *
 * Böylece backend'de bir alan adı değişirse frontend derlenmez; sessizce
 * `undefined` okumak yerine derleme zamanında hata alırız. CI bu üretimi
 * tekrarlayıp fark olup olmadığını kontrol eder.
 */

// Üretilen dosya yoksa (ilk kurulum, temiz klasör) proje yine de derlensin diye
// tip yeniden dışa aktarımı koşullu tutuluyor.
export type { paths, components, operations } from "./api.js";

/** Şemadan bağımsız, elle yazılan ortak tipler. */

export type SuggestionKind =
  | "establish_baseline"
  | "add_reps"
  | "add_weight"
  | "hold"
  | "deload";

/** Kas haritası için tek kas grubunun haftalık hacim durumu. */
export interface MuscleVolume {
  slug: string;
  nameTr: string;
  svgId: string;
  region: "front" | "back";
  /** Bu hafta yapılan efektif set (primary 1.0, secondary 0.5). */
  sets: number;
  /** Haftalık hedef set sayısı. */
  target: number;
}

/** Sohbet akışında gelen SSE olayları. */
export type ChatEvent =
  | { type: "text"; data: { text: string } }
  | { type: "tool_started"; data: { name: string } }
  | {
      type: "pending_action";
      data: {
        id: string;
        action_type: string;
        summary: string;
        payload: Record<string, unknown>;
      };
    }
  | { type: "done"; data: { usage?: Record<string, number> } }
  | { type: "error"; data: { message: string; detail?: string } };
