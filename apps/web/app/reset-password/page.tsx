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
      <>
        <h1 className="display text-2xl">Bağlantı geçersiz</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Bu adres bir sıfırlama kodu taşımıyor. E-postadaki bağlantıyı
          olduğu gibi açtığından emin ol.
        </p>
        <Link href="/forgot-password" className="link mt-6 self-start text-sm">
          Yeni bağlantı iste
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="display text-2xl">Parolan değişti</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Yeni parolanla giriş yapabilirsin.
        </p>
        <Link href="/login" className="btn btn-primary mt-6 self-start">
          Giriş yap
        </Link>
      </>
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
    <>
      <h1 className="display text-2xl">Yeni parola</h1>
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
        En az {MIN_LENGTH} karakter.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label">Yeni parola</span>
          <input
            type="password"
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field h-11 w-full px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Yeni parola (tekrar)</span>
          <input
            type="password"
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            className="field h-11 w-full px-3 text-sm"
          />
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary mt-1 w-full py-3"
          disabled={busy || password.length < MIN_LENGTH}
        >
          {busy ? "…" : "Parolayı değiştir"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center">
      {/* `useSearchParams` Suspense sınırı istiyor: sayfa statik üretiliyor ve
          adres ancak istemcide biliniyor. */}
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
