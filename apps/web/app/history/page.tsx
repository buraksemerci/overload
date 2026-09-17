"use client";

/**
 * Geçmiş — yapılmış işin kaydı.
 *
 * --------------------------------------------------------------------------
 * NEDEN BAŞTAN YAZILDI
 * --------------------------------------------------------------------------
 * Önceki sürüm tarih + set sayısı + tonaj satırlarından oluşan düz bir liste
 * gösteriyordu. Açılınca gelen detay ise şöyleydi:
 *
 *     Set 1        80,0 kg x 8
 *     Set 2        80,0 kg x 7
 *     Set 3        40,0 kg x 12
 *
 * Hangi harekete ait olduğu yazmıyordu. Kullanıcının kendi antrenmanını
 * tanıyamadığı bir geçmiş kaydının değeri yok; hareket adı artık sunucudan
 * geliyor ve setler hareket altında gruplu.
 *
 * --------------------------------------------------------------------------
 * NE MOTİVE EDİYOR
 * --------------------------------------------------------------------------
 * Bir antrenman geçmişinde motive eden şey liste uzunluğu değil, BİRİKİM:
 * bu ay kaç seans, toplamda kaç ton, hangi günler rekor kırıldı. Ekranın
 * tepesinde üç sayı var ve tonaj **ton** cinsinden yazılıyor — "18.400 kg"
 * bir ölçüm, "18,4 ton" bir başarı.
 *
 * Rekor kırılan seanslar listede işaretli. Geçmişte gezinirken göze çarpan
 * şey o günler olmalı.
 *
 * Liste sade kalıyor: seans detayı satıra dokununca odaklanmış bir panelde
 * açılıyor — beslenme ekranındaki aynı desen.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bars } from "@/components/Charts";
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Empty, Loading, fmt } from "@/components/States";
import { prLabel, prUnit } from "@/lib/labels";
import { useHistory, type HistoryExercise, type HistorySession } from "@/lib/queries";
import { shortDay, weeklyVolume } from "@/lib/stats";

const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

const MONTHS_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
] as const;

const num = (value: string): number => Number.parseFloat(value) || 0;

export default function HistoryPage() {
  const history = useHistory(60);
  const [open, setOpen] = useState<HistorySession | null>(null);

  const totals = useMemo(() => {
    const rows = history.data ?? [];
    const now = new Date();
    const thisMonth = rows.filter((session) => {
      const date = new Date(session.started_at);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    return {
      sessions: thisMonth.length,
      // Ton cinsinden: "18.400 kg" bir ölçüm, "18,4 ton" bir başarı.
      tonnage: rows.reduce((sum, session) => sum + num(session.volume_kg), 0) / 1000,
      records: rows.reduce((sum, session) => sum + session.records.length, 0),
    };
  }, [history.data]);

  /** Aya göre grupla: liste düz akarken ritim görünmüyordu. */
  const months = useMemo(() => {
    const groups = new Map<string, { label: string; sessions: HistorySession[] }>();
    for (const session of history.data ?? []) {
      const date = new Date(session.started_at);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
      const group = groups.get(key);
      if (group) group.sessions.push(session);
      else groups.set(key, { label, sessions: [session] });
    }
    return [...groups.values()];
  }, [history.data]);

  const rows = history.data;

  const weeks = useMemo(() => {
    const list = weeklyVolume(rows ?? [], 12);
    const thisWeek = list.at(-1)?.start.getTime();
    return list.map((week) => ({
      label: shortDay(week.start),
      value: Math.round(week.volume),
      current: week.start.getTime() === thisWeek,
    }));
  }, [rows]);

  // "18.400 kg" bir ölçüm, "18,4 ton" bir başarı. Bir tonun altında ton
  // demek anlamsız; orada kilogram kalıyor.
  const total =
    totals.tonnage >= 1
      ? { value: fmt(totals.tonnage, 1), unit: "ton" }
      : { value: fmt(totals.tonnage * 1000, 0), unit: "kg" };
  const sets = (rows ?? []).reduce((sum, session) => sum + session.total_sets, 0);

  // Bant her durumda ilk: yüklenirken ve hata verirken de ekran aynı yerden
  // açılıyor, saydam üst çubuk içeriğin üstüne binmiyor.
  const hero = (
    <Hero
      photo="app-chalk"
      position="right center"
      size={(rows?.length ?? 0) === 0 ? "md" : "lg"}
      eyebrow="Antrenman"
      title="Geçmiş"
      lead={
        (rows?.length ?? 0) > 0
          ? `Son ${rows!.length} seansta ${total.value} ${total.unit} kaldırdın.`
          : "Tamamlanan her seans buraya düşüyor."
      }
    >
      {rows && rows.length > 0 && (
        <HeroStats>
          <HeroStat label="Toplam" value={total.value} unit={total.unit} foot="kaldırılan" />
          <HeroStat label="Seans" value={rows.length} foot={`bu ay ${totals.sessions}`} />
          <HeroStat label="Set" value={fmt(sets, 0)} />
          <HeroStat label="Rekor" value={totals.records} unit="kırıldı" />
        </HeroStats>
      )}
    </Hero>
  );

  if (history.isLoading || history.isError || !rows)
    return (
      <Page>
        {hero}
        {history.isError ? (
          <ErrorBox error={history.error} onRetry={() => void history.refetch()} />
        ) : (
          <Loading />
        )}
      </Page>
    );

  if (rows.length === 0) {
    return (
      <Page>
        {hero}
        <Empty
          photo="app-gym-wide"
          title="Henüz tamamlanmış antrenmanın yok"
          hint="İlk seansını bitirdiğinde burada birikmeye başlayacak."
          action={
            <Link href="/workout" className="btn btn-primary">
              Antrenmana başla
            </Link>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      {hero}

      {/* --- Ritim --------------------------------------------------------
          Hafta hafta tonaj: listedeki satırlar "ne yaptım"ı, bu grafik
          "düzenli miyim"i söylüyor. */}
      <Section night title="Haftalık tonaj" info="Son 12 hafta. Isınma setleri hariç; boş hafta sıfır olarak duruyor — atlanmış bir hafta grafikte de boşluk bırakmalı.">
        <Bars
          night
          data={weeks}
          height={200}
          format={(value) => value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
          unit="kg"
        />
      </Section>

      {/* --- Seanslar ----------------------------------------------------- */}
      {months.map((month) => (
        <section key={month.label}>
          <h2 className="display mb-4 text-xl lg:text-2xl">{month.label}</h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {month.sessions.map((session) => (
              <li key={session.id} className="rise">
                <SessionCard session={session} onOpen={() => setOpen(session)} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {open && <SessionDetail session={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

/* --- Seans kartı ---------------------------------------------------------- */

/**
 * Kart, satır değil: listede dokuz satır aynı görünüyordu ve hangi seansın
 * ne olduğu ancak okunarak anlaşılıyordu. Kartta gün rakamı büyük, hareket
 * adları altında — geçmişte gezinirken göz adlara takılıyor.
 */
function SessionCard({ session, onOpen }: { session: HistorySession; onOpen: () => void }) {
  const date = new Date(session.started_at);
  const title =
    session.day_label ??
    date.toLocaleDateString("tr-TR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase());
  const names = session.exercises.map((exercise) => exercise.name);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card lift flex h-full w-full flex-col p-5 text-left"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-baseline gap-2">
          {/* Tarih bloğu: gün rakamı büyük, ay küçük. Listeyi tarayarak
              ilerlemek için tek başına yeterli bir çapa. */}
          <span className="display tnum text-3xl leading-none">{date.getDate()}</span>
          <span className="text-xs text-[var(--color-ink-faint)]">{MONTHS_SHORT[date.getMonth()]}</span>
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {session.records.length > 0 && (
            <span className="badge badge-accent">
              {session.records.length > 1 ? `${session.records.length} REKOR` : "REKOR"}
            </span>
          )}
          {session.is_deload && <span className="badge badge-warning">deload</span>}
        </span>
      </span>

      <span className="mt-4 line-clamp-2 text-base font-medium">{title}</span>

      {names.length > 0 && (
        <span className="mt-1.5 line-clamp-2 text-sm text-[var(--color-ink-muted)]">
          {names.slice(0, 3).join(" · ")}
          {names.length > 3 && ` +${names.length - 3}`}
        </span>
      )}

      <span className="tnum mt-auto flex items-baseline justify-between gap-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink-faint)]">
        <span>
          {/* Hareket dizisi boş gelebiliyor (özet uç noktası); "0 hareket"
              yazmak yerine sadece set sayısı kalıyor. */}
          {session.exercises.length > 0 && `${session.exercises.length} hareket · `}
          {session.total_sets} set
          {/* `> 0` kontrolü: aynı dakika içinde kapatılan seanslarda "0 dk"
              yazıyordu — bilgi taşımayan bir alan. */}
          {session.duration_min !== null && session.duration_min > 0 && ` · ${session.duration_min} dk`}
        </span>
        <span className="text-[var(--color-ink-muted)]">{fmt(num(session.volume_kg), 0)} kg</span>
      </span>
    </button>
  );
}

/* --- Seans detayı --------------------------------------------------------- */

function SessionDetail({
  session,
  onClose,
}: {
  session: HistorySession;
  onClose: () => void;
}) {
  const date = new Date(session.started_at);
  const title = `${date.getDate()} ${MONTHS[date.getMonth()]}`;

  return (
    <Sheet title={session.day_label ?? title} onClose={onClose} width="34rem">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-2xs text-[var(--color-ink-faint)]">
            {date.toLocaleDateString("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {session.program_name && ` · ${session.program_name}`}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-border)]">
            <Cell label="set" value={fmt(session.total_sets, 0)} />
            <Cell label="kg tonaj" value={fmt(num(session.volume_kg), 0)} />
            <Cell
              label="dakika"
              value={session.duration_min === null ? "—" : fmt(session.duration_min, 0)}
            />
          </div>
        </div>

        {session.records.length > 0 && (
          <div>
            <p className="label mb-2">O gün kırılan rekorlar</p>
            <ul className="flex flex-col gap-1">
              {session.records.map((record, index) => (
                <li
                  key={`${record.type}-${index}`}
                  className="tnum flex items-baseline justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-accent-wash)] px-3 py-2 text-sm"
                >
                  <span className="text-[var(--color-ink)]">{prLabel(record.type)}</span>
                  <span style={{ color: "var(--color-accent-deep)" }}>
                    {fmt(record.value, record.type === "max_reps" ? 0 : 1)} {prUnit(record.type)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="label mb-2">Hareketler</p>
          {session.exercises.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-faint)]">Set kaydı yok.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {session.exercises.map((exercise) => (
                <ExerciseBlock key={exercise.exercise_id} exercise={exercise} />
              ))}
            </ul>
          )}
        </div>

        {session.notes && (
          <div>
            <p className="label mb-1.5">Not</p>
            <p className="text-sm text-[var(--color-ink-muted)]">{session.notes}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ExerciseBlock({ exercise }: { exercise: HistoryExercise }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm font-medium">{exercise.name}</p>
        {/* Zirve set önce: "o gün ne kaldırdım" sorusunun yanıtı bu, tonaj
            değil. Vücut ağırlığı hareketlerinde ağırlık 0 — o zaman tekrar
            sayısı tek başına yazılıyor, "0 kg x 12" saçma olurdu. */}
        <p className="tnum shrink-0 text-sm">
          {num(exercise.top_weight_kg) === 0
            ? `${exercise.top_reps} tekrar`
            : `${fmt(num(exercise.top_weight_kg), 1)} kg × ${exercise.top_reps}`}
        </p>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1">
        {exercise.sets.map((set) => (
          <li
            key={set.id}
            className={`tnum rounded-[var(--radius-sm)] px-2 py-1 text-2xs ${
              set.is_warmup
                ? "text-[var(--color-ink-faint)]"
                : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"
            }`}
            title={set.is_warmup ? "Isınma seti" : undefined}
          >
            {num(set.weight_kg) === 0
              ? `${set.reps}`
              : `${fmt(num(set.weight_kg), 1)}×${set.reps}`}
            {set.rir !== null && <span className="text-[var(--color-ink-faint)]"> R{set.rir}</span>}
            {set.is_warmup && <span> ısınma</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--color-surface)] px-3 py-2.5 text-center">
      <p className="tnum text-md font-semibold">{value}</p>
      <p className="text-2xs text-[var(--color-ink-faint)]">{label}</p>
    </div>
  );
}
