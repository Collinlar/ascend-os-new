import type { Config } from "tailwindcss";

// AscendSME design identity, taken from the "Ascend POS design direction"
// design project. Token names are unchanged from the previous palette so
// every existing surface picks the new identity up without being rewritten.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep navy: hero, footer, terminal chrome.
        navy: {
          DEFAULT: "#0B1D2E",
          deep: "#0F2438",
          soft: "#1B3450",
        },
        // Primary action and brand.
        teal: {
          DEFAULT: "#0E8C7F",
          dark: "#0B6F65",
          light: "#E6F4F1",
          surface: "#E1F1EE",
          // Mint reads as the accent on dark ground, where teal goes muddy.
          mint: "#5BC7B8",
          "mint-bright": "#7FD6C6",
          // Reads as an action on the deep navy hero, where the primary
          // teal sinks into the background.
          bright: "#22B39C",
          deepest: "#04231F",
          // A till that is actually selling right now.
          live: "#17A98F",
          hover: "#12A392",
          pale: "#CDEDE8",
        },
        // Ink and the muted text ramp.
        ink: {
          DEFAULT: "#102A43",
          soft: "#33506A",
          muted: "#40596F",
          slate: "#48607A",
        },
        "mid-grey": "#6B8091",
        // The lightest grey in the palette that clears WCAG AA on white
        // (5.08:1). mid-grey is 4.10 and soft-grey is 3.00, so neither is
        // safe for the small print a customer actually has to read.
        "slate-grey": "#5A7184",
        "soft-grey": "#8298A7",
        "faint-grey": "#93A7B4",
        "on-dark": "#AEC2CE",
        "on-dark-soft": "#8BA3B6",
        "on-dark-strong": "#C7D6E0",
        "on-dark-muted": "#8FA6B5",
        // Surfaces.
        // The Business Web ground. Cooler and lighter than the marketing
        // page ground, because a working screen is read for hours.
        canvas: "#EFF4F8",
        page: "#DCE4EB",
        band: "#E4EBF0",
        "light-grey": "#F1F5F8",
        surface: "#F7FAFC",
        raised: "#EEF3F7",
        // Lines, lightest to strongest.
        line: {
          DEFAULT: "#E2EBF0",
          soft: "#E6EDF3",
          strong: "#D3DEE6",
          stronger: "#C4D2DC",
        },
        // Status. Amber carries attention, red carries loss.
        gold: {
          DEFAULT: "#F4B740",
          light: "#FBEFD8",
          dark: "#9A6207",
          deep: "#C08A1E",
          // The rule down the side of something that needs a decision.
          rule: "#E4A93C",
          tint: "#FBEED4",
          // Darker than the design's #9A6412, which lands at 4.35:1 on the
          // tint above and misses the 4.5 these badges are set at.
          ink: "#8A5710",
        },
        danger: {
          DEFAULT: "#B42318",
          soft: "#B0453A",
        },
        info: {
          DEFAULT: "#3F6494",
          light: "#E7EEF6",
        },
      },
      fontFamily: {
        // Bound to the next/font variables set in the root layout, so the
        // faces are self-hosted rather than fetched from a CDN.
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // The design leans on a tight display scale.
        display: ["46px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        headline: ["38px", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        title: ["26px", { lineHeight: "1.12", letterSpacing: "-0.02em" }],
      },
      letterSpacing: {
        eyebrow: "0.08em",
      },
      borderRadius: {
        card: "20px",
        panel: "16px",
        control: "12px",
        chip: "9px",
      },
      boxShadow: {
        // Very soft and low. Not a drop shadow, a lift.
        card: "0 12px 30px -26px rgba(16,42,67,.5)",
        action: "0 16px 34px -18px rgba(14,140,127,.9)",
        // A list or panel sitting on the canvas, lifted a little further.
        lift: "0 14px 34px -30px rgba(16,42,67,.9)",
      },
      lineHeight: {
        body: "1.6",
        display: "1.05",
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
