// ⚠️ 수정금지(승인필요) — 아이콘 컴포넌트 (36개 명시 import, 번들 크기 축소)
// import * 사용 금지 — 600개+ 아이콘이 전부 번들에 포함되어 15MB 초과됨
import React from "react";
import type { LucideProps } from "lucide-react-native";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bookmark,
  Bot,
  Brain,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Cloud,
  Coffee,
  Compass,
  CreditCard,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  Film,
  Globe,
  Heart,
  HelpCircle,
  Home,
  Lock,
  LogOut,
  Map,
  MapPin,
  Maximize2,
  Minus,
  MinusCircle,
  Navigation,
  Play,
  PlayCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Star,
  Sun,
  Tag,
  ThumbsUp,
  TrendingUp,
  User,
  Users,
  X,
  XCircle,
  Zap,
  ShoppingBag,
  Ticket,
  Camera,
  FerrisWheel,
  Flower2,
  Landmark,
  Mountain,
  Share2,
  CalendarPlus,
} from "lucide-react-native";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";

// ⚠️ 수정금지(승인필요) — 정적 아이콘 맵 (새 아이콘 사용 시 여기에 추가)
const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bookmark,
  Bot,
  Brain,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Cloud,
  Coffee,
  Compass,
  CreditCard,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  Film,
  Globe,
  Heart,
  HelpCircle,
  Home,
  Lock,
  LogOut,
  Map,
  MapPin,
  Maximize2,
  Minus,
  MinusCircle,
  Navigation,
  Play,
  PlayCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Star,
  Sun,
  Tag,
  ThumbsUp,
  TrendingUp,
  User,
  Users,
  X,
  XCircle,
  Zap,
  ShoppingBag, // = 쇼핑
  Ticket,
  Camera, // = 핫스팟 (= 마커와 통일)
  FerrisWheel, // = 즐길거리 (= 마커와 통일)
  Flower2, // = 힐링 (= 마커와 통일)
  Landmark, // = 문화/예술 (= 마커와 통일)
  Mountain, // = 모험 (= 마커와 통일)
  Share2, // = 여정 공유 (2026-07-21 결과화면 하단 공유 버튼)
  CalendarPlus, // = 캘린더 저장 (2026-07-21 결과화면 하단 캘린더 버튼)
};

// ⚠️ 수정금지(승인필요) — kebab-case → PascalCase 변환
const toPascalCase = (str: string) =>
  str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

export interface IconProps extends Omit<LucideProps, "color"> {
  name: string;
  color?: string;
  size?: number;
}

// ⚠️ 수정금지(승인필요) — 아이콘 렌더링 (정적 맵 lookup)
export function Icon({ name, color, size = 24, ...rest }: IconProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const iconName =
    name.includes("-") || name === name.toLowerCase()
      ? toPascalCase(name)
      : name;
  const LucideIcon = ICON_MAP[iconName];

  if (!LucideIcon) {
    console.warn(
      `[Icon] Missing icon: ${name} (resolved to ${iconName}). ICON_MAP에 추가 필요.`,
    );
    return null;
  }

  const iconColor = color || theme.text;
  return <LucideIcon color={iconColor} size={size} {...rest} />;
}

export default Icon;
