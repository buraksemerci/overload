"use client";

/**
 * Tanışma akışı — hesap açıldıktan sonra bir kez.
 *
 * --------------------------------------------------------------------------
 * NEDEN VAR
 * --------------------------------------------------------------------------
 * Uygulamanın iki ana sayısı — rafın başında kaç kilo, günde kaç kalori —
 * kişisel bilgiye bağlı. Bu bilgiler önceden yalnızca Hesap ekranında
 * soruluyordu ve oraya kimse gitmiyordu: yeni kullanıcının kalori hedefi
 * boş, başlangıç ağırlıkları herkeste en düşük seviyeden hesaplanıyordu.
 *
 * --------------------------------------------------------------------------
 * NE SORULUYOR
 * --------------------------------------------------------------------------
 * Yalnızca tüketicisi olan bilgi. Her adımın altında o bilginin NEYE
 * gittiği yazıyor — "neden soruyorsunuz" sorusu cevapsız kalmasın ve
 * kullanıcı paylaşıp paylaşmamaya bilerek karar versin. Alan ↔ tüketici
 * tablosu `apps/api/.../features/account/onboarding.py` içinde.
 *
 * İki soru bilinçli olarak dolaylı:
 *
 *   - "Seviyen ne?" yerine "ne kadar süredir?". Süre ölçülebilir; seviye bir
 *     öz değerlendirme ve fazla ağır bir başlangıcın bedeli sakatlık.
 *   - Formülün "aktivite düzeyi" sorulmuyor. Antrenman günü zaten soruluyor;
 *     kalan tek bilinmeyen gün içi hareket ve katsayı ikisinden türetiliyor
 *     (`lib/onboarding.ts`). Gün içi hareket cevabı hiçbir yere yazılmıyor.
 *
 * --------------------------------------------------------------------------
 * HER ŞEY ATLANABİLİR
 * --------------------------------------------------------------------------
 * Her adımda "Geç" var. Zorunlu alan, kullanıcıyı ya uydurmaya ya da
 * uygulamayı bırakmaya zorluyor; ikisi de eksik bilgiden kötü. Atlanan
 * bilginin tüketicisi temkinli varsayılanında kalıyor.
 *
 * Adımlar tek istekte, SONDA kaydediliyor: yarıda bırakılan bir akış yarım
 * bir profil bırakmıyor ve kullanıcı bir sonraki girişte baştan başlıyor.
 *
 * --------------------------------------------------------------------------
 * SONUÇ EKRANI
 * --------------------------------------------------------------------------
 * Akış bir teşekkürle değil, cevapların ÜRÜNÜYLE bitiyor: hesaplanan kalori
 * hedefi ve beyana uyan program. Sayılar sunucudan geliyor, istemcide
 * yeniden hesaplanmıyor — ekranda görülen, uygulamanın kullanacağı sayı.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconCheck } from "@/components/Icons";
import { Photo } from "@/components/Photo";
import { ErrorBox, Loading } from "@/components/States";
import type { Me } from "@/lib/auth";
import {
  activityFrom,
  birthDateProblem,
  recommendTemplate,
  type DailyMovement,
  type Experience,
  type NutritionGoal,
  type Sex,
  type TrainingGoal,
} from "@/lib/onboarding";
import {
  useActivateProgram,
  useCloneProgram,
  useCompleteOnboarding,
  useMe,
  useNutritionTarget,
  usePrograms,
  useTemplates,
} from "@/lib/queries";

/* --- Cevaplar --------------------------------------------------------------- */

