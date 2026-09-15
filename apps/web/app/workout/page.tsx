"use client";

/**
 * Antrenman Modu — set set yürüyen bir akış.
 *
 * --------------------------------------------------------------------------
 * NEDEN AKIŞ, NEDEN LİSTE DEĞİL
 * --------------------------------------------------------------------------
 * Önceki sürüm bugünün bütün hareketlerini alt alta kartlar hâlinde
 * gösteriyordu — yedi hareket, on üç set, hepsi ekranda. Doğru veriydi ama
 * antrenman sırasında yapılacak iş her an TEK: şu anki set. Geri kalan on iki
 * set o an sadece gürültü ve kullanıcı her sette "neredeydim" diye ekranı
 * taramak zorunda kalıyordu.
 *
 * Şimdi ekranda bir seferde bir adım var. Sıradaki set girilir, dinlenme
 * sayacı ortada büyük görünür, ardından bir sonraki set gelir. Bütün programı
 * görmek isteyen açıkça isteyebiliyor ("Diğer hareketler") ama varsayılan
 * durum odaklanmış tek adım.
 *
 * Adım birimi HAREKET değil SET. "3 set squat" tek adım olsaydı, kullanıcı
 * setler arasında yine kendi kendini yönetmek zorunda kalırdı; oysa setler
 * arası dinlenme antrenmanın yarısı.
 *
 * --------------------------------------------------------------------------
 * ALANLAR ÖNCEDEN DOLU GELİYOR
 * --------------------------------------------------------------------------
 * Motor her hareket için somut bir hedef üretiyor (geçmiş varsa ilerleme
 * önerisi, yoksa vücut ağırlığı ve güce göre tahmini başlangıç). O sayılar
 * girdi alanlarına önceden yazılıyor: kullanıcının işi onaylamak ya da
 * düzeltmek, sıfırdan karar vermek değil.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { InfoTip, Page, PageHeader, Section } from "@/components/Layout";
import {
  createAudioUnlock,
  formatClock,
  useRestCountdown,
  type RestState,
} from "@/components/RestTimer";
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
  type WorkoutSet,
} from "@/lib/queries";

/** Akışın tek adımı: belirli bir hareketin belirli bir seti. */
interface Step {
  exercise: PlannedExercise;
  setNumber: number;
  exerciseIndex: number;
}

interface Draft {
  weight: string;
  reps: string;
  rir: string;
}

