"use client";

/**
 * Antrenman sahneleri — bir seferde tek iş.
 *
 * Başlamadan önce günün özeti (`Intro`), set sırasında büyük sayı alanları
 * (`SetStage`), set arasında dev bir sayaç (`RestStage`), sonunda kapanış
 * (`AllDoneStage`). Akışın kendisi `page.tsx`te; buradakiler durum tutmayan
 * sunum bileşenleri.
 */

import { InfoTip } from "@/components/Layout";
import { Photo } from "@/components/Photo";
import { formatClock } from "@/components/RestTimer";
import { barFor, plateLoad, weightStep } from "@/lib/plates";
import type { WorkoutSet } from "@/lib/queries";
import { parseWeight, weightText, type Draft, type Step } from "./model";

/* --- İlerleme ------------------------------------------------------------- */

export function Progress({ done, total }: { done: number; total: number }) {
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
export function Stage({ children, night = false }: { children: React.ReactNode; night?: boolean }) {
  return (
    <section
      className={`${night ? "tile-night" : "card"} flex min-h-[40rem] flex-col items-center justify-center gap-8 px-6 py-12 text-center sm:px-10`}
    >
      {children}
    </section>
  );
}

export function Intro({
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
      <Photo
        slug="app-chalk"
        fill
        scrim
        position="70% center"
        sizes="(min-width: 1024px) 60vw, 100vw"
        className="size-full"
      >
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

export function RestStage({
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

export function SetStage({
  step,
  planned,
  supersetNext,
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
  /** Süperset: bu setten sonra DİNLENMEDEN geçilecek hareketin adı. */
  supersetNext?: string;
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
        {/* Süperset: "kaydet"ten sonra sayaç GELMEYECEK. Bunu önceden
            söylemek gerekiyor, yoksa ekran bozuk sanılıyor. */}
        {supersetNext !== undefined && (
          <p className="mt-3 text-xs" style={{ color: "var(--color-warning)" }}>
            Süperset — dinlenmeden {supersetNext}
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

export function AllDoneStage({ pending, onFinish }: { pending: boolean; onFinish: () => void }) {
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
