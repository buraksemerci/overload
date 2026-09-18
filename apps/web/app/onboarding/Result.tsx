"use client";

/**
 * Tanışmanın sonu: cevapların karşılığı olan iki sayı ve önerilen program.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Photo } from "@/components/Photo";
import { ErrorBox } from "@/components/States";
import { recommendTemplate } from "@/lib/onboarding";
import {
  useActivateProgram,
  useCloneProgram,
  useNutritionTarget,
  usePrograms,
  useTemplates,
} from "@/lib/queries";
import type { NutritionGoal } from "@/lib/onboarding";
import { GOAL_OPTIONS, type Answers } from "./model";

/* --- Sonuç ------------------------------------------------------------------------- */

const GOAL_LABEL: Record<NutritionGoal, string> = {
  cut: "yağ kaybı",
  maintain: "koruma",
  bulk: "kas kazanımı",
};

export function Result({
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
