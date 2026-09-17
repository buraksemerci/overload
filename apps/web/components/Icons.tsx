/**
 * İkon seti — elle yazılmış, bağımlılık yok.
 *
 * Bir ikon kütüphanesi eklemek yerine on üç ikonu elle çizmenin sebebi
 * tutarlılık: hepsi 24x24 kutuda, 1.5 kalınlıkta, yuvarlak uçlu ve
 * `currentColor` ile boyanıyor. Hazır setlerde kalınlık ve optik ağırlık
 * ikondan ikona oynuyor; kenar çubuğunda yan yana dizildiklerinde bu fark
 * hemen göze çarpıyor.
 *
 * Dolgu yok, yalnızca kontur. Dolgulu ikonlar açık zeminde ağır duruyor ve
 * volt dışında ikinci bir görsel ağırlık merkezi yaratıyor.
 */

type IconProps = { className?: string };

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconPanel({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />
    </svg>
  );
}

export function IconDumbbell({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 8.5v7M3.5 10v4M17.5 8.5v7M20.5 10v4M6.5 12h11" />
    </svg>
  );
}

export function IconProgram({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9.5h8M8 14.5h5" />
    </svg>
  );
}

export function IconLibrary({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18a1 1 0 0 1 1 1v13.5a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18z" />
      <path d="M5 16.5h14" />
    </svg>
  );
}

export function IconHistory({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 5v4h4M12 8v4l3 1.8" />
    </svg>
  );
}

export function IconNutrition({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 7.5c0-2 1.6-3.5 3.6-3.5C15.6 6 14 7.5 12 7.5z" />
      <path d="M12 7.5c-3.3 0-6 2.4-6 5.9C6 17 8.7 20 12 20s6-3 6-6.6c0-3.5-2.7-5.9-6-5.9z" />
    </svg>
  );
}

export function IconSupplement({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" />
      <path d="M12 8.5v7" />
    </svg>
  );
}

export function IconProgress({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 19h16" />
      <path d="M5 15l4.5-5 3.5 3L19 6" />
    </svg>
  );
}

export function IconBody({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7.5v6M12 13.5 9 20M12 13.5 15 20M7.5 10.5 12 9l4.5 1.5" />
    </svg>
  );
}

export function IconScale({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="M12 9v2M9.2 9.6 12 11" />
    </svg>
  );
}

export function IconAche({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z" />
    </svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 12.5c0 3.9-3.6 7-8 7a9 9 0 0 1-2.5-.35L5 20.5l1.2-3.2A6.6 6.6 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7z" />
    </svg>
  );
}

export function IconReport({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5M9.5 13h5M9.5 16.5h3" />
    </svg>
  );
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
