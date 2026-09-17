"use client";

/**
 * Supplement — bugün alınacaklar, tek dokunuşla.
 *
 * --------------------------------------------------------------------------
 * EKRANDA SADECE BUGÜN VAR
 * --------------------------------------------------------------------------
 * Liste bütün tanımlı supplementleri gösteriyordu; "bugün gerekmiyor" olanlar
 * da aynı ağırlıkta satır kaplıyordu. Antrenman gününde alınan bir şey,
 * dinlenme gününde ekranda durmasın.
 *
 * Şimdi bugün alınacaklar üstte; bugün gerekmeyenler kapalı bir bölümde.
 * Tepede tek satırlık durum: kaç tanesi işaretlendi.
 *
 * --------------------------------------------------------------------------
 * "ATLADIM" AYRI BİR CEVAP
 * --------------------------------------------------------------------------
 * Üç durum var ve üçü ayrı: alındı, atlandı, dokunulmadı. Atlamayı
 * kaydetmemek uyum oranını hesaplanamaz kılıyor — boş bırakılan gün
 * "bilinmiyor", atlanan gün "alınmadı".
 *
 * Bu yüzden iki düğme var, tek bir onay kutusu değil. Onay kutusu üçüncü
 * durumu ifade edemiyor.
 */

import { useState } from "react";
import { Page, PageHeader, Section } from "@/components/Layout";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Empty, Loading } from "@/components/States";
import { useCreateSupplement, useMarkIntake, useSupplementsToday } from "@/lib/queries";

const SCHEDULE_LABEL: Record<string, string> = {
  daily: "Her gün",
  training_days: "Antrenman günleri",
  rest_days: "Dinlenme günleri",
  as_needed: "Gerektiğinde",
};

