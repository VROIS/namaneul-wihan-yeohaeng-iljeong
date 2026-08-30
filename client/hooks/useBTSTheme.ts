import { useEffect, useState } from "react";
import { useColorScheme } from "@/hooks/useColorScheme";
import { BTSColors, ArirangColors } from "@/constants/bts-theme";

export function useBTSTheme() {
  const deviceScheme = useColorScheme();
  const [timeScheme, setTimeScheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    function updateTimeScheme() {
      const hour = new Date().getHours();
      setTimeScheme(hour >= 6 && hour < 18 ? "light" : "dark");
    }
    updateTimeScheme();
    const interval = setInterval(updateTimeScheme, 60_000); // 1분마다 체크
    return () => clearInterval(interval);
  }, []);

  const isDark = deviceScheme ? deviceScheme === "dark" : timeScheme === "dark";
  const mode = isDark ? "dark" : "light";
  const colors = BTSColors[mode];

  return {
    isDark,
    mode,
    colors,
    arirang: ArirangColors,
  };
}
