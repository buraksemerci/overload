"use client";

/**
 * E-posta doğrulama.
 *
 * Bağlantı e-postadan geliyor ve BAŞKA BİR CİHAZDA açılabiliyor — telefona
 * gelen postayı bilgisayarda açmak sıradan. O yüzden bu ekran oturum
 * istemiyor: token kimliği zaten taşıyor.
 *
 * Doğrulama sayfa açılır açılmaz kendiliğinden yapılıyor. "Doğrula" düğmesi
 * koymak, kullanıcıya zaten verdiği kararı bir kez daha sordurmak olurdu:
 * bağlantıya tıklamak onayın kendisi.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { verifyEmail } from "@/lib/auth";

type State = "working" | "ok" | "failed";

function Verify() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<State>(token === null ? "failed" : "working");
  /** React geliştirme kipinde etkiyi iki kez çalıştırıyor; token tek
   *  kullanımlık ve ikinci istek her zaman başarısız olurdu. */
  const started = useRef(false);

  useEffect(() => {
    if (token === null || started.current) return;
    started.current = true;
    void (async () => {
      try {
        await verifyEmail(token);
        setState("ok");
      } catch {
        setState("failed");
      }
    })();
  }, [token]);

  if (state === "working") {
    return <p className="text-sm text-[var(--color-ink-muted)]">Doğrulanıyor…</p>;
  }

  if (state === "ok") {
    return (
      <>
        <h1 className="display text-2xl">E-postan doğrulandı</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Hesabın hazır.
        </p>
        <Link href="/" className="btn btn-primary mt-6 self-start">
          Uygulamaya git
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="display text-2xl">Doğrulanamadı</h1>
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
        Bağlantının süresi dolmuş ya da daha önce kullanılmış olabilir.
        Hesabına girip yeni bir doğrulama e-postası isteyebilirsin.
      </p>
      <Link href="/login" className="link mt-6 self-start text-sm">
        Giriş ekranına dön
      </Link>
    </>
  );
}

export default function VerifyPage() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center">
      <Suspense fallback={null}>
        <Verify />
      </Suspense>
    </div>
  );
}