/** "100.00" -> "100", "42.50" -> "42,5". Alana geri yazılabilir biçim. */
const weightText = (value: string | number) => {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isNaN(n) ? "" : String(n).replace(".", ",");
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
  const [jump, setJump] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [newRecords, setNewRecords] = useState<PersonalRecordRow[] | null>(null);
  const audio = useRef<AudioContext | null>(null);

  // Devam eden seansı devral. React'in önerdiği "prop değişince state'i
  // ayarla" deseni; `useEffect`'ten bir render daha hızlı.
  if (sessionId === null && today.data?.active_session_id) {
    setSessionId(today.data.active_session_id);
  }

  const workout = today.data;

  const steps: Step[] = useMemo(
    () =>
      (workout?.exercises ?? []).flatMap((exercise, exerciseIndex) =>
        Array.from({ length: exercise.target_sets }, (_, i) => ({
          exercise,
          setNumber: i + 1,
          exerciseIndex,
        })),
      ),
    [workout],
  );

  const loggedSets = session.data?.sets ?? [];
  const findLogged = useCallback(
    (exerciseId: string, setNumber: number): WorkoutSet | undefined =>
      loggedSets.find((s) => s.exercise_id === exerciseId && s.set_number === setNumber),
    [loggedSets],
  );

  // İmleç: kaydedilmemiş ilk set. Kullanıcı listeden başka bir harekete
  // atladıysa o seçim öncelikli (`jump`), ama bir set kaydedilince temizlenip
  // akış kendiliğinden devam ediyor.
  const firstPending = steps.findIndex((s) => !findLogged(s.exercise.exercise_id, s.setNumber));
  const cursor = jump ?? (firstPending === -1 ? steps.length : firstPending);
  const step: Step | undefined = steps[cursor];

  const doneCount = loggedSets.filter((s) => !s.is_warmup).length;

  const onRestDone = useCallback(() => setRest(null), []);
  const { remaining, progress } = useRestCountdown(rest, audio.current, onRestDone);

  const draftKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;

  /**
   * Alanların gösterilecek değeri.
   *
   * Sıra önemli: kaydedilmiş set varsa SUNUCUDAN, kullanıcı bir şey yazdıysa
   * taslaktan, aksi halde MOTORUN ÖNERİSİNDEN. Üçüncü basamak kullanıcının
   * "kaç kilo kaldırmalıyım" sorusuna verilen cevabın alana yazılmış hâli.
   */
  const valuesFor = (target: Step): Draft => {
    const logged = findLogged(target.exercise.exercise_id, target.setNumber);
    if (logged) {
      return {
        weight: weightText(logged.weight_kg),
        reps: String(logged.reps),
        rir: logged.rir === null ? "" : String(logged.rir),
      };
    }

    const typed = drafts[draftKey(target.exercise.exercise_id, target.setNumber)];
    if (typed) return typed;

    const suggestion = target.exercise.progression;
    return {
      // Vücut ağırlığı hareketinde öneri 0 kg; alan boş kalmalı.
      weight: suggestion && Number.parseFloat(suggestion.weight_kg) > 0
        ? weightText(suggestion.weight_kg)
        : "",
      reps: suggestion ? String(suggestion.reps) : "",
      rir: "",
    };
  };

  const updateDraft = (key: string, patch: Partial<Draft>, base: Draft) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...base, ...prev[key], ...patch } }));

  const submit = async () => {
    if (!sessionId || !step) return;
    const values = valuesFor(step);
    if (!values.reps) return;

    audio.current ??= createAudioUnlock();

    await logSet.mutateAsync({
      sessionId,
      exercise_id: step.exercise.exercise_id,
      set_number: step.setNumber,
      // Türkçe klavyede virgül yazılabiliyor; nokta bekleyen API'ye
      // göndermeden önce normalize ediliyor.
      weight_kg: values.weight ? Number.parseFloat(values.weight.replace(",", ".")) : 0,
      reps: Number.parseInt(values.reps, 10),
      rir: values.rir === "" ? null : Number.parseInt(values.rir, 10),
      technique: step.exercise.technique,
    });

    setJump(null); // akış kendiliğinden ilerlesin

    // Son set kaydedildiyse dinlenmeye gerek yok.
    const isLast = cursor >= steps.length - 1;
    if (!isLast) {
      const seconds = step.exercise.rest_seconds ?? 150;
      setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
    }
  };

  if (today.isLoading) return <Loading />;
  if (today.isError)
    return <ErrorBox error={today.error} onRetry={() => void today.refetch()} />;

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

  if (newRecords !== null) {
    return <Celebration records={newRecords} doneCount={doneCount} />;
  }

  const allDone = cursor >= steps.length;

  return (
    <Page>
      <PageHeader
        title={workout.day_label ?? "Antrenman"}
        lead={workout.program_name ?? undefined}
        actions={
          sessionId !== null && (
            <button
              className="btn btn-ghost"
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

      <Progress done={doneCount} total={steps.length} />

      {startSession.isError && <ErrorBox error={startSession.error} />}
      {logSet.isError && <ErrorBox error={logSet.error} />}
      {complete.isError && <ErrorBox error={complete.error} />}

      {/* --- Sahne: bir seferde tek adım --- */}
      {sessionId === null ? (
        <Intro
          exerciseCount={workout.exercises.length}
          setCount={steps.length}
          pending={startSession.isPending}
          onStart={async () => {
            audio.current ??= createAudioUnlock();
            const created = await startSession.mutateAsync({
              program_day_id: workout.program_day_id,
            });
            setSessionId(created.id);
          }}
        />
      ) : rest !== null ? (
        <RestStage
          remaining={remaining}
          progress={progress}
          next={step}
          onSkip={() => setRest(null)}
        />
      ) : allDone ? (
        <AllDoneStage
          pending={complete.isPending}
          onFinish={async () => {
            if (!sessionId) return;
            const result = await complete.mutateAsync(sessionId);
            setNewRecords(result.new_records);
          }}
        />
      ) : step ? (
        <SetStage
          step={step}
          values={valuesFor(step)}
          pending={logSet.isPending}
          onChange={(patch) =>
            updateDraft(
              draftKey(step.exercise.exercise_id, step.setNumber),
              patch,
              valuesFor(step),
            )
          }
          onSubmit={submit}
        />
      ) : null}

      {/* --- İsteğe bağlı: bütün gün --- */}
      <OtherExercises
        steps={steps}
        cursor={cursor}
        open={showAll}
        onToggle={() => setShowAll((v) => !v)}
        findLogged={findLogged}
        onJump={(index) => {
          setJump(index);
          setRest(null);
          setShowAll(false);
        }}
      />
    </Page>
  );
}

/* --- İlerleme ------------------------------------------------------------- */

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
            transition: "width var(--dur-short) var(--ease-out)",
          }}
        />
      </div>
      <p className="tnum shrink-0 text-sm text-[var(--color-ink-muted)]">
        {done} / {total} set
      </p>
    </div>
  );
}

