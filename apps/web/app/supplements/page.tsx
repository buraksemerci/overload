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
import { Hero, HeroStat, HeroStats, Page, Section } from "@/components/Layout";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Empty, Loading } from "@/components/States";
import {
  useCreateSupplement,
  useDeleteSupplement,
  useMarkIntake,
  useSupplementsToday,
  useUpdateSupplement,
  type SupplementRow,
} from "@/lib/queries";

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
  /** Düzenlenen supplement. `null` = panel kapalı. */
  const [editing, setEditing] = useState<SupplementRow | null>(null);
  const [showOther, setShowOther] = useState(false);

  const rows = today.data ?? [];
  const due = rows.filter((row) => row.due_today);
  const notDue = rows.filter((row) => !row.due_today);
  const answered = due.filter((row) => row.taken !== null).length;

  return (
    <Page>
      <Hero
        photo="app-supplements"
        position="right center"
        size="md"
        eyebrow="Beslenme"
        title="Supplement"
        lead={
          rows.length === 0
            ? "Aldıklarını tek dokunuşla işaretle."
            : due.length === 0
              ? "Bugün alınacak bir şey yok."
              : answered === due.length
                ? "Bugünün hepsi işaretli."
                : `Bugün ${due.length - answered} tanesi işaretlenmeyi bekliyor.`
        }
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
            <button type="button" className="btn btn-on-photo" onClick={() => setAdding(true)}>
              Supplement ekle
            </button>
          )
        }
      >
        {rows.length > 0 && (
          <HeroStats>
            <HeroStat label="Bugün" value={due.length} unit="tane" foot="alınacak" />
            <HeroStat label="İşaretlenen" value={answered} foot={`${Math.max(due.length - answered, 0)} kaldı`} />
            <HeroStat label="Tanımlı" value={rows.length} unit="supplement" />
          </HeroStats>
        )}
      </Hero>

      {mark.isError && <ErrorBox error={mark.error} />}

      {today.isLoading ? (
        <Loading />
      ) : today.isError ? (
        <ErrorBox error={today.error} onRetry={() => void today.refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          photo="app-supplements"
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
                    className="reveal flex items-center justify-between gap-4 py-4"
                    style={{ ["--i" as string]: index }}
                  >
                    {/* Ad düğme: dokununca düzenleme paneli açılıyor. Adı ve
                        dozu değiştirmenin başka yolu yoktu. */}
                    <button
                      type="button"
                      onClick={() => setEditing(row.supplement)}
                      aria-label={`${row.supplement.name} ayarlarını düzenle`}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-base">
                        {row.supplement.name}
                        {row.supplement.dose && (
                          <span className="ml-1.5 text-sm text-[var(--color-ink-faint)]">
                            {row.supplement.dose}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--color-ink-faint)]">
                        {SCHEDULE_LABEL[row.supplement.schedule] ?? row.supplement.schedule}
                      </span>
                    </button>

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
                      <button
                        type="button"
                        onClick={() => setEditing(row.supplement)}
                        aria-label={`${row.supplement.name} ayarlarını düzenle`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm text-[var(--color-ink-muted)]">
                          {row.supplement.name}
                        </span>
                        <span className="block text-2xs text-[var(--color-ink-faint)]">
                          {SCHEDULE_LABEL[row.supplement.schedule] ?? row.supplement.schedule}
                        </span>
                      </button>
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

      {adding && <SupplementSheet onClose={() => setAdding(false)} />}
      {editing && (
        <SupplementSheet existing={editing} onClose={() => setEditing(null)} />
      )}
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

/**
 * Supplement paneli — ekleme ve düzenleme aynı form.
 *
 * Düzenleme uç noktaları (PATCH, DELETE) baştan vardı; arayüzde yalnızca
 * ekleme vardı. Yanlış yazılan bir ad ya da değişen bir doz için listeyi
 * silip yeniden kurmak gerekiyordu.
 */
function SupplementSheet({
  existing,
  onClose,
}: {
  existing?: SupplementRow;
  onClose: () => void;
}) {
  const create = useCreateSupplement();
  const update = useUpdateSupplement();
  const remove = useDeleteSupplement();
  const [name, setName] = useState(existing?.name ?? "");
  const [dose, setDose] = useState(existing?.dose ?? "");
  const [schedule, setSchedule] = useState(existing?.schedule ?? "daily");
  /** Silme iki adımda: tek dokunuşla uyum geçmişi gitmesin. */
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pending = create.isPending || update.isPending;
  const error = create.isError ? create.error : update.isError ? update.error : null;

  const submit = () => {
    if (!name.trim()) return;
    const body = { name: name.trim(), dose: dose.trim() || null, schedule };
    if (existing) update.mutate({ id: existing.id, ...body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };

  return (
    <Sheet
      title={existing ? existing.name : "Yeni supplement"}
      onClose={onClose}
      width="26rem"
      footer={
        <button
          type="button"
          className="btn btn-primary w-full py-3"
          disabled={pending || !name.trim()}
          onClick={submit}
        >
          {pending ? "Kaydediliyor…" : existing ? "Kaydet" : "Ekle"}
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
        {error !== null && <ErrorBox error={error} />}

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

        {existing && (
          <div className="mt-2 border-t border-[var(--color-border)] pt-4">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="w-full text-sm text-[var(--color-ink-muted)]">
                  Uyum geçmişi de silinir. Emin misin?
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(existing.id, { onSuccess: onClose })}
                >
                  {remove.isPending ? "Siliniyor…" : "Evet, sil"}
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-quiet -ml-2.5"
                onClick={() => setConfirmDelete(true)}
              >
                Listeden sil
              </button>
            )}
            {remove.isError && (
              <div className="mt-3">
                <ErrorBox error={remove.error} />
              </div>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}

