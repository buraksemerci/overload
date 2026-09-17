"use client";

/**
 * Antrenman — set set akış.
 *
 * --------------------------------------------------------------------------
 * DÜZEN
 * --------------------------------------------------------------------------
 * Bant: günün adı, programın adı ve üç sayı — tamamlanan set, geçen süre,
 * kalan hareket. Altında iki kolon:
 *
 *   - SOLDA SAHNE: bir seferde tek iş. Başlamadan önce günün özeti, set
 *     sırasında büyük sayı alanları, set arasında dev bir sayaç.
 *   - SAĞDA GÜNÜN HARİTASI: bütün hareketler, her birinin set noktaları,
 *     o anki hareket işaretli. Önce "diğer hareketleri gör" düğmesinin
 *     arkasındaydı ve geniş ekranda sahnenin iki yanı boş kalıyordu; sıradaki
 *     hareketi görmek için bir düğmeye basmak gerekiyordu. Harita dokununca
 *     o harekete atlıyor.
 *
 * --------------------------------------------------------------------------
 * SALONDA KULLANILAN EKRAN
 * --------------------------------------------------------------------------
 * - Ekran seans boyunca KARARMIYOR (Wake Lock). Telefon masada dururken
 *   30 saniyede kararan ekran dinlenme sayacını gizliyordu.
 * - Ağırlık ve tekrar alanlarının yanında büyük +/− düğmeleri; tereli elle
 *   küçük bir sayı alanına dokunmak yerine. Adım ekipmana göre (bar 2,5 kg).
 * - Bar hareketlerinde PLAKA HESABI: "92,5 kg için bir tarafa 25 + 10 + 1,25".
 * - Dinlenme ±15 sn uzatılıp kısaltılabiliyor; bitince titreşim ve ses.
 * - Yazılan ama kaydedilmemiş değerler sayfa yenilense de kalıyor.
 *
 * --------------------------------------------------------------------------
 * VOLT BÜTÇESİ
 * --------------------------------------------------------------------------
 * Sahnenin birincil düğmesi ve ilerleme çubuğu. Sayaç halkası ve harita
 * işaretleri ince çizgi (`accent-deep`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Hero, HeroStat, HeroStats, InfoTip, Page } from "@/components/Layout";
import {
  createAudioUnlock,
  formatClock,
  useRestCountdown,
  type RestState,
} from "@/components/RestTimer";
import { Photo } from "@/components/Photo";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, fmt } from "@/components/States";
import { formatElapsed, useHotkeys, useNow, useWakeLock } from "@/lib/device";
import { prLabel, prUnit } from "@/lib/labels";
import { barFor, plateLoad, weightStep } from "@/lib/plates";
import {
  useCompleteSession,
  useDeleteSession,
  useDeleteSet,
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
  /**
   * Isınma seti mi?
   *
   * Isınma setleri hacme, rekora ve ilerleme motoruna GİRMİYOR (sunucu
   * `is_warmup` alanına bakıyor). Ekranda kaydedilebilmeleri gerekiyordu:
   * kullanıcı ısınmasını da yazmak istiyor ama o setler "bugün 5 set yaptım"
   * sayısını şişirmemeli. Eski taslaklarda alan yok — `?` o yüzden.
   */
  warmup?: boolean;
}

/** "100.00" -> "100", "42.50" -> "42,5". Alana geri yazılabilir biçim. */
const weightText = (value: string | number) => {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isNaN(n) ? "" : String(n).replace(".", ",");
};

const parseWeight = (value: string) => Number.parseFloat(value.replace(",", "."));

/* --- Taslak kalıcılığı ------------------------------------------------------ */

const draftStorageKey = (sessionId: string) => `overload.drafts.${sessionId}`;

function loadDrafts(sessionId: string): Record<string, Draft> {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(sessionId));
    return raw ? (JSON.parse(raw) as Record<string, Draft>) : {};
  } catch {
    return {};
  }
}

function saveDrafts(sessionId: string, drafts: Record<string, Draft>): void {
  try {
    window.localStorage.setItem(draftStorageKey(sessionId), JSON.stringify(drafts));
  } catch {
    // Gizli sekme ya da dolu depolama: taslak yalnızca bellekte kalır.
  }
}

