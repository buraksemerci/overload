"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getToken } from "@/lib/api";

/**
 * Oturum kontrolü.
 *
 * Kontrol **istemcide** yapılıyor çünkü token `localStorage`'da ve sayfalar
 * statik üretiliyor. Bu bir güvenlik sınırı DEĞİL — gerçek koruma backend'de
 * (JWT + RLS). Buradaki yönlendirme sadece kullanıcı deneyimi: oturumu
 * olmayan birine boş ekran yerine giriş sayfasını göstermek için.
 *
 * `mounted` bayrağı hidrasyon uyuşmazlığını önlüyor: sunucuda `localStorage`
 * yok, ilk render'da token okunamaz. Kontrolü mount sonrasına ertelemezsek
 * React "sunucu ve istemci farklı render etti" uyarısı veriyor.
 *
 * Bayrak `useEffect` + `setState` ile değil `useSyncExternalStore` ile
 * kuruluyor. İkisi de aynı sonucu veriyor ama ikincisi "React dışı bir
 * bilgiyi okuyorum" demenin doğru yolu: sunucu anlık görüntüsü `false`,
 * istemci anlık görüntüsü `true` ve arada fazladan bir render yok.
 */

/** Hiç değişmeyen bir kaynak: abonelik gerekmiyor. */
const NEVER = () => () => {};

/* Oturum İSTEMEYEN yollar. Parola kurtarma ve e-posta doğrulama buraya ait:
   ikisi de tanım gereği oturumu olmayan kişinin geldiği yer. Doğrulama
   bağlantısı e-postadan geliyor ve başka bir cihazda açılabiliyor. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify",
]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    if (getToken() === null) router.replace("/login");
  }, [mounted, pathname, router]);

  if (!mounted) {
    // İlk boyama: iskelet yerine boşluk. Kısa bir an için "giriş yap" gösterip
    // sonra panele atlamak, oturumu olan kullanıcı için rahatsız edici.
    return null;
  }

  if (!PUBLIC_PATHS.has(pathname) && getToken() === null) {
    return null; // yönlendirme yolda
  }

  return <>{children}</>;
}
