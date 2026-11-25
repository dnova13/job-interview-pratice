// 버튼용 SVG 아이콘 모음

type IconProps = { size?: number }

const base = (size = 24) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const PrevIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
    <line x1="5" y1="19" x2="5" y2="5" />
  </svg>
)

export const NextIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
)

export const RecordIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />
  </svg>
)

export const StopSquareIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
)

export const PauseIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
)

export const PlayIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none" />
  </svg>
)

export const PlusIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export const GearIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export const FolderIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

export const SaveIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
)

export const CheckIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export const CloseIcon =({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/** 무작위 순서 */
export const ShuffleIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
)

/** 순서대로 */
export const OrderedIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
)

export const StarIcon = ({ size, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

/** 잘 안 외워짐 표시 */
export const FlagIcon = ({ size, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill={filled ? 'currentColor' : 'none'} />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
)

/** 메모 (접힌 모서리가 있는 메모지) */
export const MemoIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
    <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
    <line x1="7" y1="8" x2="17" y2="8" />
    <line x1="7" y1="12" x2="13" y2="12" />
  </svg>
)

/** 수정 (연필) */
export const EditIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
)

export const ListIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" fill="currentColor" />
    <circle cx="4" cy="12" r="1" fill="currentColor" />
    <circle cx="4" cy="18" r="1" fill="currentColor" />
  </svg>
)

export const BackIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export const RestartIcon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
)
