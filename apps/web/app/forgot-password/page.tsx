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
import { AuthField, AuthScreen } from "@/components/AuthScreen";
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

  if (sent) {
    return (
      <AuthScreen
        photo="app-entry"
        title="Bağlantı yolda"
        lead="Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunu kontrol et — gelmediyse adresi doğru yazdığından emin ol."
      >
        <Link href="/login" className="btn btn-on-photo">
          Giriş ekranına dön
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      photo="app-entry"
      title="Parolamı unuttum"
      lead="E-posta adresini yaz; sıfırlama bağlantısını gönderelim."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          label="E-posta"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary w-full py-3.5"
          disabled={busy || email.length === 0}
        >
          {busy ? "…" : "Bağlantıyı gönder"}
        </button>
      </form>
      <Link href="/login" className="link mt-6 inline-block text-sm">
        Giriş ekranına dön
      </Link>
    </AuthScreen>
  );
}
