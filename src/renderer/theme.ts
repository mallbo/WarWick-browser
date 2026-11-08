import {
  DEFAULT_THEME,
  normalizeThemeSettings,
  type ThemeBackground,
  type ThemeSettings
} from '../shared/types';

interface ThemePalette {
  bg: string;
  sidebar: string;
  panel: string;
  surface: string;
  surface2: string;
  border: string;
  borderSoft: string;
}

const DARK_BACKGROUNDS: Record<ThemeBackground, ThemePalette> = {
  'warm-black': {
    bg: '#121009',
    sidebar: '#17140D',
    panel: '#1B1811',
    surface: '#211D13',
    surface2: '#292416',
    border: '#3A3323',
    borderSoft: '#2A2519'
  },
  graphite: {
    bg: '#0F1113',
    sidebar: '#14171A',
    panel: '#181B1E',
    surface: '#1E2225',
    surface2: '#262B2F',
    border: '#343A3F',
    borderSoft: '#252A2E'
  },
  espresso: {
    bg: '#14100C',
    sidebar: '#1A150F',
    panel: '#201A13',
    surface: '#271F17',
    surface2: '#2F261B',
    border: '#3D3224',
    borderSoft: '#2B2318'
  },
  slate: {
    bg: '#101214',
    sidebar: '#15181B',
    panel: '#1A1E21',
    surface: '#20252A',
    surface2: '#282E34',
    border: '#394047',
    borderSoft: '#262C32'
  }
};

const LIGHT_BACKGROUNDS: Record<ThemeBackground, ThemePalette> = {
  'warm-black': {
    bg: '#F3EFE6',
    sidebar: '#ECE7DC',
    panel: '#FBF8F1',
    surface: '#F3EEE3',
    surface2: '#E9E2D3',
    border: '#D4CBBB',
    borderSoft: '#E2DACB'
  },
  graphite: {
    bg: '#EEF1F3',
    sidebar: '#E6EAED',
    panel: '#F8FAFB',
    surface: '#EEF2F4',
    surface2: '#E1E7EA',
    border: '#C9D2D8',
    borderSoft: '#DBE2E6'
  },
  espresso: {
    bg: '#F5EEE6',
    sidebar: '#EDE4DA',
    panel: '#FDF9F3',
    surface: '#F5EEE5',
    surface2: '#EADFD2',
    border: '#D8C9B8',
    borderSoft: '#E5D8C9'
  },
  slate: {
    bg: '#EEF0F2',
    sidebar: '#E6E9EC',
    panel: '#F9FAFB',
    surface: '#EEF1F4',
    surface2: '#E1E5E9',
    border: '#C9D0D6',
    borderSoft: '#DBE0E4'
  }
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(hex: string): string {
  const value = (hex || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return DEFAULT_THEME.accent;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHex(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const ratio = clamp(amount, 0, 1);
  return rgbToHex(
    r + (255 - r) * ratio,
    g + (255 - g) * ratio,
    b + (255 - b) * ratio
  );
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const ratio = clamp(1 - amount, 0, 1);
  return rgbToHex(r * ratio, g * ratio, b * ratio);
}

function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastColor(hex: string): string {
  return relativeLuminance(hex) > 0.48 ? '#17130A' : '#FFF9ED';
}

export function getEffectiveThemeMode(theme: ThemeSettings): 'dark' | 'light' {
  if (theme.mode === 'light') return 'light';
  if (theme.mode === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

/**
 * Applies the complete appearance contract to the document root. Every
 * renderer component reads from these CSS variables, so a single call updates
 * the chrome, cards, controls and accent states without a re-render.
 */
export function applyTheme(themeInput?: Partial<ThemeSettings> | null): ThemeSettings {
  const theme = normalizeThemeSettings(themeInput);
  const mode = getEffectiveThemeMode(theme);
  const isLight = mode === 'light';
  const palette = (isLight ? LIGHT_BACKGROUNDS : DARK_BACKGROUNDS)[theme.background];

  const accentBase = normalizeHex(theme.accent);
  const accent = isLight ? darken(accentBase, 0.22) : accentBase;
  const accentBright = isLight ? darken(accentBase, 0.30) : lighten(accentBase, 0.18);
  const accentContrast = contrastColor(accent);

  const intensityAlpha: Record<ThemeSettings['intensity'], number> = {
    soft: 0.08,
    balanced: 0.13,
    bold: 0.21
  };
  const softAlpha = intensityAlpha[theme.intensity] + (isLight ? 0.03 : 0);
  const accentSoft = hexToRgba(accentBase, softAlpha);
  const accentSoftStrong = hexToRgba(accentBase, softAlpha + 0.07);
  const borderAccent = hexToRgba(accentBase, softAlpha + 0.29);
  const borderAccentSoft = hexToRgba(accentBase, softAlpha + 0.12);

  const tabActive = isLight
    ? palette.surface
    : lighten(palette.surface2, 0.04);
  const surfaceActive = isLight
    ? darken(palette.surface2, 0.06)
    : lighten(palette.surface2, 0.08);

  const root = document.documentElement;
  const body = document.body;

  root.dataset.themeMode = mode;
  root.dataset.density = theme.density;
  root.style.colorScheme = mode;
  root.classList.toggle('theme-light', isLight);
  root.classList.toggle('dark', !isLight);
  if (body) {
    body.classList.toggle('theme-light', isLight);
    body.classList.toggle('dark', !isLight);
    body.dataset.themeMode = mode;
    body.dataset.density = theme.density;
  }

  const variables: Record<string, string> = {
    '--bg-app': palette.bg,
    '--bg-sidebar': palette.sidebar,
    '--bg-panel': palette.panel,
    '--bg-surface': palette.surface,
    '--bg-surface-hover': palette.surface2,
    '--bg-surface-active': surfaceActive,
    '--bg-tab-active': tabActive,
    '--border-subtle': palette.borderSoft,
    '--border-strong': palette.border,
    '--border-accent': borderAccent,
    '--border-accent-soft': borderAccentSoft,
    '--text-primary': isLight ? '#1E1B15' : '#F0ECE0',
    '--text-secondary': isLight ? '#5A5448' : '#B3AD9C',
    '--text-muted': isLight ? '#7A7467' : '#85806F',
    '--accent': accent,
    '--accent-bright': accentBright,
    '--accent-strong': isLight ? darken(accentBase, 0.30) : darken(accentBase, 0.12),
    '--accent-soft': accentSoft,
    '--accent-soft-strong': accentSoftStrong,
    '--accent-contrast': accentContrast,
    '--shadow-color': isLight ? 'rgba(40, 32, 20, 0.10)' : 'rgba(0, 0, 0, 0.34)'
  };

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  return theme;
}

/** Reset to the approved Wolf Gold defaults. */
export function resetTheme(): ThemeSettings {
  return applyTheme(DEFAULT_THEME);
}
