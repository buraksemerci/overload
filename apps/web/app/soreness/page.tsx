"use client";

/** Soreness Check-in (Bölüm 8, ekran 12): kas grubu bazında günlük ağrı seviyesi. */

import { PageHeader } from "@/components/Layout";
import { ErrorBox, Loading } from "@/components/States";
import { useInjuries, useLogSoreness, useMuscleGroups, useSoreness } from "@/lib/queries";

const LEVELS = [
  { value: 0, label: "Yok", color: "var(--color-surface-raised)" },
  { value: 1, label: "Hafif", color: "color-mix(in oklab, var(--color-accent) 30%, var(--color-surface))" },
  { value: 2, label: "Orta", color: "color-mix(in oklab, var(--color-accent) 60%, var(--color-surface))" },
  { value: 3, label: "Belirgin", color: "var(--color-accent)" },
  { value: 4, label: "Kısıtlayıcı", color: "var(--color-warning)" },
] as const;

export default function SorenessPage() {
  const groups = useMuscleGroups();
  const soreness = useSoreness(1);
  const injuries = useInjuries();
  const log = useLogSoreness();

  if (groups.isLoading || soreness.isLoading) return <Loading />;
  if (groups.isError) return <ErrorBox error={groups.error} onRetry={() => void groups.refetch()} />;

  const todayBySlug = new Map(
    (soreness.data ?? []).map((row) => [row.muscle_group_slug, row.level]),
  );

  const front = (groups.data ?? []).filter((g) => g.region === "front");
  const back = (groups.data ?? []).filter((g) => g.region === "back");

  return (
    <div className="mx-auto flex max-w-[68rem] flex-col gap-6">
      <PageHeader
        title="Ağrı Check-in"
        lead="Bugün hangi kasların ağrıyor?"
        info={
          <>
            Asistan bu bilgiyi antrenman önerirken kullanıyor — örneğin
            quad&apos;lerin 4/4 ağrıyorsa bacak gününü öne almanı önermez.
            0 ağrı yok, 4 hareketi kısıtlıyor demek.
          </>
        }
      />

      {(injuries.data ?? []).length > 0 && (
        <section className="card p-6" style={{ borderColor: "var(--color-warning)" }}>
          <h2 className="text-base" style={{ color: "var(--color-warning)" }}>
            Aktif sakatlık notu
          </h2>
          <ul className="mt-2 space-y-1">
            {(injuries.data ?? []).map((injury) => (
              <li key={injury.id} className="text-sm">
                <span className="text-[var(--color-ink)]">{injury.muscle_group_name}:</span>{" "}
                <span className="text-[var(--color-ink-muted)]">{injury.description}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs text-[var(--color-ink-faint)]">
            Bu bölgeyi birincil çalıştıran hareketler antrenman modunda uyarı alır.
          </p>
        </section>
      )}

      <Group title="Ön" groups={front} values={todayBySlug} onSelect={log.mutate} />
      <Group title="Arka" groups={back} values={todayBySlug} onSelect={log.mutate} />

      {log.isError && <ErrorBox error={log.error} />}

      <p className="text-2xs text-[var(--color-ink-faint)]">
        Sürekli ağrı, uyuşma ya da eklem ağrısı kas ağrısından farklıdır — bunlar
        için bir doktora ya da fizyoterapiste danış.
      </p>
    </div>
  );
}

function Group({
  title,
  groups,
  values,
  onSelect,
}: {
  title: string;
  groups: Array<{ id: string; slug: string; name_tr: string }>;
  values: Map<string, number>;
  onSelect: (input: { muscle_group_slug: string; level: number }) => void;
}) {
  return (
    <section className="card p-6">
      <h2 className="text-base">{title}</h2>
      <ul className="mt-3 space-y-3">
        {groups.map((group) => {
          const current = values.get(group.slug);
          return (
            <li key={group.id}>
              <p className="text-sm">{group.name_tr}</p>
              <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label={group.name_tr}>
                {LEVELS.map((level) => {
                  const active = current === level.value;
                  return (
                    <button
                      key={level.value}
                      role="radio"
                      aria-checked={active}
                      aria-label={level.label}
                      onClick={() =>
                        onSelect({ muscle_group_slug: group.slug, level: level.value })
                      }
                      className="h-9 flex-1 rounded-[3px] border text-2xs transition-colors"
                      style={{
                        background: active ? level.color : "transparent",
                        borderColor: active
                          ? "transparent"
                          : "var(--color-border-strong)",
                        // Dolguların hepsi açık ton; üstüne beyaz değil ink yazılır.
                        color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
                      }}
                    >
                      {level.value}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-2xs text-[var(--color-ink-faint)]">
        0 = ağrı yok · 4 = hareketi kısıtlıyor
      </p>
    </section>
  );
}
