import raw from "./brand.json";

/**
 * ألوان الهوية — القيم في `brand.json` وحده، وهنا ربطها بأدوار الواجهة.
 *
 * لتغيير لونٍ: عدّل قيمته في `brand.json` (الفاتح والداكن). لا لون في
 * styles.css ولا في المكوّنات؛ وفحص `brand.test.ts` يفشل إن كُتب لونٌ من
 * الهوية حرفياً خارج src/config.
 */
export type BrandColor = keyof typeof raw.colors.light;
export const COLORS = { light: raw.colors.light, dark: raw.colors.dark } as const;

/** الدور ← مفتاح اللون. الدور ثابت في الكود، واللون يتغيّر من الإعداد. */
const ROLES: Record<string, BrandColor> = {
  "shore-need": "slate",
  bridge: "gold",
  "bridge-ink": "goldInk",
  "bridge-bright": "goldBright",
  "thrive-tint": "greenTint",
  "shore-thrive": "thrive",
  navy: "greenDeep",
  graphite: "stone",
  "gold-line": "gold",
  background: "paper",
  foreground: "ink",
  card: "surface",
  "card-foreground": "ink",
  popover: "surface",
  "popover-foreground": "ink",
  primary: "green",
  "primary-foreground": "onPrimary",
  secondary: "secondary",
  "secondary-foreground": "onSecondary",
  muted: "subtle",
  "muted-foreground": "muted",
  accent: "accent",
  "accent-foreground": "accentInk",
  destructive: "danger",
  "destructive-foreground": "onPrimary",
  success: "success",
  "success-foreground": "onPrimary",
  border: "line",
  input: "lineStrong",
  ring: "green",
  "chart-1": "green",
  "chart-2": "gold",
  "chart-3": "slate",
  "chart-4": "greenSoft",
  "chart-5": "goldBright",
  sidebar: "sidebar",
  "sidebar-foreground": "ink",
  "sidebar-primary": "green",
  "sidebar-primary-foreground": "onPrimary",
  "sidebar-accent": "sidebarAccent",
  "sidebar-accent-foreground": "onSecondary",
  "sidebar-border": "line",
  "sidebar-ring": "green",
};

function block(mode: "light" | "dark") {
  return Object.entries(ROLES)
    .map(([role, key]) => `--${role}:${COLORS[mode][key]};`)
    .join("");
}

/** متغيّرات CSS للوضعين — تُحقن في <head> قبل أوّل رسم. */
export const BRAND_CSS = `:root{${block("light")}}.dark{${block("dark")}}`;

/** لون شريط المتصفّح على الجوال. */
export const THEME_COLOR = COLORS.light.green;
