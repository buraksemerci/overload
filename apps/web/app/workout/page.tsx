"use client";

/**
 * Antrenman Modu.
 *
 * Masaüstü için tasarlandı. Set girişi artık her satırda yer tutucu tekrar
 * eden kutular değil, başlıklı bir tablo: "kg / tekrar / RIR" bir kez yazılıyor
 * ve altındaki satırlar sadece sayı taşıyor. Genişlik arttığı için okunması
 * kolaylaşıyor, dikey yer de azalıyor — yedi hareketli bir gün tek ekrana
 * sığabiliyor.
 *
 * Her set ANINDA sunucuya yazılıyor. Sekme kapanır, bağlantı kopar, tarayıcı
 * çöker — yarım antrenman kaybolmuyor.
 */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Page, PageHeader, Section } from "@/components/Layout";
import { createAudioUnlock, RestTimer, type RestState } from "@/components/RestTimer";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import {
  useCompleteSession,
  useLogSet,
  useSession,
  useStartSession,
  useToday,
  type PersonalRecordRow,
  type PlannedExercise,
} from "@/lib/queries";

interface Draft {
  weight: string;
  reps: string;
  rir: string;
}

/** "100.00" -> "100", "42.50" -> "42,5". Alana geri yazılabilir biçim;
 *  gönderimde virgül zaten noktaya çevriliyor. */
const weightText = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? value : String(n).replace(".", ",");
};

export default function WorkoutPage() {
  const today = useToday();
  const startSession = useStartSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const session = useSession(sessionId);
  const logSet = useLogSet();
  const complete = useCompleteSession();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rest, setRest] = useState<RestState | null>(null);
  const [newRecords, setNewRecords] = useState<PersonalRecordRow[] | null>(null);
  // Ses bağlamı kullanıcı dokunmasında açılıyor; sayfa yüklenirken
  // oluşturulan bağlam iOS'ta sessiz kalıyor.
  const audio = useRef<AudioContext | null>(null);

  // Devam eden seansı devral. `useState` başlangıç değeri olarak veremiyoruz:
  // veri ilk render'da henüz gelmemiş oluyor.
  if (sessionId === null && today.data?.active_session_id) {
    setSessionId(today.data.active_session_id);
  }

  const draftKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;

  const updateDraft = useCallback((key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { weight: "", reps: "", rir: "", ...prev[key], ...patch },
    }));
  }, []);

  const submitSet = useCallback(
    async (exercise: PlannedExercise, setNumber: number) => {
      if (!sessionId) return;
      const key = draftKey(exercise.exercise_id, setNumber);
      const draft = drafts[key];
      if (!draft?.weight || !draft.reps) return;

      audio.current ??= createAudioUnlock();

      await logSet.mutateAsync({
        sessionId,
        exercise_id: exercise.exercise_id,
        set_number: setNumber,
        // Türkçe klavyede virgül yazılabiliyor; nokta bekleyen API'ye
        // göndermeden önce normalize ediyoruz.
        weight_kg: Number.parseFloat(draft.weight.replace(",", ".")),
        reps: Number.parseInt(draft.reps, 10),
        rir: draft.rir === "" ? null : Number.parseInt(draft.rir, 10),
        technique: exercise.technique,
      });

      const seconds = exercise.rest_seconds ?? 150;
      setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
    },
    [drafts, logSet, sessionId],
  );

  if (today.isLoading) return <Loading />;
  if (today.isError)
    return <ErrorBox error={today.error} onRetry={() => void today.refetch()} />;

  const workout = today.data;
  if (!workout || workout.exercises.length === 0) {
    return (
      <Page>
        <Empty
          title="Bugün için planlanmış antrenman yok"
          hint="Önce bir program seçip aktif hâle getirmen gerekiyor."
          action={
            <Link href="/programs" className="btn btn-primary">
              Programlara git
            </Link>
          }
        />
      </Page>
    );
  }

  const loggedSets = session.data?.sets ?? [];
  const loggedSet = (exerciseId: string, setNumber: number) =>
    loggedSets.find((s) => s.exercise_id === exerciseId && s.set_number === setNumber);

  const totalPlanned = workout.exercises.reduce((sum, e) => sum + e.target_sets, 0);
  const doneCount = loggedSets.filter((s) => !s.is_warmup).length;

  if (newRecords !== null) {
    return <Celebration records={newRecords} doneCount={doneCount} />;
  }

  return (
    <Page>
      <PageHeader
        title={workout.day_label ?? "Antrenman"}
        lead={workout.program_name ?? undefined}
        actions={
          sessionId === null ? (
            <button
              className="btn btn-primary"
              disabled={startSession.isPending}
              onClick={async () => {
                audio.current ??= createAudioUnlock();
                const created = await startSession.mutateAsync({
                  program_day_id: workout.program_day_id,
                });
                setSessionId(created.id);
              }}
            >
              {startSession.isPending ? "Başlatılıyor…" : "Antrenmanı başlat"}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={doneCount === 0 || complete.isPending}
              onClick={async () => {
                const result = await complete.mutateAsync(sessionId);
                setNewRecords(result.new_records);
              }}
            >
              {complete.isPending ? "Kapatılıyor…" : "Antrenmanı bitir"}
            </button>
          )
        }
      />

      <Progress done={doneCount} total={totalPlanned} />

      {startSession.isError && <ErrorBox error={startSession.error} />}
      {logSet.isError && <ErrorBox error={logSet.error} />}
      {complete.isError && <ErrorBox error={complete.error} />}

      {workout.exercises.map((exercise, index) => (
        <ExerciseCard
          key={exercise.program_exercise_id}
          exercise={exercise}
          index={index}
          locked={sessionId === null}
          loggedSet={loggedSet}
          drafts={drafts}
          draftKey={draftKey}
          updateDraft={updateDraft}
          onSubmit={submitSet}
        />
      ))}

      {rest && (
        <RestTimer
          rest={rest}
          audio={audio.current}
          onDone={() => setRest(null)}
          onSkip={() => setRest(null)}
        />
      )}
    </Page>
  );
}

