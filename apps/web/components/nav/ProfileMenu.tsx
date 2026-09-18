"use client";

/**
 * Profil menüsü — hesap ve çıkış.
 *
 * Dışarı tıklama ve Escape ile kapanıyor: menü açıkken sayfanın geri kalanına
 * tıklamak onu kapatmalı, aksi halde kullanıcı tekrar düğmeyi aramak zorunda.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/auth";
import { useMe } from "@/lib/queries";
import type { TONES } from "@/components/nav/items";

/* --- Profil --------------------------------------------------------------- */

export function ProfileMenu({ tone }: { tone: (typeof TONES)[keyof typeof TONES] }) {
  const me = useMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Dışarı tıklama ve Escape ile kapanma. Menü açıkken sayfanın geri kalanına
  // tıklamak onu kapatmalı; aksi halde kullanıcı tekrar düğmeyi aramak zorunda.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = me.data?.display_name?.trim() || me.data?.email || "";
  const initial = name ? name[0]!.toLocaleUpperCase("tr-TR") : "·";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Hesap menüsü"
        className="grid size-9 place-items-center rounded-full border text-sm font-semibold transition-colors"
        style={{
          // Panel üstündeyken cam gibi: dolu bir daire görselin üzerinde
          // yapıştırılmış duruyordu.
          borderColor: tone.divider,
          background: "transparent",
          color: tone.bar,
          transitionDuration: "var(--dur-micro)",
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="card-raised absolute right-0 mt-2 w-56 overflow-hidden p-1"
          style={{
            zIndex: "var(--z-dropdown)",
            animation: "reveal var(--dur-short) var(--ease-out) forwards",
          }}
        >
          {name && (
            <p className="truncate px-3 pt-2 pb-1 text-xs text-[var(--color-ink-muted)]">
              {name}
            </p>
          )}
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--color-surface-raised)]"
          >
            Hesap ayarları
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              /* Yönlendirme çıkış isteğini BEKLEMİYOR: kullanıcı "çıkış"a
                 bastıysa ekranın anında değişmesi gerekiyor. İstek arkada
                 tamamlanıyor ve sunucudaki oturum satırını siliyor. */
              void logout();
              router.replace("/login");
            }}
            className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-raised)]"
          >
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
