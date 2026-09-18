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

import { useEffect, useRef, useState } from "react";
import { Photo } from "@/components/Photo";
import { ErrorBox, Loading } from "@/components/States";
import type { Me } from "@/lib/auth";
import { activityFrom } from "@/lib/onboarding";
import {
  STEPS,
  STEP_FIELDS,
  parseDecimal,
  problem,
  seed,
  type Answers,
  type StepId,
} from "./model";
import { Result } from "./Result";
import { StepBody } from "./steps";
import { useCompleteOnboarding, useMe } from "@/lib/queries";

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

/**
 * Adım fotoğrafları.
 *
 * Her soru neyi belirlediğini anlatıyor; sağdaki kare de onu gösteriyor:
 * boy-kilo sorusunda tartı, deneyim sorusunda plakalar, hedef sorusunda
 * squat rafı. Uygulamanın geri kalanıyla aynı salon.
 */
const STEP_PHOTO: Record<StepId, string> = {
  intro: "story-entry",
  basics: "app-entry",
  body: "app-scale",
  experience: "app-plates",
  goal: "app-squat",
  day: "app-meal-bar",
};

function Shell({ children, photo }: { children: React.ReactNode; photo?: string }) {
  return (
    /* Geniş ekranda iki sütun: solda sorular, sağda sahne. Tek sütunda
       masaüstünde ekranın üçte ikisi siyah kalıyordu ve akış, uygulamanın
       geri kalanından kopuk duruyordu. Dar ekranda sahne YOK — orada yer
       sorulara ait. */
    <div className="grid min-h-dvh w-full lg:grid-cols-[minmax(0,38rem)_1fr]">
      <div className="mx-auto flex w-full max-w-xl flex-col px-1 pb-8 pt-6 lg:px-6 lg:pt-12">
        {children}
      </div>

      {photo !== undefined && (
        <div aria-hidden className="relative hidden lg:block">
          <div className="fixed top-0 right-0 h-dvh w-[calc(100vw-38rem)]">
            <Photo
              slug={photo}
              fill
              position="center"
              /* Dar ekranda sahne YOK (`hidden lg:block`) ama görsel yine de
                 indiriliyordu. 1 piksel diyerek tarayıcı en küçük adayı
                 seçiyor; geniş ekranda sütunun gerçek genişliği veriliyor. */
              sizes="(min-width: 1024px) calc(100vw - 38rem), 1px"
              className="size-full"
              eager
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, var(--color-ground) 0%, oklch(12% 0.01 115 / 0.45) 40%, oklch(12% 0.01 115 / 0.2) 100%)",
              }}
            />
          </div>
        </div>
      )}
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
      <Shell photo="app-gym-wide">
        <Result answers={answers} headingRef={heading} />
      </Shell>
    );
  }

  const questionCount = STEPS.length - 1;
  const answered = Math.max(index - 1, 0);

  return (
    /* Sahne adımla değişiyor: sorunun konusu sağda duruyor. Açılış adımı
       kendi tam genişlik sahnesini basıyor, orada ikinci bir fotoğraf
       gereksiz. */
    <Shell photo={step === "intro" ? undefined : STEP_PHOTO[step]}>
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