/* --- İlerleme çubuğu ------------------------------------------------------ */

function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${ratio * 100}%`,
            background: "var(--color-accent)",
            transition: `width var(--dur-short) var(--ease-out)`,
          }}
        />
      </div>
      <p className="tnum shrink-0 text-sm text-[var(--color-ink-muted)]">
        {done} / {total} set
      </p>
    </div>
  );
}

/* --- Hareket kartı -------------------------------------------------------- */

function ExerciseCard({
  exercise,
  index,
  locked,
  loggedSet,
  drafts,
  draftKey,
  updateDraft,
  onSubmit,
}: {
  exercise: PlannedExercise;
  index: number;
  locked: boolean;
  loggedSet: (exerciseId: string, setNumber: number) => { weight_kg: string; reps: number; rir: number | null } | undefined;
  drafts: Record<string, Draft>;
  draftKey: (exerciseId: string, setNumber: number) => string;
  updateDraft: (key: string, patch: Partial<Draft>) => void;
  onSubmit: (exercise: PlannedExercise, setNumber: number) => void;
}) {
  const reps =
    exercise.target_rep_min === exercise.target_rep_max
      ? String(exercise.target_rep_min)
      : `${exercise.target_rep_min}-${exercise.target_rep_max}`;

  return (
    <Section
      className="reveal"
      title={exercise.name}
      actions={
        <span className="tnum text-sm text-[var(--color-ink-muted)]">
          {exercise.target_sets} × {reps}
          {exercise.technique !== "straight" && (
            <span className="ml-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-1.5 py-0.5 text-2xs">
              {exercise.technique}
            </span>
          )}
          {exercise.superset_group !== null && (
            <span className="ml-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-1.5 py-0.5 text-2xs">
              superset {exercise.superset_group}
            </span>
          )}
        </span>
      }
    >
      <div style={{ "--i": index + 1 } as React.CSSProperties} />

      {/* Motorun çıktısı — bu ekranın var olma sebebi. Kendi yüzeyi var. */}
      {exercise.progression && (
        <div className="mb-5 rounded-[var(--radius-md)] bg-[var(--color-surface-raised)] p-4">
          <p className="text-sm">{exercise.progression.message}</p>
          {exercise.progression.warnings.map((warning, i) => (
            <p key={i} className="mt-2 text-xs" style={{ color: "var(--color-warning)" }}>
              {warning}
            </p>
          ))}
          {exercise.last_session_summary && (
            <p className="tnum mt-2 text-xs text-[var(--color-ink-faint)]">
              Geçen sefer: {exercise.last_session_summary}
            </p>
          )}
        </div>
      )}

      {/* Sütun başlıkları bir kez. Önceden her satırdaki üç kutuda yer tutucu
          olarak tekrarlanıyordu; masaüstü genişliğinde bu gereksiz gürültü.

          Genişlikler SABİT, `1fr` değil. Esnek kolonlar 1440px'te üç haneli bir
          sayı için 180 piksellik kutular üretiyordu: hem israf, hem göz her
          satırda gereksiz yol alıyor. Sağda kalan boşluk kasıtlı — ızgarayı
          sola yığmak satırları taranabilir tutuyor. */}
      <div className="grid w-fit grid-cols-[1.75rem_6rem_6rem_6rem_2.75rem] items-center gap-x-3 gap-y-2">
        <span className="label">Set</span>
        <span className="label text-center">kg</span>
        <span className="label text-center">Tekrar</span>
        <span className="label text-center">RIR</span>
        <span />

        {Array.from({ length: exercise.target_sets }, (_, i) => {
          const setNumber = i + 1;
          const key = draftKey(exercise.exercise_id, setNumber);
          const logged = loggedSet(exercise.exercise_id, setNumber);
          const done = logged !== undefined;

          // Tamamlanmış setin değerleri SUNUCUDAN okunuyor, taslaktan değil.
          // `drafts` yalnızca bellekte; sayfa yenilenince boşalıyor ve
          // girilmiş setler boş kutu görünüyordu.
          const draft = logged
            ? {
                weight: weightText(logged.weight_kg),
                reps: String(logged.reps),
                rir: logged.rir === null ? "" : String(logged.rir),
              }
            : (drafts[key] ?? { weight: "", reps: "", rir: "" });

          const ready = Boolean(draft.weight && draft.reps);

          return (
            <div key={setNumber} className="col-span-5 grid grid-cols-subgrid items-center">
              <span className="tnum text-sm text-[var(--color-ink-faint)]">{setNumber}</span>
              <NumberField
                label={`Set ${setNumber} ağırlık`}
                value={draft.weight}
                onChange={(v) => updateDraft(key, { weight: v })}
                disabled={done || locked}
              />
              <NumberField
                label={`Set ${setNumber} tekrar`}
                value={draft.reps}
                onChange={(v) => updateDraft(key, { reps: v })}
                disabled={done || locked}
              />
              <NumberField
                label={`Set ${setNumber} RIR`}
                value={draft.rir}
                onChange={(v) => updateDraft(key, { rir: v })}
                disabled={done || locked}
              />
              <button
                type="button"
                aria-label={`Set ${setNumber} tamamlandı`}
                disabled={done || locked || !ready}
                onClick={() => onSubmit(exercise, setNumber)}
                className={`grid size-11 place-items-center rounded-[var(--radius-md)] border transition-colors ${
                  done
                    ? "border-transparent bg-[var(--color-accent)] text-[var(--color-ink)]"
                    : "border-[var(--color-border-strong)] text-[var(--color-ink-faint)] hover:border-[var(--color-ink-faint)] disabled:opacity-35"
                }`}
                style={{ transitionDuration: "var(--dur-micro)" }}
              >
                <span className={done ? "animate-check" : undefined} aria-hidden>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={done ? 3 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <input
        // inputMode="decimal": sayısal klavye açar ama virgül de yazılabilir.
        // type="number" kullanılmıyor — iOS'ta ok tuşları alanı daraltıyor.
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        // Kaydedilmiş set: dolu yüzey + tam okunur metin. Değer artık veri,
        // girdi değil — soluklaştırmak onu okunmaz yapardı.
        // Seans başlamamış: yalnızca kenarlık soluklaşıyor, kutu dolmuyor;
        // dolgulu gri kutular sayfayı ağır gri bloklara çeviriyordu.
        className="field tnum h-11 w-full text-center disabled:border-[var(--color-border)] disabled:bg-transparent disabled:text-[var(--color-ink-muted)]"
      />
    </label>
  );
}

/* --- Rekor kutlaması ------------------------------------------------------ */

function Celebration({
  records,
  doneCount,
}: {
  records: PersonalRecordRow[];
  doneCount: number;
}) {
  return (
    <Page>
      <PageHeader title="Antrenman bitti" />

      {records.length > 0 ? (
        <Section title={`${records.length} yeni rekor`}>
          <ul className="divide-y divide-[var(--color-border)]">
            {records.map((record, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-3">
                <span className="flex items-center gap-2.5 text-sm">
                  <span
                    aria-hidden
                    className="animate-check grid size-5 shrink-0 place-items-center rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-ink)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {prLabel(record.type)}
                </span>
                <span className="tnum text-sm">
                  {fmt(record.value, 1)} {prUnit(record.type)}
                  {record.reps !== null && ` × ${record.reps}`}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Bu seansta rekor kırılmadı — ama {doneCount} set tamamladın, hacim birikiyor.
          </p>
        </Section>
      )}

      <div className="flex gap-3">
        <Link href="/" className="btn btn-primary">
          Panele dön
        </Link>
        <Link href="/progress" className="btn btn-ghost">
          İlerlemeyi gör
        </Link>
      </div>
    </Page>
  );
}
