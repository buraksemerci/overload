"use client";

/**
 * AI Asistan (Bölüm 8, ekran 13).
 *
 * Onay kartı akışının kullanıcı tarafı burada. Kritik nokta: "Onayla" butonu
 * modele DEĞİL, `/chat/pending-actions/{id}/approve` endpoint'ine gider.
 * Bu bileşen modele hiçbir şekilde "şunu uygula" diyemez — sadece kullanıcının
 * kararını backend'e iletir.
 */

import { useCallback, useRef, useState } from "react";
import { api, streamChat } from "@/lib/api";

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
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setError(null);
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: message }, { role: "assistant", text: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of streamChat(message, undefined, controller.signal)) {
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
  }, [input, busy]);

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
                      <div className="mt-3 flex gap-2">
                        <button
                          className="btn btn-primary"
                          onClick={() => resolve(action.id, "approve")}
                        >
                          Onayla
                        </button>
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
                              ? "var(--color-success)"
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

      <form
        className="sticky bottom-20 mt-4 flex gap-2 sm:bottom-0"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Bir şey sor ya da anlat…"
          className="flex-1 rounded-[3px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-faint)]"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          Gönder
        </button>
      </form>
    </div>
  );
}
