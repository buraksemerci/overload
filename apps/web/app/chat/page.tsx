"use client";

/**
 * AI Asistan (Bölüm 8, ekran 13).
 *
 * Onay kartı akışının kullanıcı tarafı burada. Kritik nokta: "Onayla" butonu
 * modele DEĞİL, `/chat/pending-actions/{id}/approve` endpoint'ine gider.
 * Bu bileşen modele hiçbir şekilde "şunu uygula" diyemez — sadece kullanıcının
 * kararını backend'e iletir.
 */

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Meter } from "@/components/Charts";
import { Hero, Page } from "@/components/Layout";
import { keys, useAiUsage } from "@/lib/queries";
import { api, streamChat } from "@/lib/api";
import { uploadPhoto } from "@/lib/upload";

interface PendingAction {
  id: string;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  pending?: PendingAction[];
}

const ACTION_LABELS: Record<string, string> = {
  propose_program: "Program önerisi",
  propose_update: "Değişiklik önerisi",
  add_exercise_to_library: "Yeni hareket önerisi",
};

/** Boş sohbetteki öneriler. Üçü de uygulamanın üç ayrı işini gösteriyor:
 *  kayıt, soru, üretim. */
const EXAMPLES = [
  { kind: "Kaydet", text: "Bugün 300gr tavuk ve 150gr pilav yedim" },
  { kind: "Sor", text: "Chest press'te bugün ne kadar kaldırayım?" },
  { kind: "Kur", text: "Haftada 4 gün için üst/alt split programı kur" },
] as const;

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<
    Record<string, "approved" | "rejected">
  >({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const client = useQueryClient();

  const send = useCallback(async () => {
    const message = input.trim();
    if ((!message && !photo) || busy) return;

    const pendingPhoto = photo;
    setInput("");
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
    setBusy(true);
    setTurns((t) => [
      ...t,
      { role: "user", text: message || "(fotoğraf)" },
      { role: "assistant", text: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Fotoğraf varsa önce R2'ye yükleniyor; modele anahtar değil, backend'in
      // ürettiği taze ön-imzalı URL gidiyor.
      let imageKey: string | undefined;
      if (pendingPhoto) {
        setUploading(true);
        try {
          imageKey = await uploadPhoto(pendingPhoto, "meal");
        } finally {
          setUploading(false);
        }
      }

      for await (const event of streamChat(
        message || "Bu fotoğraftaki yemeği kaydet.",
        imageKey,
        controller.signal,
      )) {
        if (event.type === "text") {
          const { text } = event.data as { text: string };
          setTurns((t) => {
            const next = [...t];
            const last = next[next.length - 1];
            if (last)
              next[next.length - 1] = { ...last, text: last.text + text };
            return next;
          });
        } else if (event.type === "pending_action") {
          const action = event.data as PendingAction;
          setTurns((t) => {
            const next = [...t];
            const last = next[next.length - 1];
            if (last) {
              next[next.length - 1] = {
                ...last,
                pending: [...(last.pending ?? []), action],
              };
            }
            return next;
          });
        } else if (event.type === "error") {
          setError((event.data as { message: string }).message);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Beklenmeyen bir hata oldu.",
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
      // Tur bitti: günlük AI sayacı değişti. Hesap ekranı bir sonraki
      // açılışında taze değeri görsün — yoksa sınıra takılan kullanıcı orada
      // hâlâ boş bir çubuk görüyor.
      void client.invalidateQueries({ queryKey: keys.aiUsage });
    }
  }, [input, busy, photo, client]);

  const resolve = useCallback(
    async (id: string, decision: "approve" | "reject") => {
      try {
        await api.post(`/chat/pending-actions/${id}/${decision}`);
        setResolved((r) => ({
          ...r,
          [id]: decision === "approve" ? "approved" : "rejected",
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Onay işlemi başarısız.");
      }
    },
    [],
  );

  const empty = turns.length === 0;

  return (
    <Page>
      <Hero
        photo="app-cafe"
        position="center 40%"
        size="sm"
        eyebrow="Koç"
        title="Asistan"
        lead="Antrenman, beslenme ve programın hakkında konuş. Veri değiştiren öneriler önce onayına sunulur."
        actions={<UsageChip />}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12">
        {/* Sohbet sütunu. Okunabilir satır boyu için dar; sağdaki boşluğu
            "nasıl çalışıyor" sütunu dolduruyor. */}
        <div className="flex min-h-[26rem] min-w-0 flex-col">
          <div className="flex flex-1 flex-col gap-6">
            {empty && (
              /* Örnekler TIKLANABİLİR. Alıntı işaretleri içinde duran üç
                 cümle ne yazılabileceğini anlatıyordu ama yazmayı hâlâ
                 kullanıcıya bırakıyordu. Dokununca alan doluyor ve imleç
                 orada. */
              <div>
                <p className="label mb-3">Şunları deneyebilirsin</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {EXAMPLES.map(({ kind, text }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => {
                        setInput(text);
                        inputRef.current?.focus();
                      }}
                      className="card lift flex min-h-[6.5rem] flex-col justify-between gap-4 p-5 text-left sm:min-h-[9.5rem] sm:gap-6"
                    >
                      <span className="label" aria-hidden>
                        {kind}
                      </span>
                      <span className="display text-base leading-snug sm:text-lg">{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, i) => (
              <div key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={
                    turn.role === "user"
                      ? "max-w-[85%] bg-[var(--color-surface-raised)] px-4 py-3 text-base"
                      : "w-full max-w-[68ch] text-base leading-relaxed"
                  }
                >
                  {turn.text ? (
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                  ) : (
                    busy &&
                    i === turns.length - 1 && (
                      <p className="flex items-center gap-2 text-[var(--color-ink-faint)]">
                        <span aria-hidden className="thinking" />
                        Düşünüyor…
                      </p>
                    )
                  )}

                  {turn.pending?.map((action) => {
                    const state = resolved[action.id];
                    return (
                      <div
                        key={action.id}
                        className="card-raised mt-4 border-l-2 p-5"
                        style={{ borderLeftColor: "var(--color-accent)" }}
                      >
                        <p className="label">
                          {ACTION_LABELS[action.action_type] ?? action.action_type} · onayın
                          gerekiyor
                        </p>
                        <p className="mt-2 text-base">{action.summary}</p>

                        {state === undefined ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {/* Program önerileri doğrudan onaylanmıyor: Bölüm 4.1
                              tam ekran bir "gözden geçir" adımı şart koşuyor.
                              28 hareketlik bir programı tek satırlık özete bakıp
                              onaylamak zaten kör onay olurdu. */}
                            {action.action_type === "propose_program" ? (
                              <Link href={`/programs/review/${action.id}`} className="btn btn-primary">
                                Gözden geçir ve onayla
                              </Link>
                            ) : (
                              <button
                                className="btn btn-primary"
                                onClick={() => resolve(action.id, "approve")}
                              >
                                Onayla
                              </button>
                            )}
                            <button
                              className="btn btn-ghost"
                              onClick={() => resolve(action.id, "reject")}
                            >
                              Reddet
                            </button>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                            {state === "approved" ? "✓ Uygulandı" : "Reddedildi"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {error && (
              <p className="text-sm" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}
          </div>

          {/* Yazı alanı sütunun dibine yapışık. Arkası zeminle boyalı:
              saydamken kayan mesajların yazısı alanın içinden geçiyordu. */}
          <div
            className="sticky bottom-0 -mx-1 mt-8 px-1 pt-4 pb-5"
            style={{
              background: "linear-gradient(to top, var(--color-ground) 70%, transparent)",
            }}
          >
            {photo && (
              <div className="card mb-2 flex items-center gap-2 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{photo.name}</span>
                <span className="tnum shrink-0 text-[var(--color-ink-faint)]">
                  {(photo.size / 1024 / 1024).toLocaleString("tr-TR", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  MB
                </span>
                <button
                  onClick={() => {
                    setPhoto(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  aria-label="Fotoğrafı kaldır"
                  className="shrink-0 text-[var(--color-ink-faint)] hover:text-[var(--color-danger)]"
                >
                  ✕
                </button>
              </div>
            )}

            <form
              className="card-raised flex items-center gap-1 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {/* `capture` telefonda doğrudan kamerayı açıyor — tabaktaki yemeği
                kaydetmenin en kısa yolu. Masaüstünde yok sayılıyor. */}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                capture="environment"
                className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                aria-label="Fotoğraf ekle"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="grid size-11 shrink-0 place-items-center text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
              >
                {/* Emoji YERİNE simge: emoji her platformda farklı çiziliyor ve
                  yanındaki nötr arayüzün içinde renkli bir leke bırakıyor. */}
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a2 2 0 0 0 1.7-.95l.5-.8A2 2 0 0 1 10.6 3h2.8a2 2 0 0 1 1.7.95l.5.8A2 2 0 0 0 17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={photo ? "Not ekle (isteğe bağlı)…" : "Bir şey sor ya da anlat…"}
                aria-label="Mesaj"
                className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-[var(--color-ink-faint)]"
                disabled={busy}
              />
              <button
                type="submit"
                className="btn btn-primary shrink-0"
                disabled={busy || (!input.trim() && !photo)}
              >
                {uploading ? "Yükleniyor…" : "Gönder"}
              </button>
            </form>
          </div>
        </div>

        <HowItWorks />
      </div>
    </Page>
  );
}

/** Bugünkü asistan kullanımı. Sınıra yaklaşınca uyarı rengine dönüyor. */
function UsageChip() {
  const usage = useAiUsage();
  if (!usage.data || usage.data.request_limit <= 0) return null;
  const { requests, request_limit } = usage.data;
  const left = Math.max(request_limit - requests, 0);
  return (
    <div className="glass w-56 px-4 py-3">
      <p
        className="flex items-baseline justify-between gap-3 text-xs"
        style={{ color: "var(--color-on-night-muted)" }}
      >
        <span>Bugün kalan</span>
        <span className="tnum" style={{ color: "var(--color-on-night)" }}>
          {left} / {request_limit} mesaj
        </span>
      </p>
      <div className="mt-2">
        <Meter
          value={requests}
          max={request_limit}
          night
          tone={left <= request_limit * 0.1 ? "warning" : "accent"}
        />
      </div>
    </div>
  );
}

/**
 * Onay kuralı sohbetin yanında hep görünür. Asistan hiçbir veriyi kendi
 * başına değiştirmiyor; bunu bir kez okuyan kişi öneri kartına güvenle
 * bakabiliyor.
 */
const STEPS = [
  { title: "Yaz ya da fotoğraf çek", body: "Yediğini, kaldırdığını, sorunu düz cümleyle anlat." },
  { title: "Asistan önerir", body: "Verini okuyup bir kayıt, bir hedef ya da bir program önerir." },
  {
    title: "Sen onaylarsın",
    body: "Onaylamadığın hiçbir şey kaydedilmez. Programlar önce tam ekranda gözden geçirilir.",
  },
] as const;

function HowItWorks() {
  return (
    <aside
      aria-label="Asistan nasıl çalışıyor"
      // Dar ekranda yok: yazı alanının altında kalıyor ve bantta aynı söz
      // ("öneriler önce onayına sunulur") zaten yazıyor.
      className="tile-night hidden p-6 lg:sticky lg:top-24 lg:block lg:p-8"
    >
      <p className="label" style={{ color: "var(--color-on-night-faint)" }}>
        Nasıl çalışıyor
      </p>
      <ol className="mt-6 space-y-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[2.25rem_1fr] gap-3">
            <span
              aria-hidden
              className="display tnum text-2xl leading-none"
              style={{
                color: index === STEPS.length - 1 ? "var(--color-on-night)" : "var(--color-on-night-faint)",
              }}
            >
              {index + 1}
            </span>
            <div>
              <p className="text-base font-medium" style={{ color: "var(--color-on-night)" }}>
                {step.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-on-night-muted)" }}>
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
