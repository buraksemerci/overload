"use client";

/**
 * Kök düzen çökerse.
 *
 * Bu dosya `app/error.tsx`ten farklı: hata düzenin KENDİSİNDE olduğunda React
 * ağacın tamamını atıyor, yani `<html>` ve `<body>` de buradan geliyor —
 * tasarım sistemi, yazı tipleri ve gezinme yok. O yüzden stiller satır içi ve
 * palet elle yazılı; tek amacı beyaz bir ölüm ekranı yerine okunur bir cümle
 * ve yeniden yükleme düğmesi göstermek.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "oklch(13.5% 0.008 115)",
          color: "oklch(95% 0.006 115)",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "30rem" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.08em", color: "oklch(58% 0.01 115)" }}>
            OVERLOAD
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.75rem", lineHeight: 1.2 }}>
            Uygulama açılamadı
          </h1>
          <p style={{ margin: "0.75rem 0 0", lineHeight: 1.6, color: "oklch(75% 0.01 115)" }}>
            Beklenmeyen bir hata oldu. Sayfayı yeniden yüklemek çoğu zaman yetiyor.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              border: "none",
              cursor: "pointer",
              background: "oklch(90% 0.19 118)",
              color: "oklch(17% 0.02 118)",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Yeniden yükle
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "oklch(58% 0.01 115)" }}>
              Hata kodu: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