/* --- Sahneler ------------------------------------------------------------- */

/** Ortak sahne kabuğu: her durum aynı yükseklikte, aynı hizada. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <section className="card flex min-h-[26rem] flex-col items-center justify-center gap-6 px-8 py-12 text-center">
      {children}
    </section>
  );
}

function Intro({
  exerciseCount,
  setCount,
  pending,
  onStart,
}: {
  exerciseCount: number;
  setCount: number;
  pending: boolean;
  onStart: () => void;
}) {
  return (
    <Stage>
      <p className="label">Bugün</p>
      <p className="display text-3xl">
        {exerciseCount} hareket · {setCount} set
      </p>
      <p className="max-w-[38ch] text-sm text-[var(--color-ink-muted)]">
        Setler sırayla gelecek. Ağırlıklar geçmişine ve gücüne göre önceden
        dolu; onayla ya da düzelt.
      </p>
      <button className="btn btn-primary px-8 py-3.5 text-base" disabled={pending} onClick={onStart}>
        {pending ? "Başlatılıyor…" : "Antrenmanı başlat"}
      </button>
    </Stage>
  );
}

function RestStage({
  remaining,
  progress,
  next,
  onSkip,
}: {
  remaining: number;
  progress: number;
  next: Step | undefined;
  onSkip: () => void;
}) {
  const circumference = 2 * Math.PI * 46;
  return (
    <Stage>
      <p className="label">Dinlenme</p>

      <div className="relative grid size-[15rem] place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-border)" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="var(--color-accent-deep)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${progress * circumference} ${circumference}`}
          />
        </svg>
        {/* Sayaç ekranın ortasında ve büyük — akışın o anki tek işi beklemek. */}
        <p className="figure tnum text-[4.5rem]" role="timer">
          {formatClock(remaining)}
        </p>
      </div>

      {next ? (
        <div>
          <p className="label">Sırada</p>
          <p className="mt-1 text-md font-medium">{next.exercise.name}</p>
          <p className="tnum mt-0.5 text-sm text-[var(--color-ink-muted)]">
            Set {next.setNumber} / {next.exercise.target_sets}
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Son set tamamlandı.</p>
      )}

      <button className="btn btn-ghost" onClick={onSkip}>
        Dinlenmeyi atla
      </button>
    </Stage>
  );
}

/**
 * Motorun kararının kısa adı.
 *
 * Motorun tam mesajı üç satır olabiliyor ("İlk kez yapıyorsun. Boyun, kilon
 * ve diğer hareketlerdeki gücüne göre…"). Akış ekranında o kadar metin
 * okunmuyor; kısa etiket ne olduğunu söylüyor, gerekçenin tamamı "?"
 * arkasında duruyor.
 */
const KIND_LABEL: Record<string, string> = {
  establish_baseline: "Tahmini başlangıç",
  add_weight: "Ağırlık artışı",
  add_reps: "Bir tekrar daha",
  hold: "Aynı ağırlıkta kal",
  deload: "Deload",
};

