"use client";

/**
 * Yükleniyor / hata / boş durum bileşenleri.
 *
 * Üçü de her ekranda tekrarlanıyor; tek yerde tutmak tutarlılığı sağlıyor.
 *
 * **Boş durum mesajları eylem içerir.** "Veri yok" demek kullanıcıyı çıkmaza
 * sokar; "ilk kilonu gir" demek ne yapacağını söyler.
 */

export function Loading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <p className="py-8 text-center text-sm text-[var(--color-ink-faint)]" role="status">
      {label}
    </p>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof Error ? error.message : "Beklenmeyen bir hata oldu.";
  return (
    <div className="card p-4" role="alert">
      <p className="text-sm" style={{ color: "var(--color-danger)" }}>
        {message}
      </p>
      {onRetry && (
        <button className="btn btn-ghost mt-3" onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-[var(--color-ink)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: "accent" | "success" | "warning";
}) {
  const color =
    tone === "accent"
      ? "var(--color-accent)"
      : tone === "success"
        ? "var(--color-success)"
        : tone === "warning"
          ? "var(--color-warning)"
          : "var(--color-ink)";
  return (
    <div className="card p-4">
      <p className="text-xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1">
        <span className="tnum text-xl font-semibold" style={{ color }}>
          {value}
        </span>
        {unit && <span className="ml-1 text-xs text-[var(--color-ink-faint)]">{unit}</span>}
      </p>
    </div>
  );
}

/** Sayısal metinleri güvenle biçimlendirir — backend Decimal'leri string döndürüyor. */
export function fmt(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
