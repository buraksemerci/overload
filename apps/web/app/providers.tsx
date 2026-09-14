"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Uygulama geneli sağlayıcılar.
 *
 * `QueryClient` `useState` içinde kuruluyor, modül seviyesinde DEĞİL. Modül
 * seviyesinde tek bir istemci, sunucu tarafında render edilen farklı
 * kullanıcıların önbelleğini paylaştırırdı — bir kullanıcının verisi bir
 * başkasına sızabilirdi.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Salonda bağlantı zayıf; her odak değişiminde yeniden istek atmak
            // hem veri harcıyor hem de kullanıcı arayüzünü titretiyor.
            refetchOnWindowFocus: false,
            // 30 sn: aynı ekranlar arasında gidip gelirken tekrar istek atılmıyor,
            // ama veri de bayatlamıyor.
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // 4xx'te tekrar denemek anlamsız — istek yanlış, ağ değil.
              const status = (error as { status?: number }).status;
              if (status !== undefined && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
