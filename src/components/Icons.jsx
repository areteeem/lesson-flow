/**
 * Unified icon set — sharp edges, outlined, consistent 18×18 grid.
 * strokeWidth: 1.5, no rounded caps, miter joins.
 */

const ICON_DEFAULTS = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'miter', strokeLinecap: 'butt' };

function Icon({ children, className = '', size, ...rest }) {
  const props = { ...ICON_DEFAULTS, ...rest };
  if (size) { props.width = size; props.height = size; }
  return <svg className={className} {...props}>{children}</svg>;
}

// ─── Navigation ───────────────────────────────
export function BackIcon(p) {
  return <Icon {...p}><path d="M11 3L6 9l5 6" /></Icon>;
}

export function ChevronUpIcon(p) {
  return <Icon {...p}><path d="M4 11l5-5 5 5" /></Icon>;
}

export function ChevronDownIcon(p) {
  return <Icon {...p}><path d="M4 7l5 5 5-5" /></Icon>;
}

export function ChevronLeftIcon(p) {
  return <Icon {...p}><path d="M11 4L6 9l5 5" /></Icon>;
}

export function ChevronRightIcon(p) {
  return <Icon {...p}><path d="M7 4l5 5-5 5" /></Icon>;
}

// ─── Actions ──────────────────────────────────
export function PlusIcon(p) {
  return <Icon {...p}><path d="M9 3v12M3 9h12" /></Icon>;
}

export function TrashIcon(p) {
  return <Icon {...p}><path d="M3 5h12M6 5V3.5h6V5M5 5l.75 10h6.5L13 5" /><path d="M7.5 7.5v5M10.5 7.5v5" /></Icon>;
}

export function CloseIcon(p) {
  return <Icon {...p}><path d="M4 4l10 10M14 4L4 14" /></Icon>;
}

// ─── File ─────────────────────────────────────
export function SaveIcon(p) {
  return <Icon {...p}><path d="M4 2.5h9l2.5 2.5V15.5H4V2.5Z" /><path d="M6 2.5v5h6v-5" /><path d="M6 12.5h6" /></Icon>;
}

export function PlayIcon(p) {
  return <Icon {...p} fill="currentColor"><path d="M5 3l10 6-10 6V3Z" /></Icon>;
}

export function DotsVerticalIcon(p) {
  return <Icon {...p} fill="currentColor" stroke="none"><rect x="7.5" y="3" width="3" height="3" /><rect x="7.5" y="7.5" width="3" height="3" /><rect x="7.5" y="12" width="3" height="3" /></Icon>;
}

export function CopyIcon(p) {
  return <Icon {...p}><rect x="5.5" y="5.5" width="10" height="10" /><path d="M12.5 5.5V2.5h-10v10h3" /></Icon>;
}

export function SearchIcon(p) {
  return <Icon {...p}><circle cx="8" cy="8" r="4.5" /><path d="M11.5 11.5L15.5 15.5" /></Icon>;
}

export function ExportIcon(p) {
  return <Icon {...p}><path d="M9 2.5v9M5.5 8l3.5 3.5L12.5 8" /><path d="M3 12.5v3h12v-3" /></Icon>;
}

export function EditIcon(p) {
  return <Icon {...p}><path d="M2.5 15.5l1-4L12.5 2.5l3 3-9 9-4 1Z" /><path d="M10.5 4.5l3 3" /></Icon>;
}

export function RefreshIcon(p) {
  return <Icon {...p}><path d="M15 4.5V8.5H11" /><path d="M3 13.5V9.5H7" /><path d="M13.8 8.5A5 5 0 0 0 5.2 5.1" /><path d="M4.2 9.5A5 5 0 0 0 12.8 12.9" /></Icon>;
}

export function CheckIcon(p) {
  return <Icon {...p}><path d="M3.5 9l3.5 3.5L14.5 5" /></Icon>;
}

export function AlertTriangleIcon(p) {
  return <Icon {...p}><path d="M9 2.5l6.5 12h-13L9 2.5Z" /><path d="M9 6.2v3.8" /><rect x="8.2" y="11.5" width="1.6" height="1.6" fill="currentColor" stroke="none" /></Icon>;
}

export function InfoCircleIcon(p) {
  return <Icon {...p}><circle cx="9" cy="9" r="6.5" /><path d="M9 7v5" /><rect x="8.2" y="4.8" width="1.6" height="1.6" fill="currentColor" stroke="none" /></Icon>;
}