export default function WorkoutPage() {
  const today = useToday();
  const startSession = useStartSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const session = useSession(sessionId);
  const logSet = useLogSet();
  const deleteSet = useDeleteSet();
  const deleteSession = useDeleteSession();
  const complete = useCompleteSession();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [draftsFor, setDraftsFor] = useState<string | null>(null);
  /**
   * Plandan FAZLA set: "bugün bir set daha" salonda sık verilen bir karar ve
   * program yüzünden engellenmemeli. Sunucu plan dışı sıra numarasını zaten
   * kabul ediyor (aynı slot gönderilirse üzerine yazıyor); eksik olan tek şey
   * ekranda o slotun açılmasıydı.
   */
  const [extra, setExtra] = useState<Record<string, number>>({});
  /** İptal onayı açık mı? Yıkıcı iş: tek dokunuşla olmuyor. */
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rest, setRest] = useState<RestState | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const [newRecords, setNewRecords] = useState<PersonalRecordRow[] | null>(null);
  const audio = useRef<AudioContext | null>(null);

  // Devam eden seansı devral.
  if (sessionId === null && today.data?.active_session_id) {
    setSessionId(today.data.active_session_id);
  }

  // Seans değişince o seansın kayıtlı taslaklarını yükle (render sırasında,
  // "prop değişince state'i ayarla" deseni).
  if (sessionId !== null && draftsFor !== sessionId && typeof window !== "undefined") {
    setDraftsFor(sessionId);
    setDrafts(loadDrafts(sessionId));
  }

  useEffect(() => {
    if (sessionId !== null && draftsFor === sessionId) saveDrafts(sessionId, drafts);
  }, [sessionId, draftsFor, drafts]);

  const workout = today.data;

  const loggedSets = useMemo(() => session.data?.sets ?? [], [session.data]);

  /**
   * Hareket başına kaydedilmiş EN YÜKSEK set sırası.
   *
   * Plandan fazla set eklendiğinde (aşağıdaki `extra`) o slotlar yalnızca
   * bellekte duruyor; sayfa yenilenince kaybolmasınlar diye sunucudaki
   * kayıtlardan yeniden türetiliyor. Yoksa kaydedilmiş 4. set, üç setlik
   * planın içinde görünmez oluyordu.
   */
  const maxLoggedSet = useMemo(() => {
    const map = new Map<string, number>();
    for (const set of loggedSets) {
      map.set(set.exercise_id, Math.max(map.get(set.exercise_id) ?? 0, set.set_number));
    }
    return map;
  }, [loggedSets]);

  const steps: Step[] = useMemo(
    () =>
      (workout?.exercises ?? []).flatMap((exercise, exerciseIndex) => {
        const planned = Math.max(
          exercise.target_sets + (extra[exercise.exercise_id] ?? 0),
          maxLoggedSet.get(exercise.exercise_id) ?? 0,
        );
        return Array.from({ length: planned }, (_, i) => ({
          exercise,
          setNumber: i + 1,
          exerciseIndex,
        }));
      }),
    [workout, extra, maxLoggedSet],
  );
  const findLogged = useCallback(
    (exerciseId: string, setNumber: number): WorkoutSet | undefined =>
      loggedSets.find((s) => s.exercise_id === exerciseId && s.set_number === setNumber),
    [loggedSets],
  );

  // İmleç: kaydedilmemiş ilk set. Haritadan atlandıysa o seçim öncelikli.
  const firstPending = steps.findIndex((s) => !findLogged(s.exercise.exercise_id, s.setNumber));
  const cursor = jump ?? (firstPending === -1 ? steps.length : firstPending);
  const step: Step | undefined = steps[cursor];

  const doneCount = loggedSets.filter((s) => !s.is_warmup).length;
  const volume = loggedSets
    .filter((s) => !s.is_warmup)
    .reduce((sum, s) => sum + Number.parseFloat(s.weight_kg) * s.reps, 0);

  const active = sessionId !== null && newRecords === null;
  useWakeLock(active);
  const now = useNow(1000, active);
  const startedAt = session.data?.started_at ? new Date(session.data.started_at).getTime() : null;

  const onRestDone = useCallback(() => setRest(null), []);
  const { remaining, progress } = useRestCountdown(rest, audio, onRestDone);

  const draftKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;

  const resting = rest !== null;

  const skipRest = useCallback(() => setRest(null), []);
  const adjustRest = useCallback(
    (seconds: number) =>
      setRest((current) =>
        current === null
          ? current
          : {
              endsAt: Math.max(Date.now() + 1000, current.endsAt + seconds * 1000),
              total: Math.max(1, current.total + seconds),
            },
      ),
    [],
  );

  /**
   * Alanların gösterilecek değeri. Kaydedilmiş set varsa SUNUCUDAN, kullanıcı
   * bir şey yazdıysa taslaktan, aksi halde MOTORUN ÖNERİSİNDEN.
   */
  const valuesFor = (target: Step): Draft => {
    const logged = findLogged(target.exercise.exercise_id, target.setNumber);
    if (logged) {
      return {
        weight: weightText(logged.weight_kg),
        reps: String(logged.reps),
        rir: logged.rir === null ? "" : String(logged.rir),
        warmup: logged.is_warmup,
      };
    }

    const typed = drafts[draftKey(target.exercise.exercise_id, target.setNumber)];
    if (typed) return typed;

    const suggestion = target.exercise.progression;
    return {
      // Vücut ağırlığı hareketinde öneri 0 kg; alan boş kalmalı.
      weight:
        suggestion && Number.parseFloat(suggestion.weight_kg) > 0 ? weightText(suggestion.weight_kg) : "",
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
      // Türkçe klavyede virgül yazılabiliyor; API'ye göndermeden normalize.
      weight_kg: values.weight ? parseWeight(values.weight) : 0,
      reps: Number.parseInt(values.reps, 10),
      rir: values.rir === "" ? null : Number.parseInt(values.rir, 10),
      is_warmup: values.warmup === true,
      technique: step.exercise.technique,
    });

    setJump(null);

    // Son set kaydedildiyse dinlenmeye gerek yok.
    const isLast = cursor >= steps.length - 1;
    if (!isLast) {
      const seconds = step.exercise.rest_seconds ?? 150;
      setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
    }
  };

  /**
   * Bu seti kaldır.
   *
   * İki durum tek düğmede: kaydedilmiş set siliniyor, plana fazladan açılmış
   * boş slot ise geri alınıyor. Kullanıcı açısından ikisi de "bu set olmasın".
   */
  const removeCurrent = async () => {
    if (!step) return;
    const logged = findLogged(step.exercise.exercise_id, step.setNumber);
    if (logged && sessionId) {
      await deleteSet.mutateAsync({ setId: logged.id, sessionId });
    }
    // Fazladan açılan slot da kapanıyor — yoksa boş bir slot ekranda kalıyor.
    if (step.setNumber > step.exercise.target_sets) {
      setExtra((current) => {
        const count = current[step.exercise.exercise_id] ?? 0;
        if (count <= 0) return current;
        return { ...current, [step.exercise.exercise_id]: count - 1 };
      });
    }
    setJump(null);
  };

  /** Seansı tümden sil. Onay panelinden geçiyor. */
  const cancelSession = async () => {
    if (!sessionId) return;
    await deleteSession.mutateAsync(sessionId);
    try {
      window.localStorage.removeItem(draftStorageKey(sessionId));
    } catch {
      // yok say
    }
    setConfirmCancel(false);
    setSessionId(null);
    setDrafts({});
    setDraftsFor(null);
    setExtra({});
    setJump(null);
    setRest(null);
  };

  const finish = async () => {
    if (!sessionId) return;
    const result = await complete.mutateAsync(sessionId);
    try {
      window.localStorage.removeItem(draftStorageKey(sessionId));
    } catch {
      // yok say
    }
    setNewRecords(result.new_records);
  };

  /**
   * Klavye kısayolları.
   *
   * Salonda telefon kullanılıyor ama masaüstünde antrenman girmek de bir
   * senaryo (evde, dizüstüyle). Her kısayolun ekranda görünen bir düğmesi
   * var — kısayol alternatif, tek yol değil. Bir alana yazarken çalışmıyor
   * (`useHotkeys` odağa bakıyor), yoksa kilo alanına "+" yazılamazdı.
   */
  useHotkeys(
    resting
      ? {
          Enter: skipRest,
          " ": skipRest,
          ArrowRight: () => adjustRest(15),
          ArrowLeft: () => adjustRest(-15),
          "+": () => adjustRest(15),
          "-": () => adjustRest(-15),
        }
      : { Enter: () => void submit() },
    sessionId !== null && newRecords === null,
  );

  if (newRecords !== null) {
    return <Celebration records={newRecords} doneCount={doneCount} volume={volume} />;
  }

  const empty = !today.isLoading && !today.isError && (!workout || workout.exercises.length === 0);
  const allDone = steps.length > 0 && cursor >= steps.length;
  const exercisesLeft = new Set(
    steps.filter((s) => !findLogged(s.exercise.exercise_id, s.setNumber)).map((s) => s.exerciseIndex),
  ).size;

  return (
    <Page>
      <Hero
        photo={sessionId === null ? "app-squat" : "app-grip"}
        position="65% center"
        size={sessionId === null ? "lg" : "sm"}
        eyebrow={workout?.program_name ?? "Antrenman"}
        title={empty ? "Bugün antrenman yok" : (workout?.day_label ?? "Antrenman")}
        lead={empty ? "Önce bir program seçip aktif hâle getirmen gerekiyor." : undefined}
        actions={
          empty ? (
            <Link href="/programs" className="btn btn-primary px-6 py-3">
              Programlara git
            </Link>
          ) : sessionId !== null ? (
            <>
              <button
                className="btn btn-on-photo"
                disabled={doneCount === 0 || complete.isPending}
                onClick={() => void finish()}
              >
                {complete.isPending ? "Kapatılıyor…" : "Antrenmanı bitir"}
              </button>
              {/* Bitirme düğmesi hiç set yokken kapalı; iptal olmayınca seans
                  sonsuza kadar açık kalıyordu. */}
              <button
                className="btn btn-quiet"
                style={{ color: "var(--color-on-night-muted)" }}
                onClick={() => setConfirmCancel(true)}
              >
                İptal et
              </button>
            </>
          ) : undefined
        }
      >
        {today.isError ? (
          <div className="max-w-md">
            <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
          </div>
        ) : !empty && workout ? (
          <>
            <HeroStats>
              <HeroStat label="Set" value={`${doneCount}/${steps.length}`} foot="tamamlanan" />
              <HeroStat
                label="Süre"
                value={startedAt ? formatElapsed(now - startedAt) : "—"}
                foot={startedAt ? "seans başladı" : "henüz başlamadı"}
              />
              <HeroStat
                label="Hareket"
                value={sessionId === null ? workout.exercises.length : exercisesLeft}
                foot={sessionId === null ? "bugün" : "kaldı"}
              />
              <HeroStat
                label="Tonaj"
                value={volume > 0 ? fmt(volume, 0) : "—"}
                unit={volume > 0 ? "kg" : undefined}
                foot="ısınma hariç"
              />
            </HeroStats>
            <Progress done={doneCount} total={steps.length} />
          </>
        ) : today.isLoading ? (
          /* Sayılar gelene kadar aynı yükseklik: bandın içeriği alta
             yaslandığı için boş bırakılan yer başlığı aşağıda tutuyor ve
             veri gelince hiçbir şey zıplamıyor. */
          <div aria-busy="true" className="h-[13.5rem] sm:h-[8.75rem]" />
        ) : null}
      </Hero>

      {confirmCancel && sessionId !== null && (
        <Sheet title="Antrenmanı iptal et" onClose={() => setConfirmCancel(false)} width="26rem">
          <p className="text-base leading-relaxed">
            {doneCount > 0
              ? `Bu seansta kaydettiğin ${doneCount} set silinir ve antrenman hiç yapılmamış sayılır.`
              : "Bu seans hiç yapılmamış sayılır. Kaydedilmiş set yok."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              disabled={deleteSession.isPending}
              onClick={() => void cancelSession()}
              style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
            >
              {deleteSession.isPending ? "Siliniyor…" : "Evet, iptal et"}
            </button>
            <button className="btn btn-quiet" onClick={() => setConfirmCancel(false)}>
              Vazgeç
            </button>
          </div>
          {deleteSession.isError && (
            <div className="mt-4">
              <ErrorBox error={deleteSession.error} />
            </div>
          )}
        </Sheet>
      )}

      {startSession.isError && <ErrorBox error={startSession.error} />}
      {logSet.isError && <ErrorBox error={logSet.error} />}
      {complete.isError && <ErrorBox error={complete.error} />}

      {!empty && workout && (
        <div className="grid items-start gap-3 lg:grid-cols-12">
          <div className="lg:col-span-8">
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
                onSkip={skipRest}
                onAdjust={adjustRest}
              />
            ) : allDone ? (
              <AllDoneStage pending={complete.isPending} onFinish={() => void finish()} />
            ) : step ? (
              <SetStage
                step={step}
                planned={steps.filter((s) => s.exerciseIndex === step.exerciseIndex).length}
                values={valuesFor(step)}
                logged={findLogged(step.exercise.exercise_id, step.setNumber) !== undefined}
                previous={
                  step.setNumber > 1
                    ? findLogged(step.exercise.exercise_id, step.setNumber - 1)
                    : undefined
                }
                pending={logSet.isPending}
                removable={
                  findLogged(step.exercise.exercise_id, step.setNumber) !== undefined ||
                  step.setNumber > step.exercise.target_sets
                }
                removing={deleteSet.isPending}
                onRemove={() => void removeCurrent()}
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
          </div>

          <DayMap
            className="lg:col-span-4"
            steps={steps}
            cursor={sessionId === null ? -1 : cursor}
            findLogged={findLogged}
            onJump={
              sessionId === null
                ? undefined
                : (index) => {
                    setJump(index);
                    setRest(null);
                  }
            }
            onAddSet={
              sessionId === null
                ? undefined
                : (exerciseId) =>
                    setExtra((current) => ({
                      ...current,
                      [exerciseId]: (current[exerciseId] ?? 0) + 1,
                    }))
            }
            /* Geri alma yalnızca BOŞ ve fazladan açılmış slot için: dolu bir
               seti buradan silmek, listeye bir kez dokunup veri kaybetmek
               demek olurdu. Kayıtlı set sahnedeki "Bu seti sil" ile gidiyor. */
            canRemoveSet={(exerciseId, planned) =>
              (extra[exerciseId] ?? 0) > 0 && findLogged(exerciseId, planned) === undefined
            }
            onRemoveSet={(exerciseId) =>
              setExtra((current) => {
                const count = current[exerciseId] ?? 0;
                if (count <= 0) return current;
                return { ...current, [exerciseId]: count - 1 };
              })
            }
          />
        </div>
      )}
    </Page>
  );
}

