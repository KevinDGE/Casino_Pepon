/** Íconos SVG en línea (sin dependencias externas). */
const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  history: 'M12 8v4l3 2m6-2a9 9 0 1 1-3-6.7M21 3v5h-5',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  help: 'M9.1 9a3 3 0 1 1 4.3 2.7c-.8.4-1.4 1.1-1.4 2v.3M12 17.5h.01M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  refresh: 'M20 11a8 8 0 0 0-14.8-4M4 4v4h4m-4 5a8 8 0 0 0 14.8 4M20 20v-4h-4',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  sound: 'M4 9v6h4l5 4V5L8 9zm12 0a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9zm12 1 5 5m0-5-5 5',
  play: 'M7 4v16l13-8z',
  chevron: 'M9 6l6 6-6 6',
  info: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-11v6m0-9.5h.01',
  cards: 'M7 3h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm11 4 2 .5a2 2 0 0 1 1.4 2.4l-2.8 10.6a2 2 0 0 1-2.4 1.4L12 21',
  wheel: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-6a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-14v6m0 8v6M2 12h6m8 0h6',
  spade: 'M12 3c3 4 8 6.5 8 10.5A4 4 0 0 1 13 16l1 5h-4l1-5a4 4 0 0 1-7-2.5C4 9.5 9 7 12 3z',
  check: 'M5 12.5 10 17l9-10',
  x: 'M7 7l10 10M17 7 7 17',
  dot: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  pause: 'M8 5v14m8-14v14',
  keyboard: 'M3 6h18v12H3zm4 3h.01M11 9h.01M15 9h.01M7 13h10',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zm0 1H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4',
};

export function Icon({ name, size = 22, title }: { name: keyof typeof PATHS | string; size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name] ?? PATHS.dot} />
    </svg>
  );
}
