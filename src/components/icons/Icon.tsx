interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconChevronLeft({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function IconDots({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

export function IconClock({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

export function IconDroplet({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 2.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z" />
    </svg>
  );
}

export function IconTimer({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <line x1="10" y1="2" x2="14" y2="2" />
      <circle cx="12" cy="14" r="8" />
      <line x1="12" y1="14" x2="12" y2="10" />
    </svg>
  );
}

export function IconCheck({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconAlert({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 3 2 20h20L12 3Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconFlag({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M5 22V4c4-2 8 2 12 0v10c-4 2-8-2-12 0" />
      <line x1="5" y1="22" x2="5" y2="14" />
    </svg>
  );
}

export function IconChevronsRight({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="7 7 12 12 7 17" />
      <polyline points="13 7 18 12 13 17" />
    </svg>
  );
}

export function IconPause({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </svg>
  );
}

export function IconPlay({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polygon points="7 5 19 12 7 19 7 5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconScale({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 3v3" />
      <path d="M5 6h14l-3 7H8L5 6Z" />
      <path d="M8 20h8" />
      <path d="M12 13v7" />
    </svg>
  );
}

export function IconStop({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
