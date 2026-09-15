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

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, "approved" | "rejected">>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
            if (last) next[next.length - 1] = { ...last, text: last.text + text };
            return next;
          });
        } else if (event.type === "pending_action") {
          const action = event.data as PendingAction;
          setTurns((t) => {
            const next = [...t];
            const last = next[next.length - 1];
            if (last) {
              next[next.length - 1] = { ...last, pending: [...(last.pending ?? []), action] };
            }
            return next;
          });
        } else if (event.type === "error") {
          setError((event.data as { message: string }).message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oldu.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, photo]);

  const resolve = useCallback(async (id: string, decision: "approve" | "reject") => {
    try {
      await api.post(`/chat/pending-actions/${id}/${decision}`);
      setResolved((r) => ({ ...r, [id]: decision === "approve" ? "approved" : "rejected" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onay işlemi başarısız.");
    }
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <h1 className="text-2xl font-semibold tracking-tight">Asistan</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        Antrenman, beslenme ve programın hakkında konuş. Veri değiştiren öneriler onayına sunulur.
      </p>

      <div className="mt-6 flex-1 space-y-4">
        {turns.length === 0 && (
          <div className="card p-4 text-sm text-[var(--color-ink-muted)]">
            <p className="mb-2 text-[var(--color-ink)]">Örnek:</p>
            <ul className="space-y-1">
              <li>&ldquo;Bugün 300gr tavuk ve 150gr pilav yedim&rdquo;</li>
              <li>&ldquo;Chest press&apos;te bugün ne kadar kaldırayım?&rdquo;</li>
              <li>&ldquo;Haftada 4 gün için üst/alt split programı kur&rdquo;</li>
            </ul>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                turn.role === "user"
                  ? "max-w-[85%] rounded-[5px] bg-[var(--color-surface-raised)] px-3 py-2 text-sm"
                  : "w-full text-sm"
              }
            >
              {turn.text ? (
                <p className="whitespace-pre-wrap">{turn.text}</p>
              ) : (
                busy && i === turns.length - 1 && (
                  <p className="text-[var(--color-ink-faint)]">Düşünüyor…</p>
                )
              )}

              {turn.pending?.map((action) => {
                const state = resolved[action.id];
                return (
                  <div
                    key={action.id}
                    className="card mt-3 border-[var(--color-accent)]/40 p-3"
                  >
                    <p className="text-2xs uppercase tracking-wide text-[var(--color-ink-faint)]">
                      {ACTION_LABELS[action.action_type] ?? action.action_type} · onayın gerekiyor
                    </p>
                    <p className="mt-1.5 text-sm">{action.summary}</p>

                    {state === undefined ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {/* Program önerileri doğrudan onaylanmıyor: Bölüm 4.1
                            tam ekran bir "gözden geçir" adımı şart koşuyor.
                            28 hareketlik bir programı tek satırlık özete bakıp
                            onaylamak zaten kör onay olurdu. */}
                        {action.action_type === "propose_program" ? (
                          <Link
                            href={`/programs/review/${action.id}`}
                            className="btn btn-primary"
                          >
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
                      <p
                        className="mt-2 text-xs"
                        style={{
                          color:
                            state === "approved"
                              ? "var(--color-accent-deep)"
                              : "var(--color-ink-faint)",
                        }}
                      >
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

      <div className="sticky bottom-20 mt-4 sm:bottom-0">
        {photo && (
          <div className="mb-2 flex items-center gap-2 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate">{photo.name}</span>
            <span className="tnum shrink-0 text-[var(--color-ink-faint)]">
              {(photo.size / 1024 / 1024).toFixed(1)} MB
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
          className="flex gap-2"
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
            className="grid size-10 shrink-0 place-items-center rounded-[3px] border border-[var(--color-border-strong)] text-[var(--color-ink-muted)] disabled:opacity-40"
          >
            📷
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={photo ? "Not ekle (isteğe bağlı)…" : "Bir şey sor ya da anlat…"}
            className="min-w-0 flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-faint)]"
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
  );
}
