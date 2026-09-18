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
import { Hero, HeroStat, HeroStats, Page } from "@/components/Layout";
import { createAudioUnlock, useRestCountdown, type RestState } from "@/components/RestTimer";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, fmt } from "@/components/States";
import { formatElapsed, useHotkeys, useNow, useWakeLock } from "@/lib/device";
import { Celebration } from "./Celebration";
import { DayMap } from "./DayMap";
import {
  draftStorageKey,
  loadDrafts,
  parseWeight,
  saveDrafts,
  weightText,
  type Draft,
  type Step,
} from "./model";
import { AllDoneStage, Intro, Progress, RestStage, SetStage } from "./stages";
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

  /**
   * Günün adımları — SÜPERSET SIRASIYLA.
   *
   * Program bir hareketi "süperset 2" diye işaretlediğinde o gruptaki
   * hareketler aralarında dinlenmeden sırayla yapılıyor: A1, B1, A2, B2…
   * Akış bunu yok sayıp A'nın bütün setlerini üst üste diziyordu; yani ekran
   * programın söylediğinden başka bir antrenman yaptırıyordu.
   *
   * Grup yalnızca ARDIŞIK hareketlerden kuruluyor: aynı numara programın iki
   * ayrı yerinde geçiyorsa (nadiren de olsa) araya giren hareket ikisini
   * ayırıyor ve tur mantığı bozulmuyor.
   */
  const steps: Step[] = useMemo(() => {
    const exercises = workout?.exercises ?? [];
    const plannedFor = (exercise: PlannedExercise) =>
      Math.max(
        exercise.target_sets + (extra[exercise.exercise_id] ?? 0),
        maxLoggedSet.get(exercise.exercise_id) ?? 0,
      );

    const result: Step[] = [];
    let index = 0;
    while (index < exercises.length) {
      const group = exercises[index]!.superset_group;
      let end = index + 1;
      if (group !== null) {
        while (end < exercises.length && exercises[end]!.superset_group === group) end += 1;
      }

      const block = exercises.slice(index, end);
      const rounds = Math.max(...block.map(plannedFor));
      for (let round = 1; round <= rounds; round += 1) {
        block.forEach((exercise, offset) => {
          if (round > plannedFor(exercise)) return;
          result.push({ exercise, setNumber: round, exerciseIndex: index + offset });
        });
      }
      index = end;
    }
    return result;
  }, [workout, extra, maxLoggedSet]);
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

  /**
   * Ekran okuyucu için duyuru.
   *
   * Dinlenme bitince sahne kendiliğinden değişiyor: gören kişi büyük sayacın
   * yerine set alanlarının geldiğini anlıyor, ekran okuyucu kullanan kişi
   * hiçbir şey duymuyordu. Sayaç saniye saniye okunmuyor (işkence olurdu),
   * yalnızca bitiş.
   */
  const [announce, setAnnounce] = useState("");

  const onRestDone = useCallback(() => {
    setRest(null);
    setAnnounce("Dinlenme bitti.");
  }, []);
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

    /* Son set kaydedildiyse dinlenmeye gerek yok. Süperset turunun ORTASINDA
       da yok: gruptaki bir sonraki harekete dinlenmeden geçiliyor — sürenin
       tamamı tur bittikten sonra veriliyor. */
    /* Zincir yalnızca AYNI TUR içinde: A1 → B1 dinlenmesiz, ama B1 → A2 tur
       sonu ve dinlenme tam orada. Tur numarası set sırasıyla aynı şey. */
    const next = steps[cursor + 1];
    const chained =
      next !== undefined &&
      step.exercise.superset_group !== null &&
      next.exercise.superset_group === step.exercise.superset_group &&
      next.setNumber === step.setNumber;

    if (next !== undefined && !chained) {
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
              {/* Sayaç ÇALIŞMA seti sayıyor: ısınma seti kaydedilebiliyor ama
                  hacme de bu sayıya da girmiyor. */}
              <HeroStat label="Set" value={`${doneCount}/${steps.length}`} foot="çalışma seti" />
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

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

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
                supersetNext={
                  step.exercise.superset_group !== null &&
                  steps[cursor + 1]?.exercise.superset_group === step.exercise.superset_group &&
                  steps[cursor + 1]?.setNumber === step.setNumber
                    ? steps[cursor + 1]?.exercise.name
                    : undefined
                }
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
