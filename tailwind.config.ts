import type { Config } from "tailwindcss";

// AscendSME design identity: the v3 design (DESIGN_V3_PLAN.md), replacing
// the "Ascend POS design direction". Token names are unchanged from the
// previous palette so every existing surface picks the new identity up
// without being rewritten.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // AscendSME v3 design (Claude Design system 7aa26871, approved 18 Nov
        // 2026, DESIGN_V3_PLAN.md). The old token names keep working with new
        // values, so every screen picks the identity up without a rewrite; the
        // design's own scale names sit alongside for screens built from it.
        // Every text pair is held to 4.5:1 (scripts/check-contrast.mjs).

        // Deep navy: till chrome, dark grounds, footers, Control Center.
        navy: {
          DEFAULT: "#0A0E1A",
          deep: "#0F172A",
          soft: "#1F2937",
          900: "#0A0E1A",
          800: "#0F172A",
        },
        // Teal. The brand teal #00A99D carries white at only 2.93:1, so it
        // marks and tints; actions and teal text use #007A6F, the same hue a
        // little deeper (5.2:1). Hover goes darker, never lighter.
        teal: {
          DEFAULT: "#007A6F",
          dark: "#006B62",
          hover: "#006B62",
          light: "#EEFCF9",
          surface: "#E7FBF7",
          pale: "#D3F3EE",
          // Teal on dark ground, where the action teal goes muddy.
          mint: "#4FC3B5",
          "mint-bright": "#7CF2C9",
          // An action on navy: dark text sits on it, never white.
          bright: "#00A99D",
          // Ink on the brand teal (5.2:1). Darker than teal-900 on purpose.
          deepest: "#002B26",
          // A till that is selling right now. A dot, never text.
          live: "#00A99D",
          brand: "#00A99D",
          50: "#EEFCF9",
          100: "#E7FBF7",
          150: "#E6F7F7",
          200: "#D3F3EE",
          300: "#9FE3D8",
          400: "#4FC3B5",
          500: "#00A99D",
          600: "#008C85",
          action: "#007A6F",
          700: "#006B62",
          800: "#005F57",
          900: "#00473F",
        },
        // Ink: headings #121212, body #111827, then the secondary ramp.
        ink: {
          DEFAULT: "#111827",
          heading: "#121212",
          soft: "#374151",
          muted: "#4B5563",
          slate: "#4B5563",
        },
        // Muted text. #646E7C is the lightest grey that reads at 4.5:1 on
        // white and the app ground; the lighter greys are for decoration.
        "mid-grey": "#646E7C",
        "slate-grey": "#646E7C",
        "soft-grey": "#9CA3AF",
        "faint-grey": "#9CA3AF",
        neutral: {
          50: "#FAFAFA",
          100: "#F3F4F6",
          150: "#F9FAFB",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#646E7C",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
        },
        // Text on navy.
        "on-dark": "#C3CBD6",
        "on-dark-soft": "#A9B4C2",
        "on-dark-strong": "#E5E7EB",
        "on-dark-muted": "#A9B4C2",
        // Surfaces.
        canvas: "#F4F5F7",
        "canvas-tint": "#F5F9F7",
        page: "#E5E7EB",
        band: "#EEF1F0",
        "light-grey": "#F3F4F6",
        surface: "#F9FAFB",
        raised: "#F3F4F6",
        // Lines, lightest to strongest. "brand" is the teal-tinted hairline
        // the design puts on cards.
        line: {
          DEFAULT: "#E5E7EB",
          soft: "#EEF0F2",
          strong: "#D1D5DB",
          stronger: "#BFC5CD",
          light: "#E5E7EB",
          brand: "rgba(0,169,157,0.18)",
        },
        // Gold: upgrades, warnings. Gold itself never carries text.
        gold: {
          DEFAULT: "#E8A020",
          light: "#FEF3E2",
          dark: "#633806",
          deep: "#B87A12",
          rule: "#E8A020",
          tint: "#FEF3E2",
          ink: "#633806",
          100: "#FEF3E2",
          500: "#E8A020",
          700: "#633806",
        },
        danger: {
          DEFAULT: "#DC2626",
          soft: "#E05252",
          tint: "#FEECEC",
          ink: "#B91C1C",
        },
        success: {
          DEFAULT: "#1F8A5B",
          tint: "#DCFCE7",
          ink: "#166534",
        },
        info: {
          DEFAULT: "#185FA5",
          light: "#E6F1FB",
          ink: "#144A84",
        },
        orange: {
          100: "#FFE7D1",
          500: "#FF7A00",
        },
        tier: {
          foundation: "#64748B",
          growth: "#008678",
          verified: "#6366F1",
        },
      },
      fontFamily: {
        // Self-hosted by next/font in the root layout (variable fonts, one
        // file each): Inter for body and UI, Outfit for headings and display.
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-outfit)", "var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // The design leans on a tight display scale.
        display: ["46px", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
        headline: ["38px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        title: ["26px", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
      borderRadius: {
        // The design leans on a soft 16px card; controls 12px; chips and
        // badges are pills (rounded-full).
        card: "16px",
        panel: "16px",
        hero: "24px",
        control: "12px",
        chip: "10px",
      },
      boxShadow: {
        // Teal-tinted depth is the brand signature, never neutral grey.
        card: "0 18px 40px rgba(2,91,84,0.08)",
        "card-hover": "0 24px 55px rgba(2,91,84,0.12)",
        action: "0 8px 20px rgba(0,122,111,0.25)",
        // A list or panel sitting on the canvas.
        lift: "0 10px 30px rgba(2,91,84,0.07)",
        float: "0 22px 80px rgba(15,23,42,0.18)",
      },
      lineHeight: {
        body: "1.65",
        display: "1.15",
      },
      keyframes: {
        riseup: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        sheetup: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        popin: {
          "0%": { transform: "scale(.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pulsedot: {
          "0%,100%": { opacity: ".28" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        riseup: "riseup .22s ease-out",
        sheetup: "sheetup .24s ease-out",
        popin: "popin .18s ease-out",
        pulsedot: "pulsedot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