export function CircleXIcon(p) {
  return <Icon {...p}><circle cx="9" cy="9" r="6.5" /><path d="M6.5 6.5l5 5M11.5 6.5l-5 5" /></Icon>;
}

export function FolderIcon(p) {
  return <Icon {...p}><path d="M2 5V3.5h5l2 1.5h7V14.5H2V5Z" /></Icon>;
}

export function FolderOpenIcon(p) {
  return <Icon {...p}><path d="M2 5V3.5h5l2 1.5h7V7H4l-2 7.5V5Z" /><path d="M4 7h12.5l-2 7.5H2L4 7Z" /></Icon>;
}

// ─── Settings & Config ────────────────────────
export function SettingsIcon(p) {
  return (
    <Icon {...p}>
      <path d="M2 4.5h4m4 0h6" />
      <path d="M2 9h7m4 0h3" />
      <path d="M2 13.5h2m4 0h8" />
      <rect x="6" y="3" width="3" height="3" />
      <rect x="10.5" y="7.5" width="3" height="3" />
      <rect x="3.5" y="12" width="3" height="3" />
    </Icon>
  );
}

export function GearIcon(p) {
  return <Icon {...p}><path d="M9 2.75l1.12 1.55 1.9.3.63 1.82 1.72 1.03-.35 1.9.35 1.9-1.72 1.03-.63 1.82-1.9.3L9 15.25l-1.12-1.55-1.9-.3-.63-1.82-1.72-1.03.35-1.9-.35-1.9 1.72-1.03.63-1.82 1.9-.3Z" /><rect x="7" y="7" width="4" height="4" /></Icon>;
}

// ─── Layout & Views ───────────────────────────
export function GridIcon(p) {
  return <Icon {...p}><rect x="2" y="2" width="5.5" height="5.5" /><rect x="10.5" y="2" width="5.5" height="5.5" /><rect x="2" y="10.5" width="5.5" height="5.5" /><rect x="10.5" y="10.5" width="5.5" height="5.5" /></Icon>;
}

export function DslIcon(p) {
  return <Icon {...p}><path d="M5 4L2 9l3 5" /><path d="M13 4l3 5-3 5" /><path d="M10 2.5L8 15.5" /></Icon>;
}

export function PreviewIcon(p) {
  return <Icon {...p}><path d="M2 9s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5Z" /><rect x="7" y="7" width="4" height="4" /></Icon>;
}

export function BuilderIcon(p) {
  return <Icon {...p}><rect x="3" y="3" width="5" height="5" /><rect x="10" y="3" width="5" height="5" /><rect x="3" y="10" width="5" height="5" /><rect x="10" y="10" width="5" height="5" /></Icon>;
}

export function FullscreenIcon(p) {
  return <Icon {...p}><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" /></Icon>;
}

export function ExitFullscreenIcon(p) {
  return <Icon {...p}><path d="M6 2v4H2M12 2v4h4M16 12h-4v4M2 12h4v4" /></Icon>;
}

export function HamburgerIcon(p) {
  return <Icon {...p}><path d="M3 5h12M3 9h12M3 13h12" /></Icon>;
}

// ─── People ───────────────────────────────────
export function PersonIcon(p) {
  return <Icon {...p}><rect x="6" y="3" width="6" height="6" rx="0" /><path d="M3 16c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" /></Icon>;
}

