/**
 * BTS 미니앱 테마 훅 — 시간대별 자동 밝은/어두운 전환
 * 06:00~18:00 → 밝은모드 (한지 화이트)
 * 18:00~06:00 → 어두운모드 (콘서트 나이트)
 * 기기 설정 우선 (useColorScheme)
 */
import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { BTSColors, ArirangColors } from '@/constants/bts-theme';

export function useBTSTheme() {
  const deviceScheme = useColorScheme();
  const [timeScheme, setTimeScheme] = useState<'light' | 'dark'>('light');

  // 시간대별 자동 전환 (기기 설정이 없을 때만)
  useEffect(() => {
    function updateTimeScheme() {
      const hour = new Date().getHours();
      setTimeScheme(hour >= 6 && hour < 18 ? 'light' : 'dark');
    }
    updateTimeScheme();
    const interval = setInterval(updateTimeScheme, 60_000); // 1분마다 체크
    return () => clearInterval(interval);
  }, []);

  // 기기 설정 우선, 없으면 시간대 기반
  const isDark = deviceScheme ? deviceScheme === 'dark' : timeScheme === 'dark';
  const mode = isDark ? 'dark' : 'light';
  const colors = BTSColors[mode];

  return {
    isDark,
    mode,
    colors,
    arirang: ArirangColors,
  };
}
