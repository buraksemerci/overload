"use client";

/**
 * Karşılama ekranı.
 *
 * --------------------------------------------------------------------------
 * ÜÇ KATMAN
 * --------------------------------------------------------------------------
 * 1. **Bugün** — kullanıcı adıyla karşılanıyor, altında o an yapılacak tek
 *    iş ve üç gösterge. Buraya her gün gelen kişi için ekranın tamamı bu.
 * 2. **Anlatı** — aşağı kaydırınca bir günün dört ânı geçiyor ve her biri
 *    ilgili bölüme bağlanıyor. Uygulamayı ilk kez açan için burası harita.
 * 3. **Bölümler** — anlatının altında dört ana bölüme giden bento kartlar.
 *
 * Sıra kasıtlı: her gün gelen kişi kaydırmak zorunda kalmıyor, yeni gelen
 * kişi aşağı inince ne olduğunu öğreniyor.
 *
 * --------------------------------------------------------------------------
 * SADELİK BÜTÇESİ — "Bugün" katmanının tek kuralı
 *
 * --------------------------------------------------------------------------
 * SADELİK BÜTÇESİ — bu ekranın tek kuralı
 * --------------------------------------------------------------------------
 * Bir büyük kart, en fazla üç küçük gösterge. Başka hiçbir şey.
 *
 * Eski panel dört şeyi birden gösteriyordu: seri, haftalık hacim, bugünün
 * hareket listesi ve mini kas haritası. Hepsi doğru veriydi ama hiçbiri
 * "şimdi ne yapayım" sorusuna cevap vermiyordu — kullanıcı dört bloğu okuyup
 * kararı kendi çıkarmak zorundaydı.
 *
 * Şimdi büyük kart o kararı veriyor, göstergeler yalnızca bağlam.
 * Kas haritası, tutarlılık ızgarası, rekor listesi kendi ekranlarında kalıyor;
 * detay isteyen kenar çubuğundan gidiyor.
 *
 * --------------------------------------------------------------------------
 * DURUMA GÖRE, SAATE GÖRE DEĞİL
 * --------------------------------------------------------------------------
 * Büyük kart neyi göstereceğini saatten değil durumdan çıkarıyor. Saat tek
 * başına yanıltıcı: vardiyalı çalışan ya da gece antrenman yapan biri için
 * "akşam oldu, günü özetle" yanlış an. Saat yalnızca ikincil bir ipucu
 * olarak kullanılıyor (sabah kilo sormak gibi).
 */

import Link from "next/link";
import { Page } from "@/components/Layout";
import { Photo } from "@/components/Photo";
import { Scrollytelling } from "@/components/Scrollytelling";
import { ErrorBox, Loading, fmt } from "@/components/States";
import {
  useMe,
  useNutritionDay,
  useSessions,
  useStreak,
  useToday,
  useWeightTrend,
  type TodayWorkout,
  type WorkoutSession,
} from "@/lib/queries";

// Next 16 rotaları tipliyor; `href` gerçekten var olan bir rota olmak zorunda.
// Yanlış yazılmış bir rota derleme zamanında yakalanıyor.
type Href = React.ComponentProps<typeof Link>["href"];

