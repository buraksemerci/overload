"use client";

/**
 * Programlar — aktif olan önde, kütüphane arkada.
 *
 * --------------------------------------------------------------------------
 * EKRANDA NE VAR
 * --------------------------------------------------------------------------
 * Önceki sürüm iki uzun liste gösteriyordu: kendi programların ve bütün
 * şablon kütüphanesi, hepsi aynı ağırlıkta kartlar hâlinde. Ama bu ekrana
 * girildiğinde sorulan soru neredeyse her zaman aynı: **şu an hangi program
 * aktif?** Program değiştirmek ayda bir yapılan bir iş.
 *
 * Şimdi aktif program tek başına tepede. Diğer programlar ve şablon
 * kütüphanesi kapalı başlıyor.
 *
 * Program günleri artık kartın içinde açılmıyor, odaklanmış bir panelde
 * geliyor — beş günlük bir programın bütün hareketleri kartı üç ekran
 * boyuna çıkarıyordu.
 *
 * --------------------------------------------------------------------------
 * KART GÖRSELİ
 * --------------------------------------------------------------------------
 * Şablon kartları `goal` alanına göre bir fotoğraf yuvası taşıyor. Fotoğraf
 * yokken yuva nötr bir doku gösteriyor, yani ekran fotoğraf eklenmeden de
 * tamam (bkz. `components/Photo.tsx`).
 */

import { useState } from "react";
import Link from "next/link";
import { Hero, HeroStat, HeroStats, InfoTip, Page, Section } from "@/components/Layout";
import { Photo } from "@/components/Photo";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Empty, Loading } from "@/components/States";
import {
  useActivateProgram,
  useCloneProgram,
  useProgram,
  usePrograms,
  useTemplates,
  type ProgramSummary,
} from "@/lib/queries";

const GOAL_LABEL: Record<string, string> = {
  strength: "Güç",
  hypertrophy: "Hipertrofi",
  powerbuilding: "Powerbuilding",
  general_fitness: "Genel form",
};

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Başlangıç",
  intermediate: "Orta",
  advanced: "İleri",
};

/**
 * Fotoğraf yuvası adı. `goal` bilinmiyorsa genel forma düşüyor.
 *
 * Kareler uygulamanın geri kalanıyla AYNI salondan: program kartı bantla yan
 * yana duruyor ve iki ayrı stok fotoğraf dünyası arasındaki geçiş her
 * seferinde göze çarpıyordu.
 */
const GOAL_PHOTO: Record<string, string> = {
  strength: "app-plates",
  hypertrophy: "app-dumbbells",
  powerbuilding: "app-squat",
  general_fitness: "app-gym-wide",
};

const summary = (program: ProgramSummary): string =>
  `${GOAL_LABEL[program.goal] ?? program.goal} · ${
    LEVEL_LABEL[program.level] ?? program.level
  } · haftada ${program.days_per_week} gün`;