/* --- İlerleme ------------------------------------------------------------- */

function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div
      className="mt-6 h-1 w-full overflow-hidden"
      style={{ background: "oklch(99% 0 0 / 0.14)" }}
      role="progressbar"
      aria-label="Tamamlanan setler"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div
        className="h-full"
        style={{
          width: `${ratio * 100}%`,
          background: "var(--color-accent)",
          transition: "width var(--dur-short) var(--ease-out)",
        }}
      />
    </div>
  );
}

/* --- Sahneler ------------------------------------------------------------- */

/** Ortak sahne kabuğu: her durum aynı yükseklikte — sahneler arası geçişte
 *  sayfa zıplamasın. */
function Stage({ children, night = false }: { children: React.ReactNode; night?: boolean }) {
  return (
    <section
      className={`${night ? "tile-night" : "card"} flex min-h-[40rem] flex-col items-center justify-center gap-8 px-6 py-12 text-center sm:px-10`}
    >
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
    <section className="card relative min-h-[40rem] overflow-hidden">
      {/* Kap mutlak konumlu: `Photo` kendi kökünü `relative` yapıyor ve
          yüksekliğini dışarıdan alıyor; min-height tek başına 0 bırakıyordu. */}
      <div className="absolute inset-0">
      <Photo slug="app-chalk" fill scrim position="70% center" className="size-full">
        <div className="flex size-full flex-col justify-end gap-5 p-8 lg:p-12">
          <p className="label on-photo-dark" style={{ color: "var(--color-on-night-faint)" }}>
            Bugün
          </p>
          <p className="display on-photo-dark text-4xl" style={{ color: "var(--color-on-night)" }}>
            {exerciseCount} hareket · {setCount} set
          </p>
          <p className="on-photo-dark max-w-[40ch] text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            Setler sırayla gelecek. Ağırlıklar geçmişine ve gücüne göre önceden dolu; onayla ya
            da düzelt. Ekran seans boyunca kararmayacak.
          </p>
          <div>
            <button className="btn btn-primary px-8 py-3.5 text-base" disabled={pending} onClick={onStart}>
              {pending ? "Başlatılıyor…" : "Antrenmanı başlat"}
            </button>
          </div>
        </div>
      </Photo>
      </div>
    </section>
  );
}

