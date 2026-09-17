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
import { AuthScreen } from "@/components/AuthScreen";
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
    return (
      <AuthScreen title="Doğrulanıyor…" lead="E-posta adresin kontrol ediliyor.">
        <span aria-busy="true" className="block h-12" />
      </AuthScreen>
    );
  }

  if (state === "ok") {
    return (
      <AuthScreen title="E-postan doğrulandı" lead="Hesabın hazır.">
        <Link href="/" className="btn btn-primary px-6 py-3.5">
          Uygulamaya git
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Doğrulanamadı"
      lead="Bağlantının süresi dolmuş ya da daha önce kullanılmış olabilir. Hesabına girip yeni bir doğrulama e-postası isteyebilirsin."
    >
      <Link href="/login" className="btn btn-on-photo">
        Giriş ekranına dön
      </Link>
    </AuthScreen>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}
