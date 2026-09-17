"use client";

/**
 * Yeni parola belirleme.
 *
 * --------------------------------------------------------------------------
 * TOKEN ADRESTEN GELİYOR
 * --------------------------------------------------------------------------
 * E-postadaki bağlantı `?token=...` taşıyor. Token adres çubuğunda duruyor ve
 * bu kaçınılmaz: e-postayla taşınabilecek tek yer orası. Bunu kabul
 * edilebilir kılan şey token'ın tek kullanımlık ve bir saat geçerli olması.
 *
 * --------------------------------------------------------------------------
 * PAROLA İKİ KEZ
 * --------------------------------------------------------------------------
 * Yazdığını göremeyen kullanıcı yanlış yazarsa hesabına bir daha giremez ve
 * baştan sıfırlama yapmak zorunda kalır. İki alan bu döngüyü kesiyor.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthField, AuthScreen } from "@/components/AuthScreen";
import { resetPassword } from "@/lib/auth";

const MIN_LENGTH = 8;

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (token === null) {
    return (
      <AuthScreen
        title="Bağlantı geçersiz"
        lead="Bu adres bir sıfırlama kodu taşımıyor. E-postadaki bağlantıyı olduğu gibi açtığından emin ol."
      >
        <Link href="/forgot-password" className="btn btn-on-photo">
          Yeni bağlantı iste
        </Link>
      </AuthScreen>
    );
  }

  if (done) {
    return (
      <AuthScreen title="Parolan değişti" lead="Yeni parolanla giriş yapabilirsin.">
        <Link href="/login" className="btn btn-primary px-6 py-3.5">
          Giriş yap
        </Link>
      </AuthScreen>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // `token` yukarıda erken dönüşle elendi; TypeScript o daralmayı bu iç
    // fonksiyona taşıyamıyor (kapanış sonradan da çağrılabilir).
    if (busy || token === null) return;
    if (password !== repeat) {
      setError("İki parola aynı değil.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
      // Giriş ekranına kendiliğinden gitmiyor: kullanıcı "oldu" cümlesini
      // görmeden yönlendirilirse işlemin başarılı olup olmadığını bilmiyor.
      router.prefetch("/login");
    } catch (err) {
      // Mesaj `lib/auth.ts`te çevriliyor: sunucu "RESET_PASSWORD_BAD_TOKEN"
      // gibi kodlar dönüyor ve onları olduğu gibi göstermek kullanıcıya
      // hiçbir şey anlatmıyor.
      setError(
        err instanceof Error ? err.message : "Parola değiştirilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Yeni parola" lead={`En az ${MIN_LENGTH} karakter.`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          label="Yeni parola"
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <AuthField
          label="Yeni parola (tekrar)"
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />

        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full py-3.5"
          disabled={busy || password.length < MIN_LENGTH}
        >
          {busy ? "…" : "Parolayı değiştir"}
        </button>
      </form>
    </AuthScreen>
  );
}

export default function ResetPasswordPage() {
  /* `useSearchParams` Suspense sınırı istiyor: sayfa statik üretiliyor ve
     adres ancak istemcide biliniyor. */
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
