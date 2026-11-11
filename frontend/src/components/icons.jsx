/** Small stroke icon set (lucide-style paths) used across the app. */

function Icon({ size = 16, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const FilterIcon = (p) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8z" />
  </Icon>
);
export const RefreshIcon = (p) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </Icon>
);
export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const SendIcon = (p) => (
  <Icon {...p}>
    <path d="M22 2 11 13" />
    <path d="m22 2-7 20-4-9-9-4z" />
  </Icon>
);
export const StarIcon = ({ filled, ...p }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
  </Icon>
);
export const ChevronDownIcon = (p) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const ArrowLeftIcon = (p) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Icon>
);
export const PaperclipIcon = (p) => (
  <Icon {...p}>
    <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
  </Icon>
);
export const UploadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 15V3" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 21h14" />
  </Icon>
);
export const CalendarIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18" />
  </Icon>
);
export const XIcon = (p) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const LogoutIcon = (p) => (
  <Icon {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Icon>
);
export const QueueIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <rect x="3" y="10" width="18" height="4" rx="1" />
    <rect x="3" y="16" width="18" height="4" rx="1" />
  </Icon>
);
export const ExternalIcon = (p) => (
  <Icon {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </Icon>
);

/* editor toolbar */
export const UndoIcon = (p) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Icon>
);
export const RedoIcon = (p) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </Icon>
);
export const TextSizeIcon = (p) => (
  <Icon {...p}>
    <path d="M3 7V5h10v2M8 5v14M6 19h4" />
    <path d="M14 12v-1h7v1M17.5 11v8M16 19h3" />
  </Icon>
);
export const BoldIcon = (p) => (
  <Icon {...p}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </Icon>
);
export const ItalicIcon = (p) => (
  <Icon {...p}>
    <path d="M14 5h-4M14 19h-4M14 5l-4 14" />
  </Icon>
);
export const UnderlineIcon = (p) => (
  <Icon {...p}>
    <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />
  </Icon>
);
export const AlignCenterIcon = (p) => (
  <Icon {...p}>
    <path d="M4 6h16M7 12h10M5 18h14" />
  </Icon>
);
export const AlignLeftIcon = (p) => (
  <Icon {...p}>
    <path d="M4 4v16M8 8h12M8 13h8M8 18h10" />
  </Icon>
);
export const OrderedListIcon = (p) => (
  <Icon {...p}>
    <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </Icon>
);
export const BulletListIcon = (p) => (
  <Icon {...p}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </Icon>
);
export const IndentIcon = (p) => (
  <Icon {...p}>
    <path d="m3 8 4 4-4 4M21 6H11M21 12H11M21 18H11" />
  </Icon>
);
export const OutdentIcon = (p) => (
  <Icon {...p}>
    <path d="m7 8-4 4 4 4M21 6H11M21 12H11M21 18H11" />
  </Icon>
);
export const QuoteIcon = (p) => (
  <Icon {...p}>
    <path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 3-1 5-4 5zM14 21c3 0 7-1 7-8V5h-7v7h4c0 3-1 5-4 5z" />
  </Icon>
);
export const StrikeIcon = (p) => (
  <Icon {...p}>
    <path d="M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />
  </Icon>
);
export const UpDownIcon = (p) => (
  <Icon {...p}>
    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
  </Icon>
);

export function GoogleIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function SlackLogo({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
      <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
      <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
      <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  );
}
