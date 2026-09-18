/**
 * Oturumsuz ekranların kabuğu — parola kurtarma ve e-posta doğrulama.
 *
 * Bu üç ekran siyah bir zeminde ortalanmış küçük bir formdu: uygulamanın
 * geri kalanıyla (fotoğraflı bantlar, büyük yazı) aynı dili konuşmuyordu.
 * Şimdi giriş anlatısının salonu arkada, form onun üstünde bir cam levhada.
 *
 * Geniş ekranda ikiye bölünüyor (solda salon, sağda form); dar ekranda
 * fotoğraf tam sayfa ve form üstünde. İkisinde de okunurluğu taşıyan şey
 * perde, kontrast değil — fotoğraf zaten karanlık bir salon.
 */

import Link from "next/link";
import { Photo } from "@/components/Photo";

export function AuthScreen({
  photo = "app-entry",
  position = "center",
  title,
  lead,
  children,
}: {
  photo?: string;
  position?: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    /* Tam genişlik: `main` kendi dolgusunu veriyor, bu kabuk onun dışına,
       ekranın kenarına kadar taşıyor. */
    <div
      className="relative isolate grid min-h-[100dvh] items-center lg:grid-cols-2"
      style={{ width: "100vw", marginInline: "calc(50% - 50vw)" }}
    >
      <div aria-hidden className="absolute inset-0 lg:relative lg:h-full">
        <Photo
          slug={photo}
          fill
          position={position}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="size-full"
          eager
        />
        {/* Perde YALNIZCA dar ekranda ağır: orada yazı fotoğrafın üstünde
            duruyor. Geniş ekranda yazı kendi sütununda ve fotoğrafı
            karartmanın tek sonucu sahneyi kaybetmek olurdu. */}
        <div
          className="absolute inset-0 lg:hidden"
          style={{
            background:
              "linear-gradient(to top, oklch(12% 0.01 115 / 0.9) 0%, oklch(12% 0.01 115 / 0.55) 55%, oklch(12% 0.01 115 / 0.35) 100%)",
          }}
        />
        <div
          className="absolute inset-0 hidden lg:block"
          style={{
            background:
              "linear-gradient(to right, transparent 55%, oklch(12% 0.01 115 / 0.55) 100%)",
          }}
        />
      </div>

      <div className="relative flex min-h-[100dvh] flex-col justify-center px-6 py-16 sm:px-12 lg:min-h-0 lg:px-16">
        <div className="w-full max-w-sm">
          <Link
            href="/login"
            className="display text-lg tracking-tight"
            style={{ color: "var(--color-on-night)" }}
          >
            overload
          </Link>

          <h1
            className="display mt-10 text-3xl lg:text-4xl"
            style={{ color: "var(--color-on-night)" }}
          >
            {title}
          </h1>
          {lead && (
            <p
              className="mt-3 text-base leading-relaxed"
              style={{ color: "var(--color-on-night-muted)" }}
            >
              {lead}
            </p>
          )}

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Cam levhanın üstündeki alan. Koyu fotoğraf üzerinde `field` okunmuyordu. */
export function AuthField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label" style={{ color: "var(--color-on-night-muted)" }}>
        {label}
      </span>
      <input
        {...props}
        className="h-12 w-full border px-4 text-base outline-none"
        style={{
          background: "oklch(12% 0.01 115 / 0.5)",
          borderColor: "oklch(99% 0 0 / 0.22)",
          color: "var(--color-on-night)",
        }}
      />
    </label>
  );
}
