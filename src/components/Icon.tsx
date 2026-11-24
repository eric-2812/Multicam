import type { Link } from '../types'

const PATHS: Record<string, string> = {
  usb: 'M12 2v14M12 2l-3 3M12 2l3 3M8 9v3l4 2M16 7v4l-4 2M10 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  wifi: 'M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01',
  bluetooth: 'M7 7l10 10-5 5V2l5 5L7 17',
  screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
  builtin: 'M4 5h16v11H4zM2 19h20',
  network: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  cam: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  phone: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
  flash: 'M13 2L4 14h7l-1 8 9-12h-7z',
  flip: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 12h8',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  focus: 'M3 5h18v11H3zM6 19h3M10.5 19h3M15 19h3',
  switch: 'M3 6h8v6H3zM13 6h8v6h-8zM6 17h12M9 15l-3 2 3 2M15 15l3 2-3 2',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  folder: 'M3 6h6l2 2h10v11H3z',
  marker: 'M6 3h12v18l-6-4-6 4z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v4h-4',
  chevron: 'M8 10l4 4 4-4',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  wave: 'M2 12h2l2-6 3 12 3-9 2 6 2-3h6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  exit: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
}

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}

export const LINK_LABEL: Record<Link, string> = {
  usb: 'USB',
  wifi: 'Wi-Fi',
  bluetooth: 'Bluetooth',
  screen: 'Screen',
  builtin: 'Built-in',
  network: 'Network',
}

export function LinkBadge({ link }: { link: Link }) {
  return (
    <span className={`link link-${link}`} title={LINK_LABEL[link]}>
      <Icon name={link} size={12} />
      {LINK_LABEL[link]}
    </span>
  )
}

export function Battery({ level }: { level: number }) {
  const l = Math.round(level)
  const tone = l < 15 ? 'bad' : l < 35 ? 'warn' : 'ok'
  return (
    <span className={`battery battery-${tone}`} title={`Battery ${l}%`}>
      <span className="battery-body">
        <span className="battery-fill" style={{ width: `${Math.max(4, l)}%` }} />
      </span>
      {l}%
    </span>
  )
}

export function Signal({ bars }: { bars: number }) {
  return (
    <span className="signal" title={`Signal ${bars}/4`}>
      {[1, 2, 3, 4].map((b) => (
        <span key={b} className={b <= bars ? 'on' : ''} style={{ height: 3 + b * 2.5 }} />
      ))}
    </span>
  )
}
