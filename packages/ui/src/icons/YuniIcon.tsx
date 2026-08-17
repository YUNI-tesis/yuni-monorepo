import {
  Add01Icon,
  Activity03Icon,
  AiBrain01Icon,
  ArrowLeft02Icon,
  BookOpen02Icon,
  BotIcon,
  CallEnd01Icon,
  CallIcon,
  Cancel01Icon,
  Calendar03Icon,
  Chart01Icon,
  ChevronDownIcon,
  Clock01Icon,
  Database01Icon,
  DocumentAttachmentIcon,
  Edit02Icon,
  File02Icon,
  HistoryIcon,
  InformationCircleIcon,
  Link01Icon,
  Mail01Icon,
  Mic01Icon,
  MicOff01Icon,
  MoreVerticalIcon,
  PauseIcon,
  Rocket01Icon,
  Settings01Icon,
  Share01Icon,
  SparklesIcon,
  Upload03Icon,
  UserCircleIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { SVGProps } from "react";

export const yuniIcons = {
  activity: Activity03Icon,
  add: Add01Icon,
  aiBrain: AiBrain01Icon,
  arrowLeft: ArrowLeft02Icon,
  bookOpen: BookOpen02Icon,
  bot: BotIcon,
  call: CallIcon,
  callEnd: CallEnd01Icon,
  calendar: Calendar03Icon,
  chart: Chart01Icon,
  chevronDown: ChevronDownIcon,
  clock: Clock01Icon,
  close: Cancel01Icon,
  database: Database01Icon,
  document: DocumentAttachmentIcon,
  edit: Edit02Icon,
  file: File02Icon,
  history: HistoryIcon,
  info: InformationCircleIcon,
  link: Link01Icon,
  mail: Mail01Icon,
  mic: Mic01Icon,
  micOff: MicOff01Icon,
  moreVertical: MoreVerticalIcon,
  pause: PauseIcon,
  rocket: Rocket01Icon,
  settings: Settings01Icon,
  share: Share01Icon,
  sparkles: SparklesIcon,
  upload: Upload03Icon,
  user: UserCircleIcon,
  view: ViewIcon,
  viewOff: ViewOffSlashIcon,
} satisfies Record<string, IconSvgElement>;

export type YuniIconName = keyof typeof yuniIcons;

export type YuniIconProps = Omit<SVGProps<SVGSVGElement>, "color"> & {
  name: YuniIconName;
  color?: string;
  size?: string | number;
  strokeWidth?: number;
};

export function YuniIcon({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 1.5,
  "aria-hidden": ariaHidden = true,
  focusable = false,
  ...props
}: YuniIconProps) {
  return (
    <HugeiconsIcon
      icon={yuniIcons[name]}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden={ariaHidden}
      focusable={focusable}
      {...props}
    />
  );
}