// ─── Editor actions ───────────────────────────
export function DragHandleIcon(p) {
  return (
    <Icon {...p}>
      <rect x="5" y="3" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="5" y="8" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="5" y="13" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="11" y="3" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="11" y="8" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="11" y="13" width="2" height="2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function TemplateIcon(p) {
  return <Icon {...p}><rect x="2" y="2" width="6" height="6" /><rect x="10" y="2" width="6" height="6" /><rect x="2" y="10" width="6" height="6" /><rect x="10" y="10" width="6" height="6" /></Icon>;
}

export function FontIcon(p) {
  return <Icon {...p}><path d="M4 14L9 3l5 11" /><path d="M6 10h6" /></Icon>;
}

export function SparkIcon(p) {
  return <Icon {...p}><path d="M9 2.5l1.3 3.2L13.5 7 10.3 8.3 9 11.5 7.7 8.3 4.5 7l3.2-1.3L9 2.5Z" /><path d="M14 11l.8 1.9L16.7 13l-1.9.8L14 15.7l-.8-1.9-1.9-.8 1.9-.1L14 11Z" /><path d="M4 11.5l.6 1.4 1.4.1-1.4.6L4 15l-.6-1.4-1.4-.6 1.4-.1.6-1.4Z" /></Icon>;
}

export function PrintIcon(p) {
  return <Icon {...p}><path d="M5 6V2.5h8V6" /><rect x="3" y="6" width="12" height="6" /><path d="M5 11.5h8V15.5H5V11.5Z" /><path d="M12.5 8.5h.01" /></Icon>;
}

export function CalendarIcon(p) {
  return <Icon {...p}><rect x="2" y="3.5" width="14" height="12" /><path d="M2 7.5h14M5 2v3M13 2v3" /></Icon>;
}

export function ClockIcon(p) {
  return <Icon {...p}><circle cx="9" cy="9" r="6.5" /><path d="M9 5.5v4l2.5 1.5" /></Icon>;
}

export function QuestionIcon(p) {
  return <Icon {...p}><path d="M6.5 6.5C6.5 5 7.5 4 9 4s2.5 1 2.5 2.5c0 1.5-1.5 2-2.5 2.5V11" /><rect x="8.25" y="12.5" width="1.5" height="1.5" fill="currentColor" stroke="none" /></Icon>;
}

// ─── Import / IO ──────────────────────────────
export function ClipboardIcon(p) {
  return <Icon {...p}><path d="M6 3.5h-.5a1 1 0 00-1 1V15h9V4.5a1 1 0 00-1-1H12" /><rect x="6.5" y="2" width="5" height="2.5" /></Icon>;
}

export function UploadIcon(p) {
  return <Icon {...p}><path d="M9 3v9M5 6l4-3 4 3" /><path d="M3 12v3h12v-3" /></Icon>;
}

export function KeyIcon(p) {
  return <Icon {...p}><circle cx="6" cy="7" r="3" /><path d="M9 7h6.5M13 7v2.5" /></Icon>;
}

export function CoinIcon(p) {
  return <Icon {...p}><circle cx="9" cy="9" r="6.5" /><path d="M9 5v8M7 6.5h3c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5H7.5h3c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5H7" /></Icon>;
}

export function ShieldIcon(p) {
  return <Icon {...p}><path d="M9 2L3 5v4c0 4.5 3 7 6 8 3-1 6-3.5 6-8V5L9 2Z" /></Icon>;
}

export function WandIcon(p) {
  return <Icon {...p}><path d="M3 15L12 6l1.5 1.5L4.5 16.5" /><path d="M12 3l1 1M15 6l1 1M10.5 5.5l1-2M14.5 4.5l2-1" /></Icon>;
}

export function HelpCircleIcon(p) {
  return <Icon {...p}><circle cx="9" cy="9" r="6.5" /><path d="M7 7.5C7 6.5 7.8 5.5 9 5.5s2 1 2 2c0 1.2-1.2 1.5-2 2V11" /><rect x="8.25" y="12" width="1.5" height="1.5" fill="currentColor" stroke="none" /></Icon>;
}

export function BrainIcon(p) {
  return <Icon {...p}><path d="M9 2v14M9 2C7 2 5 3.5 5 5.5c0 1-.5 2-1.5 2.5C2.5 8.5 3 11 5 12c1 .5 2 2 2 3.5V16" /><path d="M9 2c2 0 4 1.5 4 3.5 0 1 .5 2 1.5 2.5C15.5 8.5 15 11 13 12c-1 .5-2 2-2 3.5V16" /></Icon>;
}

export function UsersIcon(p) {
  return <Icon {...p}><circle cx="7" cy="6" r="2.5" /><path d="M2 14c0-2.5 2-4 5-4s5 1.5 5 4" /><circle cx="13" cy="5.5" r="2" /><path d="M13 10c2 0 3.5 1 3.5 3" /></Icon>;
}

export function EyeOffIcon(p) {
  return <Icon {...p}><path d="M3 3l12 12M6.5 6.5C5 7.5 3.5 9 3.5 9s2.5 5 5.5 5c1 0 2-.4 2.8-1" /><path d="M14.5 9s-2.5-5-5.5-5c-.7 0-1.4.2-2 .5" /></Icon>;
}

export function ToggleOnIcon(p) {
  return <Icon {...p}><rect x="2" y="5.5" width="14" height="7" rx="3.5" /><circle cx="12.5" cy="9" r="2.5" fill="currentColor" /></Icon>;
}

export function ToggleOffIcon(p) {
  return <Icon {...p}><rect x="2" y="5.5" width="14" height="7" rx="3.5" /><circle cx="5.5" cy="9" r="2.5" /></Icon>;
}

// ─── Slides ───────────────────────────────────
export function SlideIcon(p) {
  return <Icon {...p}><rect x="2" y="3" width="14" height="12" /><path d="M2 7h14" /></Icon>;
}

export function GroupIcon(p) {
  return <Icon {...p}><rect x="2" y="2" width="6" height="6" /><rect x="10" y="2" width="6" height="6" /><rect x="2" y="10" width="6" height="6" /><rect x="10" y="10" width="6" height="6" /></Icon>;
}

// ─── Task type icons (per-type, not per-kind) ─
export function TaskIconMultipleChoice(p) {
  return <Icon {...p}><rect x="3" y="3" width="3" height="3" /><path d="M8 4.5h7" /><rect x="3" y="7.5" width="3" height="3" /><path d="M8 9h7" /><rect x="3" y="12" width="3" height="3" /><path d="M8 13.5h7" /><path d="M4 4l1 1 2-2" /></Icon>;
}

export function TaskIconTrueFalse(p) {
  return <Icon {...p}><path d="M3 3l3 3 5-6" /><path d="M3 13l4 4M7 13l-4 4" /></Icon>;
}

export function TaskIconFillTyping(p) {
  return <Icon {...p}><rect x="2" y="5" width="14" height="8" /><path d="M5 9h3M10 9h1" /><path d="M9 7v4" /></Icon>;
}

export function TaskIconShortAnswer(p) {
  return <Icon {...p}><rect x="2" y="5" width="14" height="8" /><path d="M4 9h6" /><path d="M4 11h3" /></Icon>;
}

export function TaskIconLongAnswer(p) {
  return <Icon {...p}><rect x="2" y="2" width="14" height="14" /><path d="M5 5h8M5 8h8M5 11h5" /></Icon>;
}

export function TaskIconDragToBlank(p) {
  return <Icon {...p}><path d="M2 6h4M10 6h6M2 12h6M12 12h4" /><rect x="5" y="4" width="4" height="4" strokeDasharray="2 1" /><rect x="9" y="10" width="4" height="4" strokeDasharray="2 1" /></Icon>;
}

export function TaskIconMatch(p) {
  return <Icon {...p}><rect x="2" y="3" width="5" height="3" /><rect x="2" y="8" width="5" height="3" /><rect x="2" y="13" width="5" height="3" /><rect x="11" y="3" width="5" height="3" /><rect x="11" y="8" width="5" height="3" /><rect x="11" y="13" width="5" height="3" /><path d="M7 4.5h4M7 9.5l4 5M7 14.5l4-5" /></Icon>;
}

export function TaskIconCards(p) {
  return <Icon {...p}><rect x="3" y="4" width="10" height="12" /><rect x="5" y="2" width="10" height="12" /><path d="M7 8h6M7 11h3" /></Icon>;
}

export function TaskIconDragDrop(p) {
  return <Icon {...p}><rect x="2" y="2" width="5" height="5" /><rect x="2" y="11" width="5" height="5" /><rect x="11" y="2" width="5" height="5" /><path d="M11 11h5v5" strokeDasharray="2 1" /><path d="M9 7l-2 2" /></Icon>;
}

export function TaskIconOrder(p) {
  return <Icon {...p}><path d="M6 4h10M6 9h10M6 14h10" /><path d="M2 4h2M2 9h2M2 14h2" /><path d="M15 2l2 2-2 2M15 12l2 2-2 2" /></Icon>;
}

export function TaskIconCategorize(p) {
  return <Icon {...p}><rect x="1" y="1" width="7" height="7" /><rect x="10" y="1" width="7" height="7" /><path d="M4.5 12h2M11.5 12h2M7 14l-3 2M11 14l3 2" /></Icon>;
}

export function TaskIconReadingHighlight(p) {
  return <Icon {...p}><path d="M3 4h12M3 7h12M3 10h12M3 13h8" /><rect x="6" y="6" width="6" height="2" fill="currentColor" opacity="0.2" /></Icon>;
}

export function TaskIconWordHide(p) {
  return <Icon {...p}><path d="M3 4h12M3 7h12M3 10h12M3 13h8" /><rect x="4" y="6" width="4" height="2" fill="currentColor" opacity="0.35" /><rect x="10" y="9" width="3" height="2" fill="currentColor" opacity="0.35" /><path d="M9 2l-1 2 1 2" strokeDasharray="1 1" /></Icon>;
}

export function TaskIconRandomWheel(p) {
  return <Icon {...p}><rect x="3" y="3" width="12" height="12" /><path d="M9 3v12M3 9h12M3 3l12 12M15 3L3 15" /></Icon>;
}

export function TaskIconYouTube(p) {
  return <Icon {...p}><rect x="2" y="4" width="14" height="10" /><path d="M7.5 7v4l4-2Z" fill="currentColor" /></Icon>;
}

export function TaskIconScale(p) {
  return <Icon {...p}><path d="M2 14h14" /><path d="M3 14V9M6 14V7M9 14V5M12 14V8M15 14V6" /></Icon>;
}

export function TaskIconDialogue(p) {
  return <Icon {...p}><rect x="2" y="2" width="9" height="5" /><rect x="7" y="9" width="9" height="5" /><path d="M5 7v3h2" /><path d="M13 14v2h-2" /></Icon>;
}

export function TaskIconTable(p) {
  return <Icon {...p}><rect x="2" y="2" width="14" height="14" /><path d="M2 6h14M2 10h14M7 2v14M12 2v14" /></Icon>;
}

export function TaskIconImage(p) {
  return <Icon {...p}><rect x="2" y="3" width="14" height="12" /><path d="M2 12l4-4 3 3 2-2 5 5" /><rect x="11" y="5" width="3" height="3" /></Icon>;
}

export function TaskIconAudio(p) {
  return <Icon {...p}><path d="M3 7h3l4-4v12l-4-4H3V7Z" /><path d="M13 6c1 1 1.5 2 1.5 3s-.5 2-1.5 3" /><path d="M15 4c2 2 2.5 3.5 2.5 5s-.5 3-2.5 5" /></Icon>;
}

export function TaskIconPuzzle(p) {
  return <Icon {...p}><rect x="2" y="2" width="6" height="6" /><rect x="10" y="2" width="6" height="6" /><rect x="2" y="10" width="6" height="6" /><rect x="10" y="10" width="6" height="6" /><path d="M8 5h2M5 8v2M13 8v2M8 13h2" /></Icon>;
}

export function TaskIconBranch(p) {
  return <Icon {...p}><path d="M4 2v14" /><path d="M4 9h5l4-5" /><path d="M4 9h5l4 5" /></Icon>;
}

export function TaskIconSentenceBuilder(p) {
  return <Icon {...p}><rect x="1" y="7" width="4" height="4" /><rect x="7" y="7" width="4" height="4" /><rect x="13" y="7" width="4" height="4" /><path d="M5 9h2M11 9h2" /></Icon>;
}

export function TaskIconErrorCorrection(p) {
  return <Icon {...p}><path d="M3 5h12M3 9h12M3 13h8" /><path d="M12 11l4 4M16 11l-4 4" /></Icon>;
}

export function TaskIconMemory(p) {
  return <Icon {...p}><rect x="3" y="3" width="12" height="12" /><path d="M9 6v2M7 9h4" /><path d="M6 12h6" /></Icon>;
}

export function TaskIconChecklist(p) {
  return <Icon {...p}><rect x="2" y="2" width="14" height="14" /><path d="M5 6l2 2 3-3" /><path d="M5 11l2 2 3-3" /></Icon>;
}

export function TaskIconHighlightMistake(p) {
  return <Icon {...p}><path d="M3 5h12M3 9h12M3 13h8" /><rect x="5" y="8" width="4" height="2" fill="currentColor" opacity="0.3" /><path d="M14 8l2 2-2 2" /></Icon>;
}

export function TaskIconWordFamily(p) {
  return <Icon {...p}><path d="M9 2v5" /><path d="M9 7l-5 4" /><path d="M9 7l5 4" /><path d="M9 7v5" /><rect x="7" y="1" width="4" height="2" /><rect x="2" y="11" width="4" height="2" /><rect x="7" y="12" width="4" height="2" /><rect x="12" y="11" width="4" height="2" /></Icon>;
}

// ─── Kind icons (for AddTaskModal MiniTaskTypeIcon) ───
export function KindChoiceIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><rect x="2" y="2" width="3" height="3" /><path d="M7 3.5h7" /><rect x="2" y="6.5" width="3" height="3" /><path d="M7 8h7" /><rect x="2" y="11" width="3" height="3" /><path d="M7 12.5h7" /></Icon>;
}