interface Answers {
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
function seed(me: Me): Answers {
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
function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/* --- Adımlar ------------------------------------------------------------------ */

type StepId = "intro" | "basics" | "body" | "experience" | "goal" | "day";

const STEPS: readonly StepId[] = ["intro", "basics", "body", "experience", "goal", "day"];

/** Adım atlandığında eski hâline dönen alanlar. */
const STEP_FIELDS: Record<StepId, ReadonlyArray<keyof Answers>> = {
  intro: [],
  basics: ["display_name", "sex", "birth_date"],
  body: ["height_cm", "weight_kg"],
  experience: ["experience"],
  goal: ["goal", "days"],
  day: ["movement", "nutrition_goal"],
};

/** Adımı ilerletmeyi engelleyen sorun. Boş alan sorun değil — atlanabilir. */
function problem(step: StepId, answers: Answers): string | null {
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

const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "female", label: "Kadın" },
  { value: "male", label: "Erkek" },
  { value: "unspecified", label: "Belirtmeyeceğim" },
];

const EXPERIENCE_OPTIONS: ReadonlyArray<{ value: Experience; label: string; hint: string }> = [
  { value: "new", label: "Yeni başlıyorum", hint: "Hiç ya da birkaç haftadır" },
  { value: "under_1y", label: "Bir yıldan az", hint: "Düzenli ama yeni sayılırım" },
  { value: "one_to_three", label: "Bir ile üç yıl arası", hint: "Temel hareketleri biliyorum" },
  { value: "over_three", label: "Üç yıldan fazla", hint: "Uzun süredir düzenli" },
];

const GOAL_OPTIONS: ReadonlyArray<{
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

const MOVEMENT_OPTIONS: ReadonlyArray<{ value: DailyMovement; label: string; hint: string }> = [
  { value: "seated", label: "Çoğunlukla oturarak", hint: "Masa başı, okul, araç" },
  { value: "on_feet", label: "Çoğunlukla ayakta", hint: "Mağaza, sınıf, hastane" },
  { value: "physical", label: "Bedenen ağır", hint: "Şantiye, depo, kuryelik" },
];

const NUTRITION_OPTIONS: ReadonlyArray<{ value: NutritionGoal; label: string; hint: string }> = [
  { value: "cut", label: "Yağ kaybı", hint: "İhtiyacının %20 altında" },
  { value: "maintain", label: "Koruma", hint: "İhtiyacın kadar" },
  { value: "bulk", label: "Kas kazanımı", hint: "İhtiyacının %10 üstünde" },
];

/* --- Sayfa ------------------------------------------------------------------------ */

export default function OnboardingPage() {
  const me = useMe();

  // Veri önce: arka plandaki bir yeniden çekim başarısız olursa elde olan
  // profille akış sürüyor — yarıda kalan cevaplar bir hata kutusuna feda
  // edilmiyor.
  if (me.data === undefined && me.isError) {
    return (
      <Shell>
        <ErrorBox error={me.error} onRetry={() => void me.refetch()} />
      </Shell>
    );
  }
  if (me.data === undefined) {
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  }
  // Profil geldiğinde akış kuruluyor: tohumlama bir `useState` başlangıç
  // değeri, etki içinde bir `setState` değil.
  return <Flow me={me.data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-1 pb-8 pt-6 lg:pt-12">
      {children}
    </div>
  );
}

function Flow({ me }: { me: Me }) {
  const [initial] = useState(() => seed(me));
  const [answers, setAnswers] = useState<Answers>(initial);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const complete = useCompleteOnboarding();

  const step = STEPS[index]!;
  const heading = useRef<HTMLHeadingElement>(null);

  // Adım değişince odak yeni başlığa: ekran okuyucu yeni soruyu okusun,
  // klavyeyle gelen kişi sayfanın başından devam etsin.
  useEffect(() => {
    if (index === 0 && !done) return;
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [index, done]);

  const set = (patch: Partial<Answers>) => setAnswers((current) => ({ ...current, ...patch }));
  const blocking = problem(step, answers);
  const isLast = index === STEPS.length - 1;

  /** Değerler parametreyle geliyor: "Geç" aynı render'da güncellenmiş
      cevaplarla gönderiyor ve `setAnswers` henüz uygulanmamış olabilir. */
  function submit(values: Answers) {
    const height = parseDecimal(values.height_cm);
    complete.mutate(
      {
        display_name: values.display_name.trim() || null,
        sex: values.sex ?? "unspecified",
        birth_date: values.birth_date || null,
        height_cm: height === null ? null : Math.round(height),
        weight_kg: parseDecimal(values.weight_kg),
        // Gün içi hareket atlandıysa profildeki düzey korunuyor.
        activity_level:
          values.movement === null
            ? me.activity_level
            : activityFrom(values.days, values.movement),
        training_experience: values.experience,
        training_goal: values.goal,
        training_days_per_week: values.days,
        nutrition_goal: values.nutrition_goal,
      },
      { onSuccess: () => setDone(true) },
    );
  }

  function next() {
    if (blocking !== null || complete.isPending) return;
    if (isLast) submit(answers);
    else setIndex(index + 1);
  }

  function skip() {
    // Atlanan adımın alanları tohum hâline dönüyor: yarım yazılıp
    // vazgeçilen bir değer gönderilmesin.
    const restored: Partial<Answers> = {};
    for (const field of STEP_FIELDS[step]) {
      (restored as Record<string, unknown>)[field] = initial[field];
    }
    const merged = { ...answers, ...restored };
    setAnswers(merged);
    // Son adımı atlamak da akışı bitiriyor.
    if (isLast) submit(merged);
    else setIndex(index + 1);
  }

  if (done) {
    return (
      <Shell>
        <Result answers={answers} headingRef={heading} />
      </Shell>
    );
  }

  const questionCount = STEPS.length - 1;
  const answered = Math.max(index - 1, 0);

  return (
    <Shell>
      <header className="flex items-center justify-between gap-4">
        <p className="display text-lg">overload</p>
        {index > 0 && (
          <p className="tnum text-xs text-[var(--color-ink-muted)]">
            {index} / {questionCount}
          </p>
        )}
      </header>

      {/* İlerleme çubuğu CEVAPLANAN soruları sayıyor, bulunulan adımı değil:
          son sorudayken dolu bir çubuk "bitti" diyordu ama henüz bitmemişti. */}
      <div
        className="mt-4 h-1 w-full bg-[var(--color-surface-raised)]"
        role="progressbar"
        aria-label="Tanışma ilerlemesi"
        aria-valuemin={0}
        aria-valuemax={questionCount}
        aria-valuenow={answered}
      >
        <div
          className="h-full"
          style={{
            width: `${(answered / questionCount) * 100}%`,
            background: "var(--color-accent)",
            transition: "width var(--dur-long) var(--ease-out)",
          }}
        />
      </div>

      <form
        // Adım değişince içerik yeniden giriyor; anahtar animasyonu tetikliyor.
        key={step}
        className="reveal mt-10 flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <StepBody step={step} answers={answers} set={set} headingRef={heading} />

        {blocking !== null && (
          <p className="mt-4 text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {blocking}
          </p>
        )}
        {complete.isError && (
          <div className="mt-4">
            <ErrorBox error={complete.error} />
          </div>
        )}

        {/* Eylemler akışta, en altta. Yapışkan değil: telefonda klavye
            açıkken yapışkan bir çubuk alanın üstüne biniyordu. */}
        <div className="mt-auto flex items-center gap-2 pt-10">
          {index > 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => setIndex(index - 1)}>
              Geri
            </button>
          )}
          <div className="flex-1" />
          {index > 0 && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={skip}
              disabled={complete.isPending}
            >
              Geç
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary min-w-32 py-3"
            disabled={blocking !== null || complete.isPending}
          >
            {complete.isPending
              ? "Kaydediliyor…"
              : index === 0
                ? "Başlayalım"
                : isLast
                  ? "Bitir"
                  : "Devam"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/* --- Adım içerikleri -------------------------------------------------------------- */

function StepBody({
  step,
  answers,
  set,
  headingRef,
}: {
  step: StepId;
  answers: Answers;
  set: (patch: Partial<Answers>) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  switch (step) {
    case "intro":
      return (
        <>
          {/* Tanışmanın ilk ekranı uygulamanın ilk izlenimi: kart değil,
              sahne. Giriş anlatısının salonundan bir kare, ekranın kenarına
              kadar. Sorular başlayınca dar sütuna dönülüyor — orada okunacak
              şey metin, bakılacak şey değil. */}
          <div
            className="relative isolate -mt-6 flex min-h-[46svh] items-end overflow-hidden lg:min-h-[54svh]"
            style={{ width: "100vw", marginInline: "calc(50% - 50vw)" }}
          >
            <div aria-hidden className="absolute inset-0">
              <Photo slug="story-entry" fill position="center 45%" className="size-full" />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, oklch(12% 0.01 115 / 0.92) 0%, oklch(12% 0.01 115 / 0.45) 55%, oklch(12% 0.01 115 / 0.2) 100%)",
                }}
              />
            </div>
            <div className="relative mx-auto w-full max-w-xl px-6 pb-8 lg:pb-10">
              <p className="label" style={{ color: "var(--color-on-night-muted)" }}>
                Tanışma
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="display mt-2 text-3xl outline-none sm:text-4xl lg:text-5xl"
                style={{ color: "var(--color-on-night)" }}
              >
                Seni tanıyalım
              </h1>
            </div>
          </div>

          <p className="mt-8 max-w-[52ch] text-lg leading-relaxed">
            Beş kısa soru. Cevapların iki sayıyı belirliyor: rafın başında kaç kilo kaldıracağın
            ve günde kaç kalori alacağın.
          </p>
          <ul className="mt-8 flex flex-col divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] text-base text-[var(--color-ink-muted)]">
            {[
              "Her soruyu atlayabilirsin.",
              "Her sorunun altında o bilginin neye gittiği yazıyor.",
              "Hepsini sonra Hesap ekranından değiştirebilirsin.",
            ].map((line) => (
              <li key={line} className="py-3.5">
                {line}
              </li>
            ))}
          </ul>
        </>
      );

    case "basics":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Temel bilgiler"
            why="Günlük kalori ihtiyacı yaşa ve cinsiyete göre hesaplanıyor. Güç seviyen de aynı cinsiyetteki kişilerle karşılaştırılıyor."
          />
          <div className="mt-8 flex flex-col gap-6">
            <label className="flex flex-col gap-1.5">
              <span className="label">Adın</span>
              <input
                className="field h-12 w-full px-3 text-base"
                value={answers.display_name}
                onChange={(event) => set({ display_name: event.target.value })}
                autoComplete="given-name"
                maxLength={80}
              />
            </label>

            <fieldset>
              <legend className="label">Cinsiyet</legend>
              <div className="seg mt-1.5 flex w-full">
                {SEX_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="seg-item flex-1 py-2.5"
                    aria-pressed={answers.sex === option.value}
                    onClick={() => set({ sex: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {answers.sex === "unspecified" && (
                <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                  Sorun değil. Kalori hedefi ve güç karşılaştırması kapalı kalır: ortalama almak
                  kimseyi doğru temsil etmiyor.
                </p>
              )}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="label">Doğum tarihi</span>
              <input
                type="date"
                className="field h-12 w-full px-3 text-base"
                value={answers.birth_date}
                onChange={(event) => set({ birth_date: event.target.value })}
                autoComplete="bday"
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
          </div>
        </>
      );

    case "body":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Boy ve kilo"
            why="Kilon hem kalori hedefine hem ilk antrenmandaki ağırlıklara giriyor. Kilo bugünün tartısı olarak kaydediliyor; Tartı ekranından güncelleyebilirsin."
          />
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Measure
              label="Boy"
              unit="cm"
              value={answers.height_cm}
              onChange={(value) => set({ height_cm: value })}
              inputMode="numeric"
            />
            <Measure
              label="Kilo"
              unit="kg"
              value={answers.weight_kg}
              onChange={(value) => set({ weight_kg: value })}
              inputMode="decimal"
            />
          </div>
        </>
      );

    case "experience":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Ne kadar süredir düzenli ağırlık çalışıyorsun?"
            why="Seviyeni değil süreyi soruyoruz. İlk antrenmanda ağırlıklar buna göre temkinli başlıyor; setlerini girdikçe gerçek performansına göre ayarlanıyor."
          />
          <div className="mt-8 flex flex-col gap-2">
            {EXPERIENCE_OPTIONS.map((option) => (
              <Choice
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={answers.experience === option.value}
                onSelect={() => set({ experience: option.value })}
              />
            ))}
          </div>
        </>
      );

    case "goal":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Neyi hedefliyorsun?"
            why="Sana uygun programı önermek için. Haftalık gün sayısı, programın olmadığı haftalarda seri hedefin de oluyor."
          />
          <div className="mt-8 grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((option) => (
              <GoalCard
                key={option.value}
                label={option.label}
                hint={option.hint}
                photo={option.photo}
                selected={answers.goal === option.value}
                onSelect={() => set({ goal: option.value })}
              />
            ))}
          </div>

          <fieldset className="mt-8">
            <legend className="label">Haftada kaç gün ayırabilirsin?</legend>
            <div className="seg mt-1.5 flex w-full">
              {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                <button
                  key={days}
                  type="button"
                  className="seg-item tnum flex-1 px-0 py-2.5"
                  aria-pressed={answers.days === days}
                  aria-label={`Haftada ${days} gün`}
                  onClick={() => set({ days })}
                >
                  {days}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      );

    case "day":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Günün nasıl geçiyor?"
            why="Antrenman dışındaki hareket, kalori ihtiyacını antrenmanın kendisinden daha çok değiştirebiliyor. Bu cevap kaydedilmiyor; yalnızca hesaba giriyor."
          />
          <div className="mt-8 flex flex-col gap-2">
            {MOVEMENT_OPTIONS.map((option) => (
              <Choice
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={answers.movement === option.value}
                onSelect={() => set({ movement: option.value })}
              />
            ))}
          </div>

          <fieldset className="mt-8">
            <legend className="label">Beslenmede hedefin</legend>
            <div className="mt-1.5 flex flex-col gap-2">
              {NUTRITION_OPTIONS.map((option) => (
                <Choice
                  key={option.value}
                  label={option.label}
                  hint={option.hint}
                  selected={answers.nutrition_goal === option.value}
                  onSelect={() => set({ nutrition_goal: option.value })}
                />
              ))}
            </div>
          </fieldset>
        </>
      );
  }
}

