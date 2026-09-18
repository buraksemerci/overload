"use client";

/**
 * Ekran çöktüğünde.
 *
 * İstemci tarafında beklenmeyen bir hata (bir bileşenin render'ı) bütün
 * ekranı boş bırakıyordu; üretim derlemesinde hata mesajı da görünmüyor.
 * Burada üç şey var: ne olduğu, TEKRAR DENEME (React ağacı yeniden kuruluyor)
 * ve bir çıkış.
 *
 * `digest` sunucu günlüğündeki kaydın kimliği. Kullanıcıya teknik mesaj
 * gösterilmiyor ama bu kısa kod, "bu ekranda hata aldım" derken elindeki tek
 * kanıt — o yüzden duruyor.
 */

import Link from "next/link";
import { useEffect } from "react";
import { Hero, Page } from "@/components/Layout";

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Tarayıcı konsoluna bırakılıyor: uzak bir hata toplayıcı yok ve
    // sessizce yutmak, hatayı hiç görmemek demek.
    console.error(error);
  }, [error]);

  return (
    <Page>
      <Hero
        photo="app-gym-wide"
        size="md"
        eyebrow="Hata"
        title="Bu ekran açılamadı"
        lead="Beklenmeyen bir şey oldu. Tekrar denemek çoğu zaman yetiyor; sürerse panelden devam et."
        actions={
          <>
            <button type="button" className="btn btn-primary px-6 py-3" onClick={reset}>
              Tekrar dene
            </button>
            <Link href="/" className="btn btn-on-photo px-6 py-3">
              Panele dön
            </Link>
          </>
        }
      />

      {error.digest && (
        <p className="tnum text-xs text-[var(--color-ink-faint)]">Hata kodu: {error.digest}</p>
      )}
    </Page>
  );
}