export function KindTextIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h10M2 13.5h6" /></Icon>;
}

export function KindPairsIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><rect x="1" y="2" width="5" height="5" /><rect x="10" y="2" width="5" height="5" /><rect x="1" y="9" width="5" height="5" /><rect x="10" y="9" width="5" height="5" /></Icon>;
}

export function KindCollectionIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="4" /><rect x="9" y="1" width="6" height="4" /><rect x="1" y="7" width="6" height="4" /><rect x="9" y="7" width="6" height="4" /><rect x="5" y="11" width="6" height="4" /></Icon>;
}

export function KindGridIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><rect x="1" y="1" width="4" height="4" /><rect x="6" y="1" width="4" height="4" /><rect x="11" y="1" width="4" height="4" /><rect x="1" y="6" width="4" height="4" /><rect x="6" y="6" width="4" height="4" /><rect x="11" y="6" width="4" height="4" /></Icon>;
}

export function KindMediaIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" /><path d="M6 7l2 2 3-3" /></Icon>;
}

export function KindBranchIcon(p) {
  return <Icon {...p} width={16} height={16} viewBox="0 0 16 16"><path d="M4 2v12M4 8h4l4-4M4 8h4l4 4" /></Icon>;
}

// Task type → icon component mapping
const TASK_TYPE_ICON_MAP = {
  multiple_choice: TaskIconMultipleChoice,
  multi_select: TaskIconMultipleChoice,
  true_false: TaskIconTrueFalse,
  yes_no: TaskIconTrueFalse,
  either_or: TaskIconTrueFalse,
  fill_typing: TaskIconFillTyping,
  short_answer: TaskIconShortAnswer,
  long_answer: TaskIconLongAnswer,
  drag_to_blank: TaskIconDragToBlank,
  type_in_blank: TaskIconFillTyping,
  match: TaskIconMatch,
  cards: TaskIconCards,
  drag_drop: TaskIconDragDrop,
  drag_match: TaskIconDragDrop,
  order: TaskIconOrder,
  categorize: TaskIconCategorize,
  categorize_grammar: TaskIconCategorize,
  reading_highlight: TaskIconReadingHighlight,
  highlight_glossary: TaskIconReadingHighlight,
  highlight_differences: TaskIconReadingHighlight,
  random_wheel: TaskIconRandomWheel,
  audio_transcription: TaskIconAudio,
  video_questions: TaskIconYouTube,
  pronunciation_shadowing: TaskIconAudio,
  image_labeling: TaskIconImage,
  hotspot_selection: TaskIconImage,
  image_compare_spot: TaskIconImage,
  map_geography_label: TaskIconImage,
  timeline_order: TaskIconOrder,
  sentence_builder: TaskIconSentenceBuilder,
  story_reconstruction: TaskIconOrder,
  dialogue_completion: TaskIconDialogue,
  dialogue_fill: TaskIconDialogue,
  dialogue_reconstruct: TaskIconDialogue,
  error_correction: TaskIconErrorCorrection,
  highlight_mistake: TaskIconHighlightMistake,
  select_and_correct: TaskIconHighlightMistake,
  opinion_survey: TaskIconScale,
  scale: TaskIconScale,
  memory_recall: TaskIconMemory,
  flash_response: TaskIconMemory,
  compare_contrast_table: TaskIconTable,
  fill_table_matrix: TaskIconTable,
  table_reveal: TaskIconTable,
  table_drag: TaskIconTable,
  fill_grid: TaskIconTable,
  matching_pairs_categories: TaskIconMatch,
  emoji_symbol_match: TaskIconMatch,
  choose_and_explain: TaskIconBranch,
  scenario_decision: TaskIconBranch,
  conditional_branch_questions: TaskIconBranch,
  justify_order: TaskIconBranch,
  keyword_expand: TaskIconSentenceBuilder,
  word_family_builder: TaskIconWordFamily,
  peer_review_checklist: TaskIconChecklist,
  puzzle_jigsaw: TaskIconPuzzle,
  youtube: TaskIconYouTube,
  word_hide_reveal: TaskIconWordHide,
  word_hide_drag: TaskIconWordHide,
  word_hide_type: TaskIconWordHide,
};

export function TaskTypeIcon({ taskType, ...props }) {
  const Comp = TASK_TYPE_ICON_MAP[taskType];
  if (Comp) return <Comp {...props} />;
  return <KindTextIcon {...props} />;
}
