"use client";

/**
 * Vücut — "şu an ne durumdayım" tek ekranda.
 *
 * --------------------------------------------------------------------------
 * NEDEN AYRI BİR ÖZET
 * --------------------------------------------------------------------------
 * "Vücut" başlığına tıklayan kişi ilerleme ekranına düşüyordu: bir güç
 * standartları kartı, bir tutarlılık ızgarası, bir rekor listesi. Doğru
 * veriler ama sorulan soru "vücudum nasıl" idi ve cevabı dört ekrana
 * dağılmıştı (ilerleme, kas haritası, kilo, ağrı).
 *
 * Bu ekran o soruyu EN KISA yoldan cevaplıyor:
 *
 *   1. Bantta tek cümle ve dört sayı — kilo gidişi, kas dengesi, güç
 *      seviyesi, toparlanma. Kaydırmadan okunuyor.
 *   2. Altında her sayının küçük görseli — kas haritası, kilo eğrisi, kaldırış
 *      seviyeleri, bugünkü ağrılar.
 *   3. En altta ayrıntıya giden fotoğraflı karolar. Detay isteyen oradan
 *      gidiyor; istemeyen hiç kaydırmak zorunda değil.
 */

import Link from "next/link";
import { Meter, Trend } from "@/components/Charts";
import { Hero, HeroStat, HeroStats, Page } from "@/components/Layout";
import { HeatLegend, MuscleMap } from "@/components/MuscleMap";
import { Photo } from "@/components/Photo";
import { fmt } from "@/components/States";
import {
  useBestRecords,
  useInjuries,
  useMuscleVolume,
  useSoreness,
  useStrengthStandards,
  useWeightTrend,
  type SorenessRow,
  type StrengthStandards,
} from "@/lib/queries";
import { muscleBalance, shortDay, weightSummary } from "@/lib/stats";

type Href = React.ComponentProps<typeof Link>["href"];

