"use client";

/**
 * Telefon çekmecesi — aynı gezinme, dokunmatik için.
 *
 * Tasarım masaüstü öncelikli ama telefonda GEZİNİLEMEZ olmak tasarım tercihi
 * değil, işlev kaybı. Açıkken odak çekmecenin içinde kalıyor.
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Photo } from "@/components/Photo";
import { GROUPS, PANEL, type Href, type NavItem } from "@/components/nav/items";

/* --- Telefon çekmecesi ---------------------------------------------------- */

export function Drawer({
  isActive,
  onClose,
}: {
  isActive: (href: Href) => boolean;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    /* Odak çekmecenin İÇİNE alınıyor ve Tab dışarı kaçmıyor: açık bir
       çekmecenin arkasındaki bağlantılara sekmek, ekran okuyucu kullanan
       kişiyi görünmeyen bir menüde dolaştırıyordu. Kapanınca odak çekmeceyi
       açan düğmeye dönüyor. */
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("a,button");
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panel.current?.querySelectorAll<HTMLElement>("a,button");
      if (!focusable || focusable.length === 0) return;
      const start = focusable.item(0);
      const end = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="md:hidden" style={{ zIndex: "var(--z-modal)" }}>
      <button
        type="button"
        aria-label="Menüyü kapat"
        onClick={onClose}
        className="fixed inset-0 bg-[oklch(21%_0.014_115_/_0.3)]"
        style={{ zIndex: "var(--z-modal)" }}
      />
      <nav
        ref={panel}
        aria-label="Ana gezinme"
        className="scroll-thin fixed inset-y-0 left-0 flex w-[19rem] flex-col gap-6 overflow-y-auto bg-[var(--color-ground)] px-4 py-6"
        style={{
          zIndex: "var(--z-modal)",
          animation: "reveal var(--dur-short) var(--ease-out) forwards",
        }}
      >
        <Link href="/" onClick={onClose} className="display px-2 text-lg tracking-tight">
          overload
        </Link>

        <DrawerLink item={PANEL} active={isActive(PANEL.href)} onClose={onClose} />

        {GROUPS.map((group) => (
          <div key={group.title}>
            {/* Telefonda fotoğraf grup başlığı olarak: kısa bir şerit, dikey
                kart ekranın yarısını yiyordu. */}
            <Photo slug={group.photo} ratio="21 / 9" scrim sizes="19rem">
              <div className="flex size-full items-end p-3">
                <p className="display text-md" style={{ color: "oklch(99% 0 0)" }}>
                  {group.title}
                </p>
              </div>
            </Photo>
            <ul className="mt-2 flex flex-col gap-px">
              {group.items.map((item) => (
                <li key={String(item.href)}>
                  <DrawerLink item={item} active={isActive(item.href)} onClose={onClose} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function DrawerLink({
  item,
  active,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
}) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-[var(--color-surface-raised)] font-medium text-[var(--color-ink)]"
          : "text-[var(--color-ink-muted)]"
      }`}
      style={{ transitionDuration: "var(--dur-micro)" }}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
