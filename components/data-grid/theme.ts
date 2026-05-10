"use client";

import { useEffect, useState } from "react";
import type { Theme } from "@glideapps/glide-data-grid";

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const lightTheme: Partial<Theme> = {
  accentColor: "#6366F1",
  accentLight: "#EEF2FF",
  textDark: "#1E293B",
  textMedium: "#475569",
  textLight: "#94A3B8",
  textBubble: "#1E293B",
  bgIconHeader: "#475569",
  fgIconHeader: "#FFFFFF",
  textHeader: "#475569",
  textHeaderSelected: "#1E293B",
  bgCell: "#FFFFFF",
  bgCellMedium: "#F8FAFC",
  bgHeader: "#F1F5F9",
  bgHeaderHasFocus: "#E2E8F0",
  bgHeaderHovered: "#E2E8F0",
  bgBubble: "#F1F5F9",
  bgBubbleSelected: "#EEF2FF",
  bgSearchResult: "#FEF3C7",
  borderColor: "#E2E8F0",
  drilldownBorder: "#E2E8F0",
  linkColor: "#2563EB",
  cellHorizontalPadding: 8,
  cellVerticalPadding: 4,
  headerFontStyle: "600 12px",
  baseFontStyle: "13px",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
};

const darkTheme: Partial<Theme> = {
  ...lightTheme,
  accentColor: "#818CF8",
  accentLight: "#1E1B4B",
  textDark: "#E2E8F0",
  textMedium: "#94A3B8",
  textLight: "#64748B",
  textBubble: "#E2E8F0",
  bgIconHeader: "#94A3B8",
  fgIconHeader: "#0B1220",
  textHeader: "#94A3B8",
  textHeaderSelected: "#E2E8F0",
  bgCell: "#0B1220",
  bgCellMedium: "#111827",
  bgHeader: "#1F2937",
  bgHeaderHasFocus: "#374151",
  bgHeaderHovered: "#374151",
  bgBubble: "#1F2937",
  bgBubbleSelected: "#1E1B4B",
  bgSearchResult: "#78350F",
  borderColor: "#1F2937",
  drilldownBorder: "#1F2937",
  linkColor: "#60A5FA",
};

export function useGlideTheme(): Partial<Theme> {
  const isDark = useIsDark();
  return isDark ? darkTheme : lightTheme;
}