function Question({
  title,
  why,
  headingRef,
}: {
  title: string;
  why: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className="display text-2xl outline-none lg:text-3xl">
        {title}
      </h1>
      {/* "Neden soruyoruz" başlığın hemen altında, "?" arkasında DEĞİL: bu
          ekranda kullanıcının vereceği karar tam olarak bu cümleye bağlı. */}
      <p className="mt-3 max-w-[56ch] text-sm text-[var(--color-ink-muted)]">{why}</p>
    </div>
  );
}

function Choice({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="choice" aria-pressed={selected} onClick={onSelect}>
      <span className="min-w-0">
        <span className="block text-base font-medium">{label}</span>
        <span className="block text-xs text-[var(--color-ink-muted)]">{hint}</span>
      </span>
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center"
        style={{
          border: `1px solid ${selected ? "var(--color-ink)" : "var(--color-border-strong)"}`,
          background: selected ? "var(--color-ink)" : "transparent",
          color: "var(--color-surface)",
        }}
      >
        {selected && <IconCheck className="size-4" />}
      </span>
    </button>
  );
}

function GoalCard({
  label,
  hint,
  photo,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  photo: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="relative block w-full text-left"
      style={{
        // Seçim fotoğrafın ÇEVRESİNDE: üstüne çizilen bir kenar koyu karede
        // kayboluyordu.
        outline: selected ? "3px solid var(--color-ink)" : "3px solid transparent",
        outlineOffset: "2px",
        transition: "outline-color var(--dur-micro) var(--ease-out)",
      }}
    >
      <Photo slug={photo} ratio="4 / 3" scrim>
        <span className="flex size-full flex-col justify-end p-3 lg:p-4">
          <span className="display block text-lg leading-tight" style={{ color: "oklch(99% 0 0)" }}>
            {label}
          </span>
          <span className="block text-xs" style={{ color: "oklch(86% 0.01 115)" }}>
            {hint}
          </span>
        </span>
      </Photo>
      {selected && (
        <span
          aria-hidden
          className="absolute right-2 top-2 grid size-6 place-items-center"
          style={{ background: "oklch(99% 0 0)", color: "oklch(17% 0.02 118)" }}
        >
          <IconCheck className="size-4" />
        </span>
      )}
    </button>
  );
}