export default function SupplementsPage() {
  const today = useSupplementsToday();
  const mark = useMarkIntake();
  const [adding, setAdding] = useState(false);
  const [showOther, setShowOther] = useState(false);

  const rows = today.data ?? [];
  const due = rows.filter((row) => row.due_today);
  const notDue = rows.filter((row) => !row.due_today);
  const answered = due.filter((row) => row.taken !== null).length;

  return (
    <Page>
      <PageHeader
        photo="app-supplements"
        position="right center"
        eyebrow="Beslenme"
        title="Supplement"
        info={
          <>
            Üç durum ayrı tutuluyor: <strong>alındı</strong>,{" "}
            <strong>atlandı</strong> ve <strong>dokunulmadı</strong>. Atlamayı
            kaydetmemek uyum oranını hesaplanamaz kılıyor — boş bırakılan gün
            &ldquo;bilinmiyor&rdquo;, atlanan gün ise &ldquo;alınmadı&rdquo;.
            Asistana &ldquo;kreatini aldım&rdquo; diyerek de
            işaretleyebilirsin.
          </>
        }
        /* Liste boşken başlıkta ekleme düğmesi YOK: boş durumun kendi
           daveti zaten aynı işi yapıyor ve iki ayrı "ekle" düğmesi aynı
           ekranda birbirini tekrar ediyordu. */
        actions={
          rows.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
              Supplement ekle
            </button>
          )
        }
      />

      {mark.isError && <ErrorBox error={mark.error} />}

      {today.isLoading ? (
        <Loading />
      ) : today.isError ? (
        <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          photo="empty-supplements"
          title="Henüz supplement tanımlamadın"
          hint="Ekledikten sonra her gün tek dokunuşla işaretleyebilirsin."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              İlkini ekle
            </button>
          }
        />
      ) : (
        <>
          <section className="card p-6 lg:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-lg">Bugün</h2>
              {due.length > 0 && (
                <span className="tnum text-sm text-[var(--color-ink-muted)]">
                  {answered} / {due.length}
                </span>
              )}
            </div>

            {due.length === 0 ? (
              <p className="mt-5 text-sm text-[var(--color-ink-faint)]">
                Bugün alınacak bir şey yok.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                {due.map((row, index) => (
                  <li
                    key={row.supplement.id}
                    className="reveal flex items-center justify-between gap-4 py-3"
                    style={{ ["--i" as string]: index }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {row.supplement.name}
                        {row.supplement.dose && (
                          <span className="ml-1.5 text-xs text-[var(--color-ink-faint)]">
                            {row.supplement.dose}
                          </span>
                        )}
                      </p>
                      <p className="text-2xs text-[var(--color-ink-faint)]">
                        {SCHEDULE_LABEL[row.supplement.schedule] ??
                          row.supplement.schedule}
                      </p>
                    </div>

                    <Answer
                      taken={row.taken}
                      onTaken={(taken) =>
                        mark.mutate({ supplementId: row.supplement.id, taken })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {notDue.length > 0 && (
            <Section bare>
              <button
                type="button"
                className="btn btn-quiet -ml-2.5"
                aria-expanded={showOther}
                onClick={() => setShowOther((v) => !v)}
              >
                {showOther
                  ? "Gizle"
                  : `Bugün gerekmeyenler (${notDue.length})`}
              </button>

              {showOther && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {notDue.map((row, index) => (
                    <li
                      key={row.supplement.id}
                      className="card reveal flex items-center justify-between gap-4 px-4 py-3"
                      style={{ ["--i" as string]: index }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--color-ink-muted)]">
                          {row.supplement.name}
                        </p>
                        <p className="text-2xs text-[var(--color-ink-faint)]">
                          {SCHEDULE_LABEL[row.supplement.schedule] ??
                            row.supplement.schedule}
                        </p>
                      </div>
                      {/* Bugün gerekmese de alınabiliyor: program bir öneri,
                          yasak değil. */}
                      <Answer
                        taken={row.taken}
                        onTaken={(taken) =>
                          mark.mutate({ supplementId: row.supplement.id, taken })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </>
      )}

      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </Page>
  );
}

/* --- Üç durumlu cevap ----------------------------------------------------- */

function Answer({
  taken,
  onTaken,
}: {
  taken: boolean | null;
  onTaken: (taken: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label="Durum">
      <button
        type="button"
        aria-label="Aldım"
        aria-pressed={taken === true}
        onClick={() => onTaken(true)}
        className="grid size-10 place-items-center border transition-colors"
        style={{
          transitionDuration: "var(--dur-micro)",
          ...(taken === true
            ? {
                // Volt DOLGU: ekrandaki tek aksiyon işareti ve kazanılmış
                // bir durum. Metin `--color-ink`, volt üstünde okunuyor.
                background: "var(--color-accent)",
                borderColor: "transparent",
                color: "var(--color-on-accent)",
              }
            : {
                borderColor: "var(--color-border-strong)",
                color: "var(--color-ink-faint)",
              }),
        }}
      >
        <span className={taken === true ? "animate-check" : undefined} aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </button>

      <button
        type="button"
        aria-label="Atladım"
        aria-pressed={taken === false}
        onClick={() => onTaken(false)}
        className="grid size-10 place-items-center border transition-colors"
        style={{
          transitionDuration: "var(--dur-micro)",
          ...(taken === false
            ? {
                // Atlamak bir HATA değil, bir cevap. Kırmızı değil nötr.
                background: "var(--color-surface-raised)",
                borderColor: "var(--color-border-strong)",
                color: "var(--color-ink-muted)",
              }
            : {
                borderColor: "var(--color-border-strong)",
                color: "var(--color-ink-faint)",
              }),
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* --- Ekleme paneli -------------------------------------------------------- */

function AddSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateSupplement();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [schedule, setSchedule] = useState("daily");

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), dose: dose.trim() || null, schedule },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      title="Yeni supplement"
      onClose={onClose}
      width="26rem"
      footer={
        <button
          type="button"
          className="btn btn-primary w-full py-3"
          disabled={create.isPending || !name.trim()}
          onClick={submit}
        >
          {create.isPending ? "Ekleniyor…" : "Ekle"}
        </button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {create.isError && <ErrorBox error={create.error} />}

        <label className="flex flex-col gap-1.5">
          <span className="label">Ad</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Kreatin"
            autoFocus
            className="field h-11 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label">Doz</span>
          <input
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            placeholder="5 g"
            className="field h-11 px-3 text-sm"
          />
          <span className="text-2xs text-[var(--color-ink-faint)]">İsteğe bağlı.</span>
        </label>

        <div>
          <p className="label mb-2">Ne zaman</p>
          <div className="seg w-full flex-wrap" role="group" aria-label="Program">
            {Object.entries(SCHEDULE_LABEL).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={schedule === value}
                onClick={() => setSchedule(value)}
                className="seg-item flex-1 text-xs"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Sheet>
  );
}