function RestStage({
  remaining,
  progress,
  next,
  onSkip,
  onAdjust,
}: {
  remaining: number;
  progress: number;
  next: Step | undefined;
  onSkip: () => void;
  onAdjust: (seconds: number) => void;
}) {
  const circumference = 2 * Math.PI * 47;
  return (
    <Stage night>
      <p className="label" style={{ color: "var(--color-on-night-faint)" }}>
        Dinlenme
      </p>

      <div className="relative grid size-[17rem] place-items-center sm:size-[19rem]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="47" fill="none" stroke="oklch(99% 0 0 / 0.1)" strokeWidth="2" />
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="var(--color-accent-deep)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${progress * circumference} ${circumference}`}
            style={{ transition: "stroke-dasharray 250ms linear" }}
          />
        </svg>
        <p className="display tnum text-[5.5rem] leading-none" role="timer" style={{ color: "var(--color-on-night)" }}>
          {formatClock(remaining)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-on-photo tnum" onClick={() => onAdjust(-15)}>
          −15 sn
        </button>
        <button type="button" className="btn btn-on-photo tnum" onClick={() => onAdjust(15)}>
          +15 sn
        </button>
      </div>

      {next ? (
        <div>
          <p className="label" style={{ color: "var(--color-on-night-faint)" }}>
            Sırada
          </p>
          <p className="display mt-1 text-2xl" style={{ color: "var(--color-on-night)" }}>
            {next.exercise.name}
          </p>
          <p className="tnum mt-0.5 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
            Set {next.setNumber} / {next.exercise.target_sets}
          </p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
          Son set tamamlandı.
        </p>
      )}

      <button className="btn btn-quiet" style={{ color: "var(--color-on-night-muted)" }} onClick={onSkip}>
        Dinlenmeyi atla
      </button>
    </Stage>
  );
}

/**
 * Motorun kararının kısa adı. Tam gerekçe "?" arkasında.
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
  planned,
  values,
  logged,
  previous,
  pending,
  removable,
  removing,
  onRemove,
  onChange,
  onSubmit,
}: {
  step: Step;
  /** Bu hareket için AÇIK slot sayısı — plana eklenen fazladan setler dâhil. */
  planned: number;
  values: Draft;
  /** Bu set daha önce kaydedildi mi? Haritadan geri dönülünce düzenleniyor. */
  logged: boolean;
  previous: WorkoutSet | undefined;
  pending: boolean;
  /** Kaydedilmiş ya da plana sonradan eklenmiş set: kaldırılabilir. */
  removable: boolean;
  removing: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onSubmit: () => void;
}) {
  const { exercise, setNumber } = step;
  const suggestion = exercise.progression;
  const ready = values.reps.trim().length > 0;
  const stepKg = weightStep(exercise.equipment);
  const bar = barFor(exercise.equipment);
  const weight = parseWeight(values.weight);

  const bump = (field: "weight" | "reps", delta: number) => {
    if (field === "weight") {
      const base = Number.isFinite(weight) ? weight : 0;
      onChange({ weight: weightText(Math.max(0, Math.round((base + delta) * 100) / 100)) });
    } else {
      const base = Number.parseInt(values.reps, 10);
      onChange({ reps: String(Math.max(0, (Number.isFinite(base) ? base : 0) + delta)) });
    }
  };

  return (
    <Stage>
      <div>
        <p className="label">
          Set {setNumber} / {planned}
          <span className="mx-2 text-[var(--color-border-strong)]">·</span>
          {exercise.target_rep_min}–{exercise.target_rep_max} tekrar
        </p>
        <h2 className="display mt-2 text-2xl lg:text-3xl">{exercise.name}</h2>
        <SetDots total={planned} current={setNumber} />
        {/* Haritadan geri dönüldüğünde alanlar KAYITLI değerlerle doluyor ve
            "Seti kaydet" yazısı yeni bir set ekliyormuş gibi duruyordu.
            Sunucu aynı sırayı üzerine yazıyor; ekran da bunu söylüyor. */}
        {logged && (
          <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
            Bu set kayıtlı — değiştirirsen üzerine yazılır.
          </p>
        )}
      </div>

      <form
        className="flex w-full flex-col items-center gap-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !pending) onSubmit();
        }}
      >
        <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-6">
          <Stepper
            label="kg"
            value={values.weight}
            onChange={(v) => onChange({ weight: v })}
            onStep={(direction) => bump("weight", direction * stepKg)}
            stepLabel={`${weightText(stepKg)} kg`}
            autoFocus
          />
          <Stepper
            label="Tekrar"
            value={values.reps}
            onChange={(v) => onChange({ reps: v })}
            onStep={(direction) => bump("reps", direction)}
            stepLabel="1 tekrar"
          />
          <label className="flex flex-col items-center gap-2">
            <span className="label">RIR</span>
            <input
              inputMode="numeric"
              value={values.rir}
              onChange={(event) => onChange({ rir: event.target.value })}
              className="field display tnum h-20 w-20 text-center text-3xl"
            />
          </label>
        </div>

        {/* Isınma seti hacme ve rekora sayılmıyor; kayıt yine de tutuluyor.
            Düğme alanların ALTINDA: her sette sorulan bir soru değil. */}
        <button
          type="button"
          aria-pressed={values.warmup === true}
          onClick={() => onChange({ warmup: !(values.warmup === true) })}
          className="btn btn-quiet -mt-2 text-sm"
          style={{
            color: values.warmup === true ? "var(--color-warning)" : undefined,
          }}
        >
          {values.warmup === true ? "✓ Isınma seti — hacme sayılmıyor" : "Isınma seti olarak işaretle"}
        </button>

        {bar !== null && Number.isFinite(weight) && weight > 0 && <Plates weight={weight} bar={bar} />}

        <div className="flex flex-col items-center gap-1.5">
          {suggestion && (
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
          )}
          {exercise.last_session_summary && (
            <p className="tnum text-xs text-[var(--color-ink-faint)]">
              Geçen sefer: {exercise.last_session_summary}
            </p>
          )}
          {suggestion && suggestion.warnings.length > 0 && (
            <p className="max-w-[40ch] text-xs" style={{ color: "var(--color-warning)" }}>
              {suggestion.warnings[0]}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="submit" className="btn btn-primary px-10 py-4 text-base" disabled={!ready || pending}>
            {pending ? "Kaydediliyor…" : logged ? "Seti güncelle" : "Seti kaydet"}
          </button>
          {previous && (
            <button
              type="button"
              className="btn btn-ghost py-4"
              onClick={() =>
                onChange({
                  weight: weightText(previous.weight_kg),
                  reps: String(previous.reps),
                  rir: previous.rir === null ? "" : String(previous.rir),
                })
              }
            >
              Önceki seti tekrarla
            </button>
          )}
        </div>

        {removable && (
          <button
            type="button"
            className="btn btn-quiet text-sm"
            disabled={removing}
            onClick={onRemove}
          >
            {removing ? "Kaldırılıyor…" : logged ? "Bu seti sil" : "Bu seti kaldır"}
          </button>
        )}
      </form>
    </Stage>
  );
}

function SetDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-1 w-6"
          style={{
            background:
              i + 1 < current
                ? "var(--color-accent-deep)"
                : i + 1 === current
                  ? "var(--color-ink)"
                  : "var(--color-border-strong)",
          }}
        />
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  onStep,
  stepLabel,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
  stepLabel: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <label className="label" htmlFor={`field-${label}`}>
        {label}
      </label>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`${stepLabel} azalt`}
          onClick={() => onStep(-1)}
          className="grid w-12 place-items-center border border-r-0 border-[var(--color-border-strong)] text-xl text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
          style={{ transitionDuration: "var(--dur-micro)" }}
        >
          −
        </button>
        <input
          id={`field-${label}`}
          aria-label={label}
          // inputMode="decimal": sayısal klavye açar ama virgül de yazılabilir.
          inputMode="decimal"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Klavyeyle: yukarı/aşağı ok adım kadar değiştiriyor.
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onStep(1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              onStep(-1);
            }
          }}
          className="field display tnum h-20 w-32 px-1 text-center text-4xl"
        />
        <button
          type="button"
          aria-label={`${stepLabel} artır`}
          onClick={() => onStep(1)}
          className="grid w-12 place-items-center border border-l-0 border-[var(--color-border-strong)] text-xl text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
          style={{ transitionDuration: "var(--dur-micro)" }}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Bara takılacak plakalar — bir taraf, gerçek oranlarda çizilmiş. */
