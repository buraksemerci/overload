"use client";

/**
 * Parolamı unuttum.
 *
 * --------------------------------------------------------------------------
 * YANIT HER ZAMAN AYNI
 * --------------------------------------------------------------------------
 * Adres kayıtlı olsa da olmasa da ekranda aynı cümle çıkıyor. Farklı bir şey
 * söylemek — "böyle bir hesap yok" — bir adresin bu uygulamada kayıtlı olup
 * olmadığını dışarıdan öğrenmenin yolu olurdu. Sunucu da aynı sebeple her
 * durumda 202 dönüyor.
 *
 * Bunun bedeli: adresini yanlış yazan kullanıcı bunu anlamıyor ve postayı
 * bekliyor. Cümlede "gelmedi mi, adresi kontrol et" demek o yüzden gerekli.
 */

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    // Hata `requestPasswordReset` içinde yutuluyor: sunucu var olmayan adres
    // için de 202 dönüyor ve burada farklı davranmak o kararı boşa çıkarırdı.
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center">
      <h1 className="display text-2xl">Parolamı unuttum</h1>

      {sent ? (
        <>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunu
            kontrol et — gelmediyse adresi doğru yazdığından emin ol.
          </p>
          <Link href="/login" className="link mt-6 self-start text-sm">
            Giriş ekranına dön
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            E-posta adresini yaz; sıfırlama bağlantısını gönderelim.
          </p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label">E-posta</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field h-11 w-full px-3 text-sm"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary mt-1 w-full py-3"
              disabled={busy || email.length === 0}
            >
              {busy ? "…" : "Bağlantıyı gönder"}
            </button>
          </form>
          <Link href="/login" className="link mt-4 self-start text-xs">
            Giriş ekranına dön
          </Link>
        </>
      )}
    </div>
  );
}
