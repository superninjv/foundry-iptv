/**
 * Stable icon re-exports from lucide-react.
 * All icons default to size=24, strokeWidth=2, and pass through className + aria props.
 * Swap the underlying library here without touching call sites.
 */

import type { LucideProps } from 'lucide-react';
import {
  Tv,
  CalendarDays,
  Film,
  MonitorPlay,
  Search,
  LayoutGrid,
  Grid3x3,
  List,
  Settings,
  Bell,
  PlayCircle,
  UserCircle2,
  ShieldCheck,
  Play,
  Pause,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  X,
  Plus,
  Pencil,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Heart,
} from 'lucide-react';

type IconProps = Omit<LucideProps, 'size' | 'strokeWidth'> & {
  size?: number;
  strokeWidth?: number;
};

function makeIcon(Component: React.ComponentType<LucideProps>, displayName: string) {
  function Icon({ size = 24, strokeWidth = 2, ...props }: IconProps) {
    return <Component size={size} strokeWidth={strokeWidth} {...props} />;
  }
  Icon.displayName = displayName;
  return Icon;
}

// Nav icons
export const NavLiveIcon = makeIcon(Tv, 'NavLiveIcon');
export const NavGuideIcon = makeIcon(CalendarDays, 'NavGuideIcon');
export const NavVodIcon = makeIcon(Film, 'NavVodIcon');
export const NavSeriesIcon = makeIcon(MonitorPlay, 'NavSeriesIcon');
export const NavSearchIcon = makeIcon(Search, 'NavSearchIcon');
export const NavDecksIcon = makeIcon(LayoutGrid, 'NavDecksIcon');
export const NavMultiviewIcon = makeIcon(Grid3x3, 'NavMultiviewIcon');
export const NavListsIcon = makeIcon(List, 'NavListsIcon');
export const NavSettingsIcon = makeIcon(Settings, 'NavSettingsIcon');
export const NavNotificationsIcon = makeIcon(Bell, 'NavNotificationsIcon');
export const NavNowPlayingIcon = makeIcon(PlayCircle, 'NavNowPlayingIcon');
export const NavUserMenuIcon = makeIcon(UserCircle2, 'NavUserMenuIcon');
export const NavAdminIcon = makeIcon(ShieldCheck, 'NavAdminIcon');

// Action icons
export const PlayIcon = makeIcon(Play, 'PlayIcon');
export const PauseIcon = makeIcon(Pause, 'PauseIcon');
export const FullscreenIcon = makeIcon(Maximize, 'FullscreenIcon');
export const ExitFullscreenIcon = makeIcon(Minimize, 'ExitFullscreenIcon');
export const VolumeIcon = makeIcon(Volume2, 'VolumeIcon');
export const MuteIcon = makeIcon(VolumeX, 'MuteIcon');
export const CloseIcon = makeIcon(X, 'CloseIcon');
export const AddIcon = makeIcon(Plus, 'AddIcon');
export const EditIcon = makeIcon(Pencil, 'EditIcon');
export const TrashIcon = makeIcon(Trash2, 'TrashIcon');
export const CheckIcon = makeIcon(Check, 'CheckIcon');
export const ChevronLeftIcon = makeIcon(ChevronLeft, 'ChevronLeftIcon');
export const ChevronRightIcon = makeIcon(ChevronRight, 'ChevronRightIcon');
export const MoreIcon = makeIcon(MoreHorizontal, 'MoreIcon');
export const FavoriteIcon = makeIcon(Heart, 'FavoriteIcon');

// FavoriteFilledIcon: Heart with fill
export function FavoriteFilledIcon({ size = 24, strokeWidth = 2, ...props }: IconProps) {
  return <Heart size={size} strokeWidth={strokeWidth} fill="currentColor" {...props} />;
}
FavoriteFilledIcon.displayName = 'FavoriteFilledIcon';