function Plates({ weight, bar }: { weight: number; bar: number }) {
  const load = plateLoad(weight, bar);
  if (load.belowBar) {
    return <p className="text-xs text-[var(--color-ink-faint)]">Boş bar {bar} kg — hedef bardan hafif.</p>;
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1" aria-hidden>
        <span className="h-2 w-16 bg-[var(--color-border-strong)]" />
        {load.perSide.map((plate, i) => (
          <span
            key={i}
            className="block"
            style={{
              width: plate >= 10 ? 10 : 7,
              height: 18 + Math.sqrt(plate) * 9,
              background: plate >= 20 ? "var(--color-ink)" : plate >= 10 ? "var(--color-ink-muted)" : "var(--color-ink-faint)",
            }}
          />
        ))}
        <span className="h-2 w-5 bg-[var(--color-border-strong)]" />
      </div>
      <p className="tnum text-xs text-[var(--color-ink-muted)]">
        {load.perSide.length > 0 ? (
          <>
            Bir tarafa: {load.perSide.map((p) => weightText(p)).join(" + ")} kg
            {bar > 0 && <span className="text-[var(--color-ink-faint)]"> · bar {bar} kg</span>}
          </>
        ) : (
          `Yalnızca bar (${bar} kg)`
        )}
        {load.remainder > 0 && (
          <span style={{ color: "var(--color-warning)" }}> · {weightText(load.remainder)} kg plakayla tam oturmuyor</span>
        )}
      </p>
    </div>
  );
}

