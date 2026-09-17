"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PUBLIC_PATHS } from "@/components/AuthGate";
import { useMe } from "@/lib/queries";

/**
 * Tanışma akışını bitirmemiş kullanıcıyı akışa yönlendiriyor.
 *
 * --------------------------------------------------------------------------
 * NEDEN BİR KAPI
 * --------------------------------------------------------------------------
 * Kayıttan sonra doğrudan akışa gidiliyor (`app/login/page.tsx`) ama bu tek
 * yol değil: kayıt olup sekmeyi kapatan, başka cihazdan giren ya da akış
 * eklenmeden önce hesap açmış biri de akışı görmeli. Karar sunucudaki
 * `onboarding_completed_at`e dayanıyor, tarayıcıda tutulan bir bayrağa değil
 * — yoksa her yeni cihaz akışı yeniden sorardı.
 *
 * --------------------------------------------------------------------------
 * AĞ YOKSA ENGEL YOK
 * --------------------------------------------------------------------------
 * Profil yüklenirken ya da yüklenemediğinde ekran AÇIK kalıyor. Uygulama
 * salonda, zayıf bağlantıda kullanılıyor: `/users/me` yanıt veremiyor diye
 * set girilemeyen bir antrenman ekranı, akışı atlamış bir kullanıcıdan çok
 * daha kötü. Yönlendirme yalnızca sunucu açıkça "bitmedi" dediğinde.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Oturumsuz ekranlarda profil sorulmuyor: sorgu 401 döner ve anlamsız.
  // Akışın kendisi de kapının dışında — kendine yönlendirmez.
  if (PUBLIC_PATHS.has(pathname) || pathname === "/onboarding") return <>{children}</>;

  return <Check>{children}</Check>;
}

function Check({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const pending = me.data !== undefined && me.data.onboarding_completed_at === null;

  useEffect(() => {
    if (pending) router.replace("/onboarding");
  }, [pending, router]);

  // Yönlendirme yoldayken panel bir an görünüp kaybolmasın.
  if (pending) return null;
  return <>{children}</>;
}