export default function DashboardPage() {
  const today = useToday();
  const streak = useStreak();
  const sessions = useSessions(8);
  const nutrition = useNutritionDay(null, "maintain");
  const weight = useWeightTrend(14);

  if (today.isLoading) return <Loading />;
  if (today.isError)
    return <ErrorBox error={today.error} onRetry={() => void today.refetch()} />;

  const workout = today.data;
  const finishedToday =
    (sessions.data ?? []).find((s) => s.completed_at !== null && isToday(s.started_at)) ??
    null;

  const target = nutrition.data?.target ?? null;
  const remaining = nutrition.data?.remaining ?? null;
  const latestWeight = weight.data?.at(-1) ?? null;
  const weighedToday = latestWeight ? isToday(latestWeight.date) : false;

  return (
    // `flush`: panel kendi ızgarasını ve kademeli açılış gecikmelerini
    // kuruyor, `Page`in dikey ritmi onun aralıklarını bozuyordu.
    <Page flush>
      <Greeting />

      <div className="reveal mt-6" style={{ "--i": 1 } as React.CSSProperties}>
        <PrimaryCard workout={workout} finishedToday={finishedToday} />
      </div>

      {/* Kolonlar BİLEREK eşit değil. Üç özdeş kutu yan yana dizmek en
          tanınabilir "üretilmiş arayüz" deseni; ayrıca eşit genişlik, eşit
          önem demek — oysa gün içinde en çok bakılan gösterge kalan makro.
          Ortadaki kolon geniş olduğu için iki rakamı birden taşıyabiliyor. */}
      <div
        className="reveal mt-4 grid gap-4 lg:grid-cols-[1fr_1.5fr_1fr]"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <StreakTile
          weeks={streak.data?.intact_weeks}
          thisWeek={streak.data?.this_week_sessions}
          weeklyTarget={streak.data?.weekly_target}
        />

        {target && remaining ? (
          <MacroTile calories={remaining.calories} protein={remaining.protein_g} />
        ) : (
          <Tile
            label="Beslenme"
            value="—"
            foot="Hedef için profilini tamamla"
            href="/account"
          />
        )}

        {latestWeight ? (
          <Tile
            label="Kilo"
            value={fmt(latestWeight.weight_kg, 1)}
            unit="kg"
            foot={weighedToday ? "bugün ölçüldü" : "bugün ölçülmedi"}
            href="/weight"
          />
        ) : (
          <Tile label="Kilo" value="—" foot="İlk ölçümünü gir" href="/weight" />
        )}
      </div>

      {/* --- Anlatı ------------------------------------------------------
          TAM GENİŞLİK: sahne ekranın tamamını kaplamak zorunda. `Page` kabı
          80rem'de duruyor ve negatif kenar boşluğu yalnızca dolguyu geri
          alıyordu — sahne 1440px'lik bir ekranda iki yanında beyaz şeritle
          kalıyor, bir video oynatıcı gibi duruyordu.

          `50% - 50vw` kabın ortasından ekranın kenarına kadar geri çekiyor.
          `100vw` kaydırma çubuğunu da sayıyor; taşmayı `body`deki
          `overflow-x: clip` kesiyor. */}
      <div
        className="mt-16"
        style={{ width: "100vw", marginInline: "calc(50% - 50vw)" }}
      >
        <Scrollytelling />
      </div>

      {/* --- Bölümler ---------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="label mb-3">Bölümler</h2>
        <SectionGrid />
      </section>
    </Page>
  );
}

/* --- Bölüm kartları -------------------------------------------------------
   Bento: kartlar eşit değil. İlk kart iki sütun kaplıyor çünkü uygulamanın
   ana işi orada; kalan üçü eşit. Dört özdeş kutu dizmek en tanınabilir
   "üretilmiş arayüz" deseni ve hepsinin aynı önemde olduğunu söylüyor. */

const SECTIONS: ReadonlyArray<{
  href: Href;
  photo: string;
  title: string;
  note: string;
  wide?: boolean;
}> = [
  {
    href: "/workout",
    photo: "nav-antrenman",
    title: "Antrenman",
    note: "Bugünün akışı, programlar, hareket kütüphanesi, geçmiş",
    wide: true,
  },
  {
    href: "/nutrition",
    photo: "nav-beslenme",
    title: "Beslenme",
    note: "Günlük ve supplement",
  },
  {
    href: "/progress",
    photo: "nav-vucut",
    title: "Vücut",
    note: "İlerleme, kas haritası, kilo, ağrı",
  },
  {
    href: "/chat",
    photo: "nav-asistan",
    title: "Asistan",
    note: "Sohbet ve haftalık rapor",
  },
];

function SectionGrid() {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SECTIONS.map((section, index) => (
        <li
          key={String(section.href)}
          className={`reveal ${section.wide ? "lg:col-span-2" : ""}`}
          style={{ ["--i" as string]: index }}
        >
          <Link href={section.href} className="card block h-full overflow-hidden">
            <Photo
              slug={section.photo}
              ratio={section.wide ? "2 / 1" : "4 / 3"}
              scrim
            >
              <div className="flex size-full flex-col justify-end p-5 lg:p-6">
                <p
                  className="display text-lg lg:text-xl"
                  style={{ color: "oklch(99% 0 0)" }}
                >
                  {section.title}
                </p>
                <p className="mt-1 text-xs" style={{ color: "oklch(86% 0.01 115)" }}>
                  {section.note}
                </p>
              </div>
            </Photo>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* --- Selamlama ------------------------------------------------------------ */

function Greeting() {
  const me = useMe();
  const now = new Date();
  const hour = now.getHours();
  const part =
    hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

  /* Ad varsa selamlamaya giriyor. Yoksa selamlama tek başına kalıyor —
     "Hoş geldin, " diye biten bir cümle, boş bir ada işaret etmekten kötü.
     E-posta ADRESİ ad yerine KULLANILMIYOR: "Günaydın, kbura@gmail.com"
     karşılama değil, veritabanı çıktısı. */
  const name = me.data?.display_name?.trim();

  // Selamlama tek başına bilgi taşımıyor; tarih onu işe yarar hâle getiriyor.
  const date = now.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  return (
    <div className="reveal" style={{ "--i": 0 } as React.CSSProperties}>
      <h1 className="display text-2xl lg:text-3xl">
        {name ? `${part}, ${name}` : part}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-ink-faint)]">{date}</p>
    </div>
  );
}

/* --- Büyük kart ----------------------------------------------------------- */

function PrimaryCard({
  workout,
  finishedToday,
}: {
  workout: TodayWorkout | undefined;
  finishedToday: WorkoutSession | null;
}) {
  // 1. Yarım kalmış seans her şeyin önünde: kullanıcı salonun ortasında.
  if (workout?.active_session_id) {
    return (
      <Hero
        eyebrow="Devam ediyor"
        title={workout.day_label ?? "Antrenman"}
        note={`${workout.exercises.length} hareket planlı`}
        action={{ href: "/workout", label: "Devam et" }}
      />
    );
  }

  // 2. Hiç aktif program yok — yeni kullanıcının düştüğü yer.
  if (!workout || workout.program_name === null) {
    return (
      <Hero
        eyebrow="Başlangıç"
        title="Bir program seç"
        note="Hazır şablonlardan birini başlat ya da asistana kendi programını kurdur."
        action={{ href: "/programs", label: "Programlara git" }}
      />
    );
  }

  // 3. Program var ama bugün hareket yok — dinlenme günü.
  //    Bunu "program yok" ile aynı kefeye koymak yanlıştı: kullanıcıyı zaten
  //    sahip olduğu programı seçmeye yönlendiriyordu.
  if (workout.exercises.length === 0) {
    return (
      <Hero
        eyebrow={workout.program_name}
        title="Dinlenme günü"
        note="Bugün planlı antrenman yok. Toparlanma da programın parçası."
        action={{ href: "/programs", label: "Programı gör", quiet: true }}
        warn={workout.is_deload_suggested ? "Bu hafta deload önerilir" : undefined}
      />
    );
  }

  // 4. Bugün tamamlandı — muğlak bir tebrik cümlesi yerine ne yapıldığı.
  if (finishedToday) {
    const working = finishedToday.sets.filter((s) => !s.is_warmup);
    const tonnage = working.reduce(
      (sum, s) => sum + Number.parseFloat(s.weight_kg) * s.reps,
      0,
    );
    return (
      <Hero
        eyebrow="Tamamlandı"
        title={workout.day_label ?? "Antrenman"}
        note={
          tonnage > 0
            ? `${working.length} set · ${fmt(tonnage, 0)} kg tonaj`
            : `${working.length} set`
        }
        action={{ href: "/history", label: "Seansı gör", quiet: true }}
        done
      />
    );
  }

  // 5. Varsayılan: bugün sırada olan antrenman.
  return (
    <Hero
      eyebrow={workout.program_name ?? "Bugün"}
      title={workout.day_label ?? "Antrenman"}
      note={`${workout.exercises.length} hareket · ${totalSets(workout)} set`}
      action={{ href: "/workout", label: "Antrenmanı başlat" }}
      warn={workout.is_deload_suggested ? "Bu hafta deload önerilir" : undefined}
    />
  );
}

function Hero({
  eyebrow,
  title,
  note,
  action,
  warn,
  done,
}: {
  eyebrow: string;
  title: string;
  note: string;
  action: { href: Href; label: string; quiet?: boolean };
  warn?: string;
  done?: boolean;
}) {
  return (
    // Cömert dikey dolgu bilinçli. Bu kart ekranın tek karar noktası; ince bir
    // şerit hâlinde durduğunda altındaki üç küçük kutuyla aynı ağırlığa
    // düşüyor ve hiyerarşi kayboluyor. Yüksekliği veriyle değil boşlukla
    // kazanıyor — sade kalması bu yüzden mümkün.
    <section className="card px-8 py-10 lg:px-12 lg:py-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {/* Tamamlandı işareti küçük bir volt madalyon.
              İlk denemede kartın TAMAMINI soluk bir volt yıkamasıyla
              doldurmuştum; ekranda çeyrek alan kaplıyordu ve "ekran başına bir
              volt öğesi" kuralını açıkça ihlal ediyordu — vurgu olmaktan çıkıp
              zemin rengine dönüşüyordu. Aynı bilgiyi 18px'lik bir madalyon
              taşıyor. */}
          <p className="flex items-center gap-2">
            {done && (
              <span
                aria-hidden
                className="grid size-[18px] shrink-0 place-items-center rounded-full"
                style={{ background: "var(--color-accent)" }}
              >
                <svg
                  width="11"
                  height="11"
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
            )}
            <span className="label">{eyebrow}</span>
          </p>
          {/* Ekranın tek odak noktası. Big Shoulders sıkışık bir yüz; aynı
              optik ağırlığa ulaşmak için geniş bir gövde yazısından daha
              büyük punto gerekiyor. */}
          <h2 className="display mt-2.5 text-3xl leading-[1.02] lg:text-4xl">{title}</h2>
          <p className="mt-4 max-w-[46ch] text-sm text-[var(--color-ink-muted)]">{note}</p>

          {warn && (
            <p className="mt-3 text-xs" style={{ color: "var(--color-warning)" }}>
              {warn}
            </p>
          )}
        </div>

        <Link
          href={action.href}
          className={`${action.quiet ? "btn btn-ghost" : "btn btn-primary"} shrink-0 lg:px-6 lg:py-3 lg:text-base`}
        >
          {action.label}
        </Link>
      </div>
    </section>
  );
}

/* --- Küçük göstergeler ---------------------------------------------------- */

function Tile({
  label,
  value,
  unit,
  foot,
  href,
}: {
  label: string;
  value: string | number;
  unit?: string;
  foot?: string;
  href: Href;
}) {
  return (
    <Link
      href={href}
      className="card group flex flex-col justify-between p-5 transition-colors hover:bg-[var(--color-surface-raised)]"
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      <p className="label">{label}</p>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="figure text-3xl">{value}</span>
        {unit && <span className="text-sm text-[var(--color-ink-muted)]">{unit}</span>}
      </p>
      {foot && <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{foot}</p>}
    </Link>
  );
}

/** Geniş kolon: kalan kalori ve protein birlikte. Gün içinde en çok bakılan yer. */
function MacroTile({ calories, protein }: { calories: string; protein: string }) {
  return (
    <Link
      href="/nutrition"
      className="card flex flex-col justify-between p-5 transition-colors hover:bg-[var(--color-surface-raised)]"
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      <p className="label">Kalan</p>
      <div className="mt-4 flex items-baseline gap-6">
        <p className="flex items-baseline gap-1.5">
          <span className="figure text-3xl">{fmt(calories, 0)}</span>
          <span className="text-sm text-[var(--color-ink-muted)]">kcal</span>
        </p>
        {/* Ayırıcı çizgi: iki rakamı gruplamak yerine ayırıyor, çünkü
            farklı birimler ve kullanıcı ikisine ayrı ayrı bakıyor. */}
        <span aria-hidden className="h-7 w-px bg-[var(--color-border)]" />
        <p className="flex items-baseline gap-1.5">
          <span className="figure text-3xl">{fmt(protein, 0)}</span>
          <span className="text-sm text-[var(--color-ink-muted)]">g protein</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-[var(--color-ink-faint)]">günlük hedefe kalan</p>
    </Link>
  );
}

function StreakTile({
  weeks,
  thisWeek,
  weeklyTarget,
}: {
  weeks: number | undefined;
  thisWeek: number | undefined;
  weeklyTarget: number | undefined;
}) {
  // Seri varsa onu göster; yoksa bu haftanın doluluğu daha kullanışlı bir bilgi.
  const hasStreak = (weeks ?? 0) > 0;

  return (
    <Link
      href="/progress"
      className="card flex flex-col justify-between p-5 transition-colors hover:bg-[var(--color-surface-raised)]"
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      <p className="label">{hasStreak ? "Seri" : "Bu hafta"}</p>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="figure text-3xl">
          {hasStreak ? weeks : (thisWeek ?? "—")}
        </span>
        <span className="text-sm text-[var(--color-ink-muted)]">
          {hasStreak ? "hafta" : weeklyTarget ? `/ ${weeklyTarget}` : ""}
        </span>
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
        {hasStreak
          ? `bu hafta ${thisWeek ?? 0}/${weeklyTarget ?? "—"}`
          : (thisWeek ?? 0) >= (weeklyTarget ?? Infinity)
            ? "hedef tamamlandı"
            : "planlanan antrenman"}
      </p>
    </Link>
  );
}

/* --- Yardımcılar ---------------------------------------------------------- */

function totalSets(workout: TodayWorkout): number {
  return workout.exercises.reduce((sum, e) => sum + e.target_sets, 0);
}

/** ISO tarih/zaman damgasının kullanıcının yerel gününe denk gelip gelmediği. */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
