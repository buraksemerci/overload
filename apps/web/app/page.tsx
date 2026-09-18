"use client";

/**
 * Pano — giriş yaptıktan sonra ilk ekran.
 *
 * --------------------------------------------------------------------------
 * İKİ KATMAN
 * --------------------------------------------------------------------------
 * 1. **Bant** — salondan bir kare, üstünde bugünün tek işi ve dört sayı:
 *    seri, kalan kalori, kilo, bu haftanın tonajı. Her gün gelen kişi için
 *    ekranın katlanma çizgisinin üstü bu; kaydırmadan karar verilebiliyor.
 * 2. **Bento** — o sayıların GRAFİKLERİ: haftalık tonajın gidişi, günün
 *    kalori halkası, kas dengesi, kilo eğilimi, tutarlılık ızgarası, son
 *    antrenmanlar. Detay isteyen kaydırıyor; her karo kendi ekranına gidiyor.
 *
 * Önceki sürüm bilinçli olarak sadeydi ("bir büyük kart, üç gösterge") ve
 * grafikleri kendi ekranlarına sürgün etmişti. Geniş ekranda sağı solu boş,
 * bir tablonun ilk satırı gibi duruyordu. Sadelik korunuyor ama başka bir
 * yoldan: katlanmanın üstü hâlâ tek soruya cevap veriyor, altı ise
 * "nasıl gidiyor" sorusunun görsel cevabı.
 *
 * --------------------------------------------------------------------------
 * DURUMA GÖRE, SAATE GÖRE DEĞİL
 * --------------------------------------------------------------------------
 * Bant neyi göstereceğini saatten değil durumdan çıkarıyor (antrenman sürüyor
 * mu, bugün yapıldı mı, dinlenme günü mü). Fotoğraf da duruma göre: yapılacak
 * bir antrenman varsa rafın başında biri, dinlenme gününde esneme.
 */

import { Hero, HeroStat, HeroStats, Page } from "@/components/Layout";
import { ErrorBox, fmt } from "@/components/States";
import { Greeting, PrimaryBlock, primaryState } from "@/components/dashboard/Primary";
import { RecentSessions, SectionGrid } from "@/components/dashboard/Sections";
import {
  CoachTile,
  ConsistencyTile,
  MuscleTile,
  NutritionTile,
  VolumeTile,
  WeightTile,
} from "@/components/dashboard/Tiles";
import { isToday } from "@/components/dashboard/model";
import {
  useHistory,
  useMe,
  useNutritionDay,
  useSessions,
  useStreak,
  useToday,
  useWeightTrend,
} from "@/lib/queries";
import {
  tonnage,
  weeklyVolume,
  weightSummary,
} from "@/lib/stats";

// Next 16 rotaları tipliyor; `href` gerçekten var olan bir rota olmak zorunda.

export default function DashboardPage() {
  const me = useMe();
  const today = useToday();
  const streak = useStreak();
  const sessions = useSessions(8);
  const history = useHistory(60);
  const nutritionGoal = me.data?.nutrition_goal ?? "maintain";
  const nutrition = useNutritionDay(null, nutritionGoal);
  const weight = useWeightTrend(90);

  const workout = today.data;
  const finishedToday =
    (sessions.data ?? []).find((s) => s.completed_at !== null && isToday(s.started_at)) ??
    null;
  const state = primaryState(workout, finishedToday);

  const weeks = weeklyVolume(history.data ?? [], 8);
  const thisWeek = weeks.at(-1)!;
  const remaining = nutrition.data?.remaining ?? null;
  const summary = weightSummary(weight.data ?? []);
  const weekTons = tonnage(thisWeek.volume);

  return (
    <Page>
      <Hero photo={state.photo} position="center" size="lg" quietTitle title={<Greeting />}>
        <PrimaryBlock state={state} loading={today.isLoading} />
        {today.isError && (
          <div className="mt-4 max-w-md">
            <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
          </div>
        )}

        <div className="mt-10">
          <HeroStats>
            <HeroStat
              label={(streak.data?.intact_weeks ?? 0) > 0 ? "Seri" : "Bu hafta"}
              value={
                (streak.data?.intact_weeks ?? 0) > 0
                  ? streak.data!.intact_weeks
                  : (streak.data?.this_week_sessions ?? "—")
              }
              unit={(streak.data?.intact_weeks ?? 0) > 0 ? "hafta" : undefined}
              foot={
                streak.data
                  ? `bu hafta ${streak.data.this_week_sessions}/${streak.data.weekly_target}`
                  : undefined
              }
            />
            <HeroStat
              label="Kalan"
              value={remaining ? fmt(remaining.calories, 0) : "—"}
              unit={remaining ? "kcal" : undefined}
              foot={remaining ? `${fmt(remaining.protein_g, 0)} g protein` : "hedef için profilini tamamla"}
            />
            <HeroStat
              label="Kilo"
              value={summary ? fmt(summary.latest, 1) : "—"}
              unit={summary ? "kg" : undefined}
              foot={
                summary
                  ? isToday(summary.date)
                    ? "bugün ölçüldü"
                    : "bugün ölçülmedi"
                  : "ilk ölçümünü gir"
              }
            />
            <HeroStat
              label="Bu hafta"
              value={thisWeek.volume > 0 ? weekTons.value : "—"}
              unit={thisWeek.volume > 0 ? weekTons.unit : undefined}
              foot={`${thisWeek.sessions} antrenman · ${thisWeek.sets} set`}
            />
          </HeroStats>
        </div>
      </Hero>

      <div className="grid gap-3 lg:grid-cols-12">
        <VolumeTile weeks={weeks} className="lg:col-span-8" />
        <NutritionTile className="lg:col-span-4" goal={nutritionGoal} />
        <MuscleTile className="lg:col-span-5" />
        <WeightTile className="lg:col-span-7" />
        <ConsistencyTile className="lg:col-span-7" />
        <CoachTile className="lg:col-span-5" />
      </div>

      <RecentSessions sessions={history.data ?? []} />

      <section>
        <h2 className="display mb-4 text-xl lg:text-2xl">Bölümler</h2>
        <SectionGrid />
      </section>
    </Page>
  );
}