export default function BodyPage() {
  const weight = useWeightTrend(90);
  const volume = useMuscleVolume(7);
  const standards = useStrengthStandards();
  const soreness = useSoreness(1);
  const injuries = useInjuries();

  const summary = weightSummary(weight.data ?? []);
  const balance = muscleBalance(volume.data ?? []);
  const level = dominantLevel(standards.data);
  const recovery = recoveryOf(soreness.data ?? [], (injuries.data ?? []).filter((i) => i.is_active).length);

  return (
    <Page>
      <Hero
        photo="app-body"
        position="70% center"
        size="lg"
        eyebrow="Vücut"
        title="Şu anki durumun"
        lead={sentence(summary, balance, recovery)}
      >
        <HeroStats>
          <HeroStat
            label="Kilo"
            value={summary ? fmt(summary.latest, 1) : "—"}
            unit={summary ? "kg" : undefined}
            foot={
              summary?.delta != null
                ? `${summary.delta > 0 ? "+" : ""}${fmt(summary.delta, 1)} kg · 30 gün`
                : "eğilim için daha fazla tartı"
            }
          />
          <HeroStat
            label="Kas dengesi"
            value={balance.total > 0 ? Math.round(balance.onTarget * 100) : "—"}
            unit={balance.total > 0 ? "%" : undefined}
            foot="bu hafta hedefteki kaslar"
          />
          <HeroStat
            label="Güç seviyesi"
            value={level?.label ?? "—"}
            foot={level ? `${level.count} kaldırışta` : "ağır bir set gir"}
          />
          <HeroStat label="Toparlanma" value={recovery.label} foot={recovery.foot} />
        </HeroStats>
      </Hero>

      <div className="grid gap-3 lg:grid-cols-12">
        <MapTile className="lg:col-span-7 lg:row-span-2" />
        <WeightTile className="lg:col-span-5" />
        <RecoveryTile className="lg:col-span-5" soreness={soreness.data ?? []} />
        <StrengthTile className="lg:col-span-7" standards={standards.data} />
        <RecordsTile className="lg:col-span-5" />
      </div>

      <section>
        <h2 className="display mb-4 text-xl lg:text-2xl">Ayrıntı</h2>
        <ul className="grid auto-rows-[14rem] gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DETAILS.map((detail) => (
            <li key={String(detail.href)}>
              <Link href={detail.href} className="card lift block size-full overflow-hidden">
                <Photo
                  slug={detail.photo}
                  fill
                  scrim
                  position={detail.position}
                  sizes="(min-width: 1024px) 25vw, 100vw"
                  className="size-full"
                >
                  <div className="flex size-full flex-col justify-end p-6">
                    <p className="display on-photo-dark text-2xl" style={{ color: "var(--color-on-night)" }}>
                      {detail.title}
                    </p>
                    <p className="on-photo-dark mt-1 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
                      {detail.note}
                    </p>
                  </div>
                </Photo>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}

const DETAILS: ReadonlyArray<{ href: Href; photo: string; title: string; note: string; position?: string }> = [
  { href: "/muscle-map", photo: "app-dumbbells", title: "Kas haritası", note: "Haftalık hacim, kas kas" },
  { href: "/progress", photo: "app-plates", title: "İlerleme", note: "Güç standartları ve rekorlar" },
  { href: "/weight", photo: "app-scale", title: "Kilo", note: "Tartı ve hareketli ortalama", position: "right" },
  { href: "/soreness", photo: "app-stretch", title: "Ağrı", note: "Günlük check-in, sakatlıklar", position: "right" },
];

/* --- Özet cümle ve sayılar ------------------------------------------------------ */

function sentence(
  summary: ReturnType<typeof weightSummary>,
  balance: ReturnType<typeof muscleBalance>,
  recovery: Recovery,
): string {
  const parts: string[] = [];
  if (balance.total > 0) {
    const lagging = balance.lagging[0];
    parts.push(
      lagging
        ? `Bu hafta kasların %${Math.round(balance.onTarget * 100)}'i hedefte; en geride ${lagging.name_tr.toLocaleLowerCase("tr-TR")}.`
        : "Bu hafta bütün kaslar hedefte.",
    );
  }
  if (summary?.delta != null) {
    const direction = Math.abs(summary.delta) < 0.3 ? "sabit" : summary.delta > 0 ? "artıyor" : "azalıyor";
    parts.push(`Kilon son 30 günde ${direction}.`);
  }
  parts.push(recovery.sentence);
  return parts.join(" ");
}

function dominantLevel(standards: StrengthStandards | undefined) {
  const results = standards?.results ?? [];
  if (results.length === 0) return null;
  const counts = new Map<string, { label: string; count: number }>();
  for (const result of results) {
    const entry = counts.get(result.level) ?? { label: result.level_label, count: 0 };
    entry.count += 1;
    counts.set(result.level, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]!;
}

interface Recovery {
  label: string;
  foot: string;
  sentence: string;
  worst: number;
}

function recoveryOf(today: readonly SorenessRow[], activeInjuries: number): Recovery {
  const worst = today.reduce((max, row) => Math.max(max, row.level), 0);
  const sore = today.filter((row) => row.level > 0).length;
  if (activeInjuries > 0) {
    return {
      label: "Dikkat",
      foot: `${activeInjuries} aktif sakatlık`,
      sentence: "Aktif bir sakatlığın var; ilgili hareketler işaretli.",
      worst,
    };
  }
  if (worst >= 3) {
    return {
      label: "Yorgun",
      foot: `${sore} bölgede belirgin ağrı`,
      sentence: "Bazı kaslar belirgin ağrılı — o bölgeyi bugün hafif tut.",
      worst,
    };
  }
  if (sore > 0) {
    return {
      label: "İyi",
      foot: `${sore} bölgede hafif ağrı`,
      sentence: "Hafif ağrılar var ama antrenmana engel değil.",
      worst,
    };
  }
  return {
    label: "Hazır",
    foot: today.length > 0 ? "ağrı yok" : "bugün check-in yok",
    sentence: today.length > 0 ? "Ağrı bildirmedin; antrenmana hazırsın." : "Bugün ağrı check-in'i yapmadın.",
    worst,
  };
}

/* --- Karolar ------------------------------------------------------------------------ */

function Head({ eyebrow, href, night = false }: { eyebrow: string; href: Href; night?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="label" style={{ color: night ? "var(--color-on-night-faint)" : undefined }}>
        {eyebrow}
      </p>
      <Link
        href={href}
        className="text-xs underline-offset-4 hover:underline"
        style={{ color: night ? "var(--color-on-night-muted)" : "var(--color-ink-muted)" }}
      >
        Ayrıntı →
      </Link>
    </div>
  );
}

function MapTile({ className }: { className: string }) {
  const volume = useMuscleVolume(7);
  const rows = volume.data ?? [];
  const balance = muscleBalance(rows);

  return (
    <section className={`tile-night flex flex-col p-6 lg:p-8 ${className}`}>
      <Head eyebrow="Kas haritası · 7 gün" href="/muscle-map" night />
      <div className="mt-6 grid flex-1 items-center gap-8 md:grid-cols-[minmax(0,1fr)_14rem]">
        <MuscleMap
          night
          pair
          interactive={false}
          volumes={rows.map((row) => ({
            slug: row.slug,
            nameTr: row.name_tr,
            svgId: row.svg_id,
            region: row.region,
            sets: row.sets,
            target: row.target,
          }))}
        />
        <div>
          <p className="label" style={{ color: "var(--color-on-night-faint)" }}>
            En geride
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {balance.lagging.slice(0, 5).map((row) => (
              <li key={row.slug}>
                <p className="flex justify-between text-sm" style={{ color: "var(--color-on-night)" }}>
                  <span className="truncate">{row.name_tr}</span>
                  <span className="tnum text-xs" style={{ color: "var(--color-on-night-muted)" }}>
                    {fmt(row.sets, 0)}/{row.target} set
                  </span>
                </p>
                <div className="mt-1.5">
                  <Meter night value={row.sets} max={row.target} />
                </div>
              </li>
            ))}
            {balance.total > 0 && balance.lagging.length === 0 && (
              <li className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
                Bütün kaslar hedefte.
              </li>
            )}
            {balance.total === 0 && (
              <li className="text-sm" style={{ color: "var(--color-on-night-muted)" }}>
                İlk antrenmanından sonra dolmaya başlıyor.
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="mt-6">
        <HeatLegend night />
      </div>
    </section>
  );
}

function WeightTile({ className }: { className: string }) {
  const weight = useWeightTrend(90);
  const points = weight.data ?? [];
  const summary = weightSummary(points);

  return (
    <section className={`card flex flex-col p-6 lg:p-8 ${className}`}>
      <Head eyebrow="Kilo · 90 gün" href="/weight" />
      {summary ? (
        <>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="display tnum text-4xl leading-none">{fmt(summary.latest, 1)}</span>
            <span className="text-sm text-[var(--color-ink-muted)]">kg</span>
          </p>
          <div className="mt-4">
            {points.length >= 2 && (
              <Trend
                id="vucut-kilo"
                unit="kg"
                height={140}
                data={points.map((point) => ({
                  label: shortDay(new Date(`${point.date}T00:00:00`)),
                  value: Number.parseFloat(point.weight_kg),
                  average: point.moving_average === null ? null : Number.parseFloat(point.moving_average),
                }))}
              />
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          İlk tartını gir — eğilim burada çizilecek.{" "}
          <Link href="/weight" className="link">
            Tartı ekle
          </Link>
        </p>
      )}
    </section>
  );
}

const SORE_LABEL = ["Yok", "Hafif", "Orta", "Belirgin", "Kısıtlayıcı"];

function RecoveryTile({ className, soreness }: { className: string; soreness: readonly SorenessRow[] }) {
  const sore = [...soreness].filter((row) => row.level > 0).sort((a, b) => b.level - a.level);

  return (
    <section className={`card flex flex-col p-6 lg:p-8 ${className}`}>
      <Head eyebrow="Bugünkü ağrılar" href="/soreness" />
      {sore.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {sore.slice(0, 5).map((row) => (
            <li key={row.id}>
              <p className="flex justify-between text-sm">
                <span>{row.muscle_group_name}</span>
                <span className="text-xs" style={{ color: row.level >= 3 ? "var(--color-warning)" : "var(--color-ink-muted)" }}>
                  {SORE_LABEL[row.level]}
                </span>
              </p>
              <div className="mt-1.5">
                <Meter value={row.level} max={4} tone={row.level >= 3 ? "warning" : "neutral"} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          {soreness.length > 0 ? "Bugün ağrı bildirmedin." : "Bugün check-in yapmadın."}{" "}
          <Link href="/soreness" className="link">
            Check-in yap
          </Link>
        </p>
      )}
    </section>
  );
}

function StrengthTile({ className, standards }: { className: string; standards: StrengthStandards | undefined }) {
  const results = standards?.results ?? [];

  return (
    <section className={`card flex flex-col p-6 lg:p-8 ${className}`}>
      <Head eyebrow="Güç seviyesi" href="/progress" />
      {results.length > 0 ? (
        <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {results.map((result) => (
            <li key={result.lift_key}>
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{result.lift_label}</span>
                <span className="label">{result.level_label}</span>
              </p>
              <p className="mt-1 flex items-baseline gap-1">
                <span className="display tnum text-2xl leading-none">{fmt(result.estimated_1rm, 1)}</span>
                <span className="text-xs text-[var(--color-ink-muted)]">kg · {fmt(result.bodyweight_ratio, 2)}× VA</span>
              </p>
              <div className="mt-2">
                <Meter value={result.progress_to_next} max={1} />
              </div>
              {result.next_level_label && result.next_level_kg && (
                <p className="mt-1 text-2xs text-[var(--color-ink-faint)]">
                  {result.next_level_label} için {fmt(result.next_level_kg, 1)} kg
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          {standards?.unavailable_reason ?? "Temel kaldırışlarda ağır bir set girdiğinde seviyen hesaplanıyor."}
        </p>
      )}
    </section>
  );
}

function RecordsTile({ className }: { className: string }) {
  const records = useBestRecords();
  const rows = (records.data ?? []).slice(0, 4);

  return (
    <section className={`tile-night flex flex-col p-6 lg:p-8 ${className}`}>
      <Head eyebrow="Son rekorlar" href="/progress" night />
      {rows.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y" style={{ borderColor: "var(--color-night-line)" }}>
          {rows.map((row) => {
            const best = row.records.find((r) => r.type === "estimated_1rm") ?? row.records[0];
            return (
              <li key={row.exercise_id} className="flex items-baseline justify-between gap-3 py-3" style={{ borderColor: "var(--color-night-line)" }}>
                <span className="truncate text-sm" style={{ color: "var(--color-on-night)" }}>
                  {row.name}
                </span>
                {best && (
                  <span className="display tnum shrink-0 text-xl" style={{ color: "var(--color-on-night)" }}>
                    {fmt(best.value, 1)}
                    <span className="ml-1 font-sans text-xs font-normal" style={{ color: "var(--color-on-night-muted)" }}>
                      kg
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm" style={{ color: "var(--color-on-night-muted)" }}>
          İlk antrenmanını tamamladığında her hareket için rekorlar burada.
        </p>
      )}
    </section>
  );
}