function AllDoneStage({ pending, onFinish }: { pending: boolean; onFinish: () => void }) {
  return (
    <Stage night>
      <span
        aria-hidden
        className="animate-check grid size-16 place-items-center rounded-full"
        style={{ background: "var(--color-accent)" }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <p className="display text-4xl" style={{ color: "var(--color-on-night)" }}>
        Bütün setler tamam
      </p>
      <button className="btn btn-on-photo px-8 py-3.5 text-base" disabled={pending} onClick={onFinish}>
        {pending ? "Kapatılıyor…" : "Antrenmanı bitir"}
      </button>
    </Stage>
  );
}

/* --- Günün haritası --------------------------------------------------------- */

function DayMap({
  className,
  steps,
  cursor,
  findLogged,
  onJump,
  onAddSet,
  canRemoveSet,
  onRemoveSet,
}: {
  className: string;
  steps: Step[];
  cursor: number;
  findLogged: (exerciseId: string, setNumber: number) => WorkoutSet | undefined;
  onJump?: (index: number) => void;
  onAddSet?: (exerciseId: string) => void;
  canRemoveSet?: (exerciseId: string, planned: number) => boolean;
  onRemoveSet?: (exerciseId: string) => void;
}) {
  /* Hareket başına grupla: harita set değil hareket düzeyinde okunuyor.
     Set sayısı PLANDAN değil adım listesinden geliyor — plana eklenen
     fazladan setler de haritada görünüyor. */
  const byExercise = new Map<
    number,
    { exercise: PlannedExercise; firstStep: number; planned: number }
  >();
  steps.forEach((s, index) => {
    const found = byExercise.get(s.exerciseIndex);
    if (found) found.planned += 1;
    else byExercise.set(s.exerciseIndex, { exercise: s.exercise, firstStep: index, planned: 1 });
  });
  const current = steps[cursor]?.exerciseIndex;

  return (
    <aside className={`card p-6 lg:sticky lg:top-6 ${className}`} aria-label="Günün hareketleri">
      <p className="label">Günün hareketleri</p>
      <ol className="mt-4 flex flex-col">
        {[...byExercise.entries()].map(([exerciseIndex, { exercise, firstStep, planned }], order) => {
          const done = Array.from({ length: planned }, (_, i) =>
            findLogged(exercise.exercise_id, i + 1),
          ).filter(Boolean).length;
          const isCurrent = exerciseIndex === current;
          const content = (
            <>
              <span
                className="display tnum w-7 shrink-0 text-lg"
                style={{ color: isCurrent ? "var(--color-ink)" : "var(--color-ink-faint)" }}
              >
                {String(order + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${isCurrent ? "font-semibold" : ""}`}>{exercise.name}</span>
                <span className="mt-1.5 flex gap-1" aria-hidden>
                  {Array.from({ length: planned }, (_, i) => (
                    <span
                      key={i}
                      className="h-1 flex-1"
                      style={{
                        maxWidth: "1.5rem",
                        background: i < done ? "var(--color-accent-deep)" : "var(--color-border-strong)",
                      }}
                    />
                  ))}
                </span>
              </span>
              <span className="tnum shrink-0 text-xs text-[var(--color-ink-muted)]">
                {done} / {planned} set
              </span>
            </>
          );
          return (
            <li
              key={exercise.program_exercise_id}
              className="flex items-center border-t border-[var(--color-border)] first:border-t-0"
            >
              {onJump ? (
                <button
                  onClick={() => onJump(firstStep)}
                  className="-ml-3 flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-3 text-left transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{
                    transitionDuration: "var(--dur-micro)",
                    boxShadow: isCurrent ? "inset 3px 0 0 var(--color-accent-deep)" : undefined,
                  }}
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-3.5">{content}</div>
              )}

              {/* Plana bir set daha: program bir öneri, yasak değil. Yanlışlıkla
                  açılan boş slot aynı yerden geri alınıyor. */}
              {onRemoveSet && canRemoveSet?.(exercise.exercise_id, planned) && (
                <button
                  type="button"
                  onClick={() => onRemoveSet(exercise.exercise_id)}
                  aria-label={`${exercise.name} için eklenen seti geri al`}
                  className="grid size-9 shrink-0 place-items-center text-lg text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  −
                </button>
              )}
              {onAddSet && (
                <button
                  type="button"
                  onClick={() => onAddSet(exercise.exercise_id)}
                  aria-label={`${exercise.name} için bir set daha ekle`}
                  className="-mr-2 grid size-9 shrink-0 place-items-center text-lg text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
                  style={{ transitionDuration: "var(--dur-micro)" }}
                >
                  +
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {/* Kısayollar yalnızca klavyesi olan ekranda yazıyor: telefonda satır
          yer kaplamaktan başka bir şey yapmazdı. */}
      {onJump && (
        <p className="mt-5 hidden border-t border-[var(--color-border)] pt-4 text-2xs text-[var(--color-ink-faint)] lg:block">
          Klavye: <strong className="font-medium">Enter</strong> seti kaydet ·{" "}
          <strong className="font-medium">↑ ↓</strong> ağırlık ve tekrar ·{" "}
          dinlenmede <strong className="font-medium">Enter</strong> atla,{" "}
          <strong className="font-medium">← →</strong> ±15 sn
        </p>
      )}
    </aside>
  );
}

/* --- Rekor kutlaması ------------------------------------------------------ */

function Celebration({
  records,
  doneCount,
  volume,
}: {
  records: PersonalRecordRow[];
  doneCount: number;
  volume: number;
}) {
  return (
    <Page>
      <Hero
        photo="app-plates"
        size="lg"
        eyebrow="Tamamlandı"
        title="Antrenman bitti"
        lead="Hacim birikiyor. Bir sonraki seansta motor ağırlıkları buna göre önerecek."
        actions={
          <>
            <Link href="/" className="btn btn-primary px-6 py-3">
              Panele dön
            </Link>
            <Link href="/progress" className="btn btn-on-photo px-6 py-3">
              İlerlemeyi gör
            </Link>
          </>
        }
      >
        <HeroStats>
          <HeroStat label="Set" value={doneCount} foot={`${doneCount} set tamamlandı`} />
          <HeroStat label="Tonaj" value={volume > 0 ? fmt(volume, 0) : "—"} unit={volume > 0 ? "kg" : undefined} />
          <HeroStat label="Rekor" value={records.length} foot={records.length > 0 ? "yeni" : "bu seansta yok"} />
        </HeroStats>
      </Hero>

      {records.length > 0 ? (
        <section className="tile-night p-6 lg:p-8">
          <h2 className="display text-2xl" style={{ color: "var(--color-on-night)" }}>
            {records.length} yeni rekor
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {records.map((record, i) => (
              <li key={i} className="flex items-center justify-between gap-4 p-4" style={{ background: "var(--color-night-raised)" }}>
                <span className="flex items-center gap-2.5 text-sm" style={{ color: "var(--color-on-night)" }}>
                  <span
                    aria-hidden
                    className="animate-check grid size-5 shrink-0 place-items-center rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {prLabel(record.type)}
                </span>
                <span className="display tnum text-2xl" style={{ color: "var(--color-on-night)" }}>
                  {fmt(record.value, 1)}{" "}
                  <span className="font-sans text-xs font-normal" style={{ color: "var(--color-on-night-muted)" }}>
                    {prUnit(record.type)}
                    {record.reps !== null && ` × ${record.reps}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card p-6 lg:p-8">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Bu seansta rekor kırılmadı — ama {doneCount} set tamamladın, hacim birikiyor.
          </p>
        </section>
      )}
    </Page>
  );
}