function SetStage({
  step,
  values,
  pending,
  onChange,
  onSubmit,
}: {
  step: Step;
  values: Draft;
  pending: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSubmit: () => void;
}) {
  const { exercise, setNumber } = step;
  const suggestion = exercise.progression;
  const ready = values.reps.trim().length > 0;

  return (
    <Stage>
      <div>
        <p className="label">
          Set {setNumber} / {exercise.target_sets}
        </p>
        {/* 3xl deneyip geri alındı: sıkışık display yüzü o puntoda ekranı
            domine ediyor ve alanları alta itiyordu. Odak sayılarda olmalı. */}
        <h2 className="display mt-2 text-xl lg:text-2xl">{exercise.name}</h2>
      </div>

      <form
        className="flex flex-col items-center gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !pending) onSubmit();
        }}
      >
        {/* Alanlar önerilen değerlerle DOLU geliyor; hedefi ayrıca büyük
            yazmak aynı bilgiyi iki kez göstermek olurdu. Alanların kendisi
            hedef. */}
        <div className="flex items-end gap-3">
          <Field
            label="kg"
            value={values.weight}
            onChange={(v) => onChange({ weight: v })}
            autoFocus
          />
          <Field label="Tekrar" value={values.reps} onChange={(v) => onChange({ reps: v })} />
          <Field label="RIR" value={values.rir} onChange={(v) => onChange({ rir: v })} />
        </div>

        {suggestion && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex items-center gap-2">
              <span className="label">{KIND_LABEL[suggestion.kind] ?? "Hedef"}</span>
              <InfoTip label="Bu hedef nasıl belirlendi">
                {suggestion.message}
                {suggestion.warnings.length > 0 && (
                  <span className="mt-2 block" style={{ color: "var(--color-warning)" }}>
                    {suggestion.warnings.join(" ")}
                  </span>
                )}
              </InfoTip>
            </span>
            {exercise.last_session_summary && (
              <p className="tnum text-xs text-[var(--color-ink-faint)]">
                Geçen sefer: {exercise.last_session_summary}
              </p>
            )}
            {suggestion.warnings.length > 0 && (
              <p className="max-w-[40ch] text-xs" style={{ color: "var(--color-warning)" }}>
                {suggestion.warnings[0]}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary px-8 py-3.5 text-base"
          disabled={!ready || pending}
        >
          {pending ? "Kaydediliyor…" : "Seti kaydet"}
        </button>
      </form>
    </Stage>
  );
}

function AllDoneStage({ pending, onFinish }: { pending: boolean; onFinish: () => void }) {
  return (
    <Stage>
      <span
        aria-hidden
        className="animate-check grid size-14 place-items-center rounded-full"
        style={{ background: "var(--color-accent)" }}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <p className="display text-3xl">Bütün setler tamam</p>
      <button
        className="btn btn-primary px-8 py-3.5 text-base"
        disabled={pending}
        onClick={onFinish}
      >
        {pending ? "Kapatılıyor…" : "Antrenmanı bitir"}
      </button>
    </Stage>
  );
}

function Field({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col items-center gap-1.5">
      <span className="label">{label}</span>
      <input
        // inputMode="decimal": sayısal klavye açar ama virgül de yazılabilir.
        // type="number" kullanılmıyor — iOS'ta ok tuşları alanı daraltıyor.
        inputMode="decimal"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className="field figure h-16 w-[6.5rem] text-center text-xl"
      />
    </label>
  );
}

/* --- İsteğe bağlı tam program --------------------------------------------- */

function OtherExercises({
  steps,
  cursor,
  open,
  onToggle,
  findLogged,
  onJump,
}: {
  steps: Step[];
  cursor: number;
  open: boolean;
  onToggle: () => void;
  findLogged: (exerciseId: string, setNumber: number) => WorkoutSet | undefined;
  onJump: (index: number) => void;
}) {
  // Hareket başına grupla: liste set değil hareket düzeyinde okunuyor.
  const byExercise = new Map<number, { exercise: PlannedExercise; firstStep: number }>();
  steps.forEach((step, index) => {
    if (!byExercise.has(step.exerciseIndex)) {
      byExercise.set(step.exerciseIndex, { exercise: step.exercise, firstStep: index });
    }
  });

  const current = steps[cursor]?.exerciseIndex;

  return (
    <Section bare>
      <button className="btn btn-quiet -ml-2.5" onClick={onToggle} aria-expanded={open}>
        {open ? "Diğer hareketleri gizle" : "Diğer hareketleri gör"}
      </button>

      {open && (
        <ul className="mt-3 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
          {[...byExercise.entries()].map(([exerciseIndex, { exercise, firstStep }]) => {
            const done = Array.from({ length: exercise.target_sets }, (_, i) =>
              findLogged(exercise.exercise_id, i + 1),
            ).filter(Boolean).length;
            const isCurrent = exerciseIndex === current;

            return (
              <li key={exercise.program_exercise_id}>
                <button
                  onClick={() => onJump(firstStep)}
                  className="flex w-full items-center gap-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  <span
                    aria-hidden
                    className="h-6 w-[3px] shrink-0 rounded-full"
                    style={{
                      background: isCurrent ? "var(--color-accent-deep)" : "transparent",
                    }}
                  />
                  <span className={`min-w-0 flex-1 truncate text-sm ${isCurrent ? "font-medium" : ""}`}>
                    {exercise.name}
                  </span>
                  <span className="tnum shrink-0 text-xs text-[var(--color-ink-muted)]">
                    {done} / {exercise.target_sets} set
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
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
