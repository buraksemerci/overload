"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
 */

const PUBLIC_PATHS = new Set(["/login"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
