/**
 * Kullanıcıya gösterilen sabit etiketler.
 *
 * Buraya taşınmalarının sebebi somut: rekor türü haritası iki ekranda ayrı ayrı
 * kopyalanmıştı, koç raporu ekranında ise hiç yoktu — orada kullanıcı ham
 * `estimated_1rm` görüyordu. Kopya sayısı arttıkça birinin unutulması kesin.
 *
 * Backend tarafındaki karşılığı `PRType.label_tr` / `PRType.unit_tr`
 * (`db/models/workout.py`); biri değişirse diğeri de değişmeli.
 */

import type { PersonalRecordRow } from "@/lib/queries";

type PRType = PersonalRecordRow["type"];

const PR_LABEL: Record<string, string> = {
  max_weight: "En ağır set",
  max_reps: "En çok tekrar",
  session_volume: "Seans hacmi",
  estimated_1rm: "Tahmini 1RM",
};

/** Birim türe göre değişiyor: tekrar rekorunu "kg" ile yazmak saçma olurdu. */
const PR_UNIT: Record<string, string> = {
  max_weight: "kg",
  max_reps: "tekrar",
  session_volume: "kg",
  estimated_1rm: "kg",
};

/** Bilinmeyen tür geldiğinde ham değeri göstermek, boş göstermekten iyi. */
export function prLabel(type: PRType | string): string {
  return PR_LABEL[type] ?? type;
}

export function prUnit(type: PRType | string): string {
  return PR_UNIT[type] ?? "";
}
