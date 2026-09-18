"use client";

/**
 * Tanışma adımlarının içerikleri.
 *
 * Her soru NE İŞE YARADIĞINI söylüyor ("bu bilgi şu sayıya gidiyor"): beş
 * soruyu cevaplamanın karşılığı görünmezse insanlar atlıyor. Akış, ilerleme
 * ve kaydetme `page.tsx`te.
 */

import { IconCheck } from "@/components/Icons";
import { Photo } from "@/components/Photo";
import {
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  MOVEMENT_OPTIONS,
  NUTRITION_OPTIONS,
  SEX_OPTIONS,
  type Answers,
  type StepId,
} from "./model";

/* --- Adım içerikleri -------------------------------------------------------------- */

export function StepBody({
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
      <Photo slug={photo} ratio="4 / 3" scrim sizes="(min-width: 1024px) 18rem, 45vw">
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
