"use client";

/** Program Yönetimi (Bölüm 8, ekran 4): kendi programların + şablon kütüphanesi. */

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/Layout";
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

export default function ProgramsPage() {
  const mine = usePrograms();
  const templates = useTemplates();
  const activate = useActivateProgram();
  const clone = useCloneProgram();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader title="Programlar" />

      <Link href="/chat" className="btn btn-primary inline-flex">
        AI ile program oluştur
      </Link>

      {/* --- Kendi programların --- */}
      <section>
        <h2 className="mb-3 text-base font-medium">Programlarım</h2>
        {mine.isLoading ? (
          <Loading />
        ) : mine.isError ? (
          <ErrorBox error={mine.error} onRetry={() => void mine.refetch()} />
        ) : mine.data && mine.data.length > 0 ? (
          <ul className="space-y-3">
            {mine.data.map((program) => (
              <li key={program.id}>
                <ProgramCard
                  program={program}
                  expanded={expanded === program.id}
                  onToggle={() =>
                    setExpanded(expanded === program.id ? null : program.id)
                  }
                  action={
                    program.is_active ? (
                      <span
                        className="shrink-0 rounded-[3px] px-2 py-1 text-2xs"
                        style={{
                          background: "var(--color-accent-dim)",
                          color: "var(--color-accent)",
                        }}
                      >
                        AKTİF
                      </span>
                    ) : (
                      <button
                        className="btn btn-ghost shrink-0"
                        disabled={activate.isPending}
                        onClick={() => activate.mutate(program.id)}
                      >
                        Aktif yap
                      </button>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="Henüz programın yok"
            hint="Aşağıdaki şablonlardan birini başlat ya da asistana kendi programını kurdur."
          />
        )}
        {activate.isError && <ErrorBox error={activate.error} />}
      </section>

      {/* --- Şablon kütüphanesi --- */}
      <section>
        <h2 className="mb-1 text-base font-medium">Şablon kütüphanesi</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Şablonlar salt-okunur. &ldquo;Başlat&rdquo; dediğinde kendi kopyan oluşur ve
          onu istediğin gibi düzenleyebilirsin.
        </p>
        {templates.isLoading ? (
          <Loading />
        ) : templates.isError ? (
          <ErrorBox error={templates.error} onRetry={() => void templates.refetch()} />
        ) : (
          <ul className="space-y-3">
            {(templates.data ?? []).map((template) => (
              <li key={template.id}>
                <ProgramCard
                  program={template}
                  expanded={expanded === template.id}
                  onToggle={() =>
                    setExpanded(expanded === template.id ? null : template.id)
                  }
                  action={
                    <button
                      className="btn btn-ghost shrink-0"
                      disabled={clone.isPending}
                      onClick={async () => {
                        const created = await clone.mutateAsync(template.id);
                        activate.mutate(created.id);
                      }}
                    >
                      Başlat
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {clone.isError && <ErrorBox error={clone.error} />}
      </section>
    </div>
  );
}

function ProgramCard({
  program,
  expanded,
  onToggle,
  action,
}: {
  program: ProgramSummary;
  expanded: boolean;
  onToggle: () => void;
  action: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{program.name}</h3>
          <p className="tnum mt-0.5 text-xs text-[var(--color-ink-faint)]">
            {GOAL_LABEL[program.goal] ?? program.goal} ·{" "}
            {LEVEL_LABEL[program.level] ?? program.level} · haftada{" "}
            {program.days_per_week} gün
          </p>
          {/* Bölüm 9 şartı: şablonlarda orijinal yaratıcıya atıf zorunlu. */}
          {program.source_name && (
            <p className="mt-1 text-2xs text-[var(--color-ink-faint)]">
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
          )}
        </div>
        {action}
      </div>

      {program.description && (
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{program.description}</p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          aria-expanded={expanded}
        >
          {expanded ? "Günleri gizle" : "Günleri göster"}
        </button>
        {/* Şablonlar salt-okunur; düzenleme bağlantısı yalnızca kendi
            programlarında görünüyor. */}
        {!program.is_template && (
          <Link
            href={`/programs/${program.id}/edit`}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Düzenle →
          </Link>
        )}
      </div>

      {expanded && <ProgramDays programId={program.id} />}
    </div>
  );
}

function ProgramDays({ programId }: { programId: string }) {
  const detail = useProgram(programId);

  if (detail.isLoading) return <Loading label="Günler yükleniyor…" />;
  if (detail.isError) return <ErrorBox error={detail.error} />;

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
      {(detail.data?.days ?? []).map((day) => (
        <div key={day.id}>
          <p className="text-xs font-medium">{day.label}</p>
          <ul className="mt-1.5 space-y-1">
            {day.exercises.map((exercise) => (
              <li
                key={exercise.id}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-[var(--color-ink-muted)]">
                  {exercise.exercise_name}
                  {exercise.superset_group !== null && (
                    <span className="ml-1 text-[var(--color-ink-faint)]">
                      (ss{exercise.superset_group})
                    </span>
                  )}
                </span>
                <span className="tnum shrink-0 text-[var(--color-ink-faint)]">
                  {exercise.target_label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