function Measure({
  label,
  unit,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  inputMode: "numeric" | "decimal";
}) {
  return (
    <label className="card flex flex-col gap-2 p-4 lg:p-5">
      <span className="label">{label}</span>
      <span className="flex items-baseline gap-2">
        <input
          className="display tnum w-full min-w-0 bg-transparent text-3xl outline-none lg:text-4xl"
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="—"
          aria-label={`${label} (${unit})`}
        />
        <span className="text-sm text-[var(--color-ink-muted)]">{unit}</span>
      </span>
    </label>
  );
}

/* --- Sonuç ------------------------------------------------------------------------- */

const GOAL_LABEL: Record<NutritionGoal, string> = {
  cut: "yağ kaybı",
  maintain: "koruma",
  bulk: "kas kazanımı",
};

function Result({
  answers,
  headingRef,
}: {
  answers: Answers;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const router = useRouter();
  const target = useNutritionTarget();
  const programs = usePrograms();
  const templates = useTemplates();
  const clone = useCloneProgram();
  const activate = useActivateProgram();

  const name = answers.display_name.trim();
  const active = programs.data?.find((program) => program.is_active) ?? null;
  const recommendation =
    active === null && templates.data
      ? recommendTemplate(templates.data, {
          goal: answers.goal,
          experience: answers.experience,
          days: answers.days,
        })
      : null;
  const starting = clone.isPending || activate.isPending;

  async function start(templateId: string) {
    const created = await clone.mutateAsync(templateId);
    await activate.mutateAsync(created.id);
    router.replace("/");
  }

  return (
    <div className="reveal flex flex-1 flex-col">
      <p className="display text-lg">overload</p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="display mt-10 text-3xl outline-none lg:text-4xl"
      >
        {name ? `Hazırsın, ${name}.` : "Hazırsın."}
      </h1>
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
        Cevapların kaydedildi. Hepsini Hesap ekranından değiştirebilirsin.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        {/* --- Kalori ---------------------------------------------------- */}
        <section className="card p-6">
          <p className="label">Günlük kalori hedefin</p>
          {target.isLoading ? (
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Hesaplanıyor…</p>
          ) : target.data ? (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="display tnum text-4xl">
                  {target.data.calories.toLocaleString("tr-TR")}
                </span>
                <span className="text-sm text-[var(--color-ink-muted)]">kcal</span>
              </p>
              <p className="tnum mt-2 text-xs text-[var(--color-ink-muted)]">
                Protein {target.data.protein_g} g · Karbonhidrat {target.data.carbs_g} g · Yağ{" "}
                {target.data.fat_g} g
                {answers.nutrition_goal ? ` · ${GOAL_LABEL[answers.nutrition_goal]}` : ""}
              </p>
            </>
          ) : (
            // 422: eksik bilgi. Hata kutusu değil — bir şey bozulmadı, bir
            // şey eksik ve nereden tamamlanacağı belli.
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Hesaplamak için boy, doğum tarihi, cinsiyet ve kilo gerekiyor.{" "}
              <Link href="/account" className="link">
                Hesapta tamamla
              </Link>
            </p>
          )}
        </section>

        {/* --- Program --------------------------------------------------- */}
        {active !== null ? (
          <section className="card p-6">
            <p className="label">Aktif programın</p>
            <p className="display mt-2 text-xl">{active.name}</p>
          </section>
        ) : recommendation !== null ? (
          <section className="card overflow-hidden">
            <Photo
              slug={
                GOAL_OPTIONS.find((g) => g.value === recommendation.template.goal)?.photo ??
                "app-gym-wide"
              }
              ratio="21 / 9"
              scrim
            >
              <div className="flex size-full flex-col justify-end p-6">
                <p className="text-2xs" style={{ color: "oklch(86% 0.01 115)" }}>
                  Sana önerilen program
                </p>
                <p className="display mt-1 text-xl leading-tight" style={{ color: "oklch(99% 0 0)" }}>
                  {recommendation.template.name}
                </p>
                <p className="tnum text-xs" style={{ color: "oklch(86% 0.01 115)" }}>
                  haftada {recommendation.template.days_per_week} gün
                </p>
              </div>
            </Photo>
            {recommendation.note && (
              <p className="px-6 pt-4 text-xs text-[var(--color-ink-muted)]">
                {recommendation.note}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 p-6 pt-4">
              <button
                type="button"
                className="btn btn-primary py-3"
                disabled={starting}
                onClick={() => void start(recommendation.template.id).catch(() => undefined)}
              >
                {starting ? "Hazırlanıyor…" : "Bu programla başla"}
              </button>
              <Link href="/programs" className="btn btn-quiet">
                Diğer programlar
              </Link>
            </div>
            {(clone.isError || activate.isError) && (
              <div className="px-6 pb-6">
                <ErrorBox error={clone.error ?? activate.error} />
              </div>
            )}
          </section>
        ) : null}
      </div>

      <div className="mt-auto flex justify-end pt-10">
        {/* Önerilen program varsa birincil eylem o; panele geçmek ikincil.
            Ekranda iki volt düğme yarışmasın. */}
        <button
          type="button"
          className={`btn py-3 ${recommendation !== null ? "btn-ghost" : "btn-primary"}`}
          onClick={() => router.replace("/")}
        >
          Panele geç
        </button>
      </div>
    </div>
  );
}