export default function ProgramsPage() {
  const mine = usePrograms();
  const templates = useTemplates();
  const activate = useActivateProgram();
  const clone = useCloneProgram();

  const [detail, setDetail] = useState<ProgramSummary | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const programs = mine.data ?? [];
  const active = programs.find((program) => program.is_active) ?? null;
  const others = programs.filter((program) => !program.is_active);
  // Aktif programın günleri: banttaki sayılar için. Panel de aynı önbelleği
  // kullanıyor, ikinci istek gitmiyor.
  const activeDetail = useProgram(active?.id ?? null);
  const days = activeDetail.data?.days ?? [];
  const exerciseCount = days.reduce((sum, day) => sum + day.exercises.length, 0);

  return (
    <Page>
      {/* Ekranın sorusu "şu an hangi program aktif?" — cevabı bandın kendisi.
          Aktif program yokken bant genel kalıyor ve altındaki boş durum yol
          gösteriyor. */}
      <Hero
        photo={active ? (GOAL_PHOTO[active.goal] ?? "app-gym-wide") : "app-shoes"}
        size={active ? "lg" : "md"}
        eyebrow={active ? "Aktif program" : "Antrenman"}
        title={active ? active.name : "Programlar"}
        lead={active ? summary(active) : "Aynı anda tek program aktif olabiliyor."}
        actions={
          active ? (
            <>
              <Link href="/workout" className="btn btn-primary">
                Bugünkü antrenman
              </Link>
              <button type="button" className="btn btn-on-photo" onClick={() => setDetail(active)}>
                Günleri gör
              </button>
              <Link href={`/programs/${active.id}/edit`} className="btn btn-on-photo">
                Düzenle
              </Link>
            </>
          ) : (
            <Link href="/chat" className="btn btn-on-photo">
              AI ile oluştur
            </Link>
          )
        }
        info={
          <>
            Aktif program, <strong>Bugün</strong> ekranının hangi günü
            göstereceğini belirliyor. Aynı anda tek program aktif olabiliyor —
            iki aktif program olsa ilerleme motoru hangi geçmişe bakacağını
            bilemezdi. Şablonlar salt-okunur; &ldquo;Başlat&rdquo; kendi
            kopyanı oluşturuyor ve onu düzenleyebiliyorsun.
          </>
        }
      >
        {mine.isLoading && <div aria-busy="true" className="h-[11rem] sm:h-[7rem]" />}
        {active && (
          <HeroStats>
            <HeroStat label="Haftada" value={active.days_per_week} unit="gün" />
            <HeroStat label="Gün" value={days.length > 0 ? days.length : "—"} foot="programda tanımlı" />
            <HeroStat label="Hareket" value={exerciseCount > 0 ? exerciseCount : "—"} />
            <HeroStat label="Hedef" value={GOAL_LABEL[active.goal] ?? active.goal} foot={LEVEL_LABEL[active.level] ?? active.level} />
          </HeroStats>
        )}
      </Hero>

      {active && <Attribution program={active} />}

      {(activate.isError || clone.isError) && (
        <ErrorBox error={activate.error ?? clone.error} />
      )}

      {/* --- Aktif program yoksa ------------------------------------------ */}
      {mine.isLoading ? (
        <Loading />
      ) : mine.isError ? (
        <ErrorBox error={mine.error} onRetry={() => void mine.refetch()} />
      ) : active ? null : (
        <Empty
          photo="app-shoes"
          title={
            programs.length > 0 ? "Aktif program yok" : "Henüz programın yok"
          }
          hint={
            programs.length > 0
              ? "Aşağıdaki programlarından birini aktif yap."
              : "Şablon kütüphanesinden birini başlat ya da asistana kendi programını kurdur."
          }
          action={
            programs.length === 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowLibrary(true)}
              >
                Şablonlara bak
              </button>
            ) : undefined
          }
        />
      )}

      {/* --- Aktif programın günleri ---------------------------------------
          Bandın altı boş kalmasın diye değil: "bu hafta ne var" sorusunun
          cevabı bu ve panel açmadan görünüyor. */}
      {active && days.length > 0 && (
        <Section bare title="Program günleri">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {days.map((day, index) => (
              <li key={day.id} className="reveal" style={{ ["--i" as string]: index }}>
                <button
                  type="button"
                  onClick={() => setDetail(active)}
                  className="card lift flex h-full w-full flex-col p-5 text-left"
                  aria-label={`${day.label} gününü gör`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="display text-lg">{day.label}</span>
                    <span className="tnum text-xs text-[var(--color-ink-faint)]">
                      {day.exercises.length} hareket
                    </span>
                  </span>
                  <span className="mt-3 line-clamp-3 text-sm text-[var(--color-ink-muted)]">
                    {day.exercises.map((exercise) => exercise.exercise_name).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* --- Diğer programlar --------------------------------------------- */}
      {others.length > 0 && (
        <Disclosure
          open={showOthers}
          onToggle={() => setShowOthers((v) => !v)}
          closedLabel={`Diğer programlarım (${others.length})`}
          openLabel="Diğer programları gizle"
        >
          <ul className="flex flex-col gap-1.5">
            {others.map((program, index) => (
              <li key={program.id} className="reveal" style={{ ["--i" as string]: index }}>
                <ProgramRow
                  program={program}
                  onOpen={() => setDetail(program)}
                  action={
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0"
                      disabled={activate.isPending}
                      onClick={() => activate.mutate(program.id)}
                    >
                      Aktif yap
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {/* --- Şablon kütüphanesi ------------------------------------------- */}
      <Disclosure
        open={showLibrary}
        onToggle={() => setShowLibrary((v) => !v)}
        closedLabel="Şablon kütüphanesi"
        openLabel="Kütüphaneyi gizle"
      >
        {templates.isLoading ? (
          <Loading />
        ) : templates.isError ? (
          <ErrorBox error={templates.error} onRetry={() => void templates.refetch()} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(templates.data ?? []).map((template, index) => (
              <li key={template.id} className="reveal" style={{ ["--i" as string]: index }}>
                <TemplateCard
                  template={template}
                  pending={clone.isPending}
                  onOpen={() => setDetail(template)}
                  onStart={async () => {
                    const created = await clone.mutateAsync(template.id);
                    activate.mutate(created.id);
                    setShowLibrary(false);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Disclosure>

      {detail && (
        <ProgramSheet program={detail} onClose={() => setDetail(null)} />
      )}
    </Page>
  );
}

/* --- Açılır bölüm --------------------------------------------------------- */

/**
 * Kapalı başlayan bölüm.
 *
 * Bu desen artık üç ekranda tekrarlanıyor (beslenme önerileri, program
 * listeleri, kütüphane). Ortak kural: kapalıyken ne olduğu ve **kaç tane**
 * olduğu yazıyor — "Diğer programlarım" tek başına açmaya değer mi
 * bilinmiyor, "(3)" biliniyor.
 */
function Disclosure({
  open,
  onToggle,
  closedLabel,
  openLabel,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  closedLabel: string;
  openLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Section bare>
      <button
        type="button"
        className="btn btn-quiet -ml-2.5"
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? openLabel : closedLabel}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </Section>
  );
}

/* --- Satır ve kart -------------------------------------------------------- */

function ProgramRow({
  program,
  onOpen,
  action,
}: {
  program: ProgramSummary;
  onOpen: () => void;
  action: React.ReactNode;
}) {
  return (
    <div className="card flex items-center gap-4 px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
        aria-label={`${program.name} günlerini gör`}
      >
        <span className="block truncate text-sm font-medium">{program.name}</span>
        <span className="tnum block truncate text-2xs text-[var(--color-ink-faint)]">
          {summary(program)}
        </span>
      </button>
      {action}
    </div>
  );
}

function TemplateCard({
  template,
  pending,
  onOpen,
  onStart,
}: {
  template: ProgramSummary;
  pending: boolean;
  onOpen: () => void;
  onStart: () => void;
}) {
  /* Ad fotoğrafta, geri kalan altındaki beyaz şeritteydi: kart "kapak +
     içerik" diye ikiye bölünüyordu. Hepsi tek katmanda. */
  return (
    <div className="card h-full overflow-hidden">
      <Photo
        slug={GOAL_PHOTO[template.goal] ?? "app-gym-wide"}
        ratio="3 / 4"
        scrim
      >
        <div className="flex size-full flex-col justify-end gap-2.5 p-5">
          <div className="min-w-0">
            <p
              className="tnum text-2xs"
              style={{ color: "oklch(84% 0.01 115)" }}
            >
              {GOAL_LABEL[template.goal] ?? template.goal} ·{" "}
              {LEVEL_LABEL[template.level] ?? template.level}
            </p>
            <p
              className="display mt-1 text-lg leading-tight"
              style={{ color: "oklch(99% 0 0)" }}
            >
              {template.name}
            </p>
            <p className="tnum mt-0.5 text-xs" style={{ color: "oklch(84% 0.01 115)" }}>
              haftada {template.days_per_week} gün
            </p>
            <Attribution program={template} onPhoto />
          </div>

          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={pending}
              onClick={onStart}
            >
              {pending ? "…" : "Başlat"}
            </button>
            <button
              type="button"
              className="btn btn-on-photo"
              onClick={onOpen}
              aria-label={`${template.name} günlerini gör`}
            >
              Gör
            </button>
          </div>
        </div>
      </Photo>
    </div>
  );
}

/** Şablonlarda orijinal yaratıcıya atıf ZORUNLU (bkz. THIRD-PARTY-NOTICES). */
function Attribution({
  program,
  onPhoto = false,
}: {
  program: ProgramSummary;
  onPhoto?: boolean;
}) {
  if (!program.source_name) return null;
  return (
    <p
      className="mt-1.5 text-2xs"
      style={{ color: onPhoto ? "oklch(80% 0.01 115)" : "var(--color-ink-faint)" }}
    >
      Kaynak:{" "}
      {program.source_url ? (
        <a
          href={program.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {program.source_name}
        </a>
      ) : (
        program.source_name
      )}
    </p>
  );
}

/* --- Günler paneli -------------------------------------------------------- */

function ProgramSheet({
  program,
  onClose,
}: {
  program: ProgramSummary;
  onClose: () => void;
}) {
  const detail = useProgram(program.id);

  return (
    <Sheet title={program.name} onClose={onClose} width="34rem">
      <div className="flex flex-col gap-5">
        <div>
          <p className="tnum text-2xs text-[var(--color-ink-faint)]">
            {summary(program)}
          </p>
          {program.description && (
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {program.description}
            </p>
          )}
        </div>

        {detail.isLoading ? (
          <Loading label="Günler yükleniyor…" />
        ) : detail.isError ? (
          <ErrorBox error={detail.error} />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {(detail.data?.days ?? []).map((day) => (
              <li key={day.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{day.label}</p>
                  <span className="tnum text-2xs text-[var(--color-ink-faint)]">
                    {day.exercises.length} hareket
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {day.exercises.map((exercise) => (
                    <li
                      key={exercise.id}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate text-[var(--color-ink-muted)]">
                        {exercise.exercise_name}
                        {exercise.superset_group !== null && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--color-ink-faint)]">
                            <SupersetMark group={exercise.superset_group} />
                          </span>
                        )}
                      </span>
                      <span className="tnum shrink-0 text-[var(--color-ink-faint)]">
                        {exercise.target_label}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Süperset işareti.
 *
 * Önce "(ss2)" yazıyordu — hiçbir kullanıcının bilmediği bir kısaltma.
 * Anlamı "bu hareket 2 numaralı süperset grubunda, aradaki hareketle
 * dinlenmeden yapılıyor"; "?" arkasında bir kez okunuyor.
 */
function SupersetMark({ group }: { group: number }) {
  return (
    <>
      <span className="badge">süperset {group}</span>
      <InfoTip label="Süperset nedir">
        Aynı gruptaki hareketler <strong>aralarında dinlenmeden</strong> sırayla
        yapılıyor. Grup bittikten sonra dinleniyorsun.
      </InfoTip>
    </>
  );
}
