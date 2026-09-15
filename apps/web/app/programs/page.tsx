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
import { InfoTip, Page, PageHeader, Section } from "@/components/Layout";
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

/** Fotoğraf yuvası adı. `goal` bilinmiyorsa genel forma düşüyor. */
const GOAL_PHOTO: Record<string, string> = {
  strength: "goal-strength",
  hypertrophy: "goal-hypertrophy",
  powerbuilding: "goal-powerbuilding",
  general_fitness: "goal-general-fitness",
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

  return (
    <Page>
      <PageHeader
        title="Programlar"
        info={
          <>
            Aktif program, <strong>Bugün</strong> ekranının hangi günü
            göstereceğini belirliyor. Aynı anda tek program aktif olabiliyor —
            iki aktif program olsa ilerleme motoru hangi geçmişe bakacağını
            bilemezdi. Şablonlar salt-okunur; &ldquo;Başlat&rdquo; kendi
            kopyanı oluşturuyor ve onu düzenleyebiliyorsun.
          </>
        }
        actions={
          <Link href="/chat" className="btn btn-ghost">
            AI ile oluştur
          </Link>
        }
      />

      {(activate.isError || clone.isError) && (
        <ErrorBox error={activate.error ?? clone.error} />
      )}

      {/* --- Aktif program ------------------------------------------------ */}
      {mine.isLoading ? (
        <Loading />
      ) : mine.isError ? (
        <ErrorBox error={mine.error} onRetry={() => void mine.refetch()} />
      ) : active ? (
        <ActiveProgram program={active} onOpen={() => setDetail(active)} />
      ) : (
        <Empty
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

/* --- Aktif program -------------------------------------------------------- */

function ActiveProgram({
  program,
  onOpen,
}: {
  program: ProgramSummary;
  onOpen: () => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-0 sm:flex-row sm:items-stretch">
        <Photo
          slug={GOAL_PHOTO[program.goal] ?? "goal-general-fitness"}
          ratio="16 / 9"
          className="sm:w-[24rem] sm:shrink-0"
        />

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-6">
          <div className="min-w-0">
            <span className="badge badge-accent">AKTİF</span>
            <h2 className="display mt-2.5 text-lg">{program.name}</h2>
            <p className="tnum mt-1 text-sm text-[var(--color-ink-muted)]">
              {summary(program)}
            </p>
            <Attribution program={program} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/workout" className="btn btn-primary">
              Bugünkü antrenman
            </Link>
            <button type="button" className="btn btn-ghost" onClick={onOpen}>
              Günleri gör
            </button>
            <Link href={`/programs/${program.id}/edit`} className="btn btn-quiet">
              Düzenle
            </Link>
          </div>
        </div>
      </div>
    </section>
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
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      {/* Fotoğrafın üstündeki ad: perde ŞART, fotoğrafın açık mı koyu mu
          olduğu bilinmiyor. */}
      <Photo slug={GOAL_PHOTO[template.goal] ?? "goal-general-fitness"} ratio="3 / 2" scrim>
        <div className="flex size-full flex-col justify-end p-4">
          <p className="text-sm font-semibold" style={{ color: "oklch(99% 0 0)" }}>
            {template.name}
          </p>
          <p className="tnum text-2xs" style={{ color: "oklch(88% 0.01 115)" }}>
            haftada {template.days_per_week} gün
          </p>
        </div>
      </Photo>

      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="tnum text-2xs text-[var(--color-ink-faint)]">
            {GOAL_LABEL[template.goal] ?? template.goal} ·{" "}
            {LEVEL_LABEL[template.level] ?? template.level}
          </p>
          <Attribution program={template} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost flex-1"
            disabled={pending}
            onClick={onStart}
          >
            {pending ? "…" : "Başlat"}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={onOpen}
            aria-label={`${template.name} günlerini gör`}
          >
            Gör
          </button>
        </div>
      </div>
    </div>
  );
}

/** Şablonlarda orijinal yaratıcıya atıf ZORUNLU (bkz. THIRD-PARTY-NOTICES). */
function Attribution({ program }: { program: ProgramSummary }) {
  if (!program.source_name) return null;
  return (
    <p className="mt-1.5 text-2xs text-[var(--color-ink-faint)]">
      Kaynak:{" "}
      {program.source_url ? (
        <a
          href={program.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--color-ink)]"
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
