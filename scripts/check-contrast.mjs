#!/usr/bin/env node
// Text contrast, checked against the palette rather than against a copy of
// it.
//
// Five separate passes over this codebase turned up the same class of bug:
// a colour that reads fine on a designer's screen and fails WCAG AA on a
// merchant's. #8298A7 at 3.00. White on the brand teal at 4.14. Amber on
// amber at 2.84, on the banner telling a merchant their sales were at
// risk. Each was found by hand, and each could come back the next time
// somebody reaches for a colour that looks about right.
//
// So this reads tailwind.config.ts for the real tokens, works out what is
// behind each piece of text, and fails on anything a person cannot read.
//
// What it does not cover: colour set from JavaScript rather than from a
// class, and non-text contrast for borders and icons, which answers to a
// different rule (WCAG 1.4.11) and needs a person to say what counts as
// meaningful.
//
//   npm run check:contrast

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "tailwind.config.ts");
const DIRS = ["app", "components"];

// WCAG 2.1 AA. Large text is 24px, or 18.66px at 700 or heavier.
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;

const FONT_SIZES = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
  "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60,
  display: 46, headline: 38, title: 26,
};

const WEIGHTS = {
  thin: 100, extralight: 200, light: 300, normal: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
};

// Text inherits 16px from the body when nothing says otherwise.
const INHERITED_PX = 16;

// ---------------------------------------------------------------- palette --

// Parsed from the config rather than duplicated here, so a token added
// there is known here without anybody remembering to copy it across.
function readPalette() {
  const src = fs
    .readFileSync(CONFIG, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const start = src.indexOf("colors:");
  if (start === -1) throw new Error("no colors block in tailwind.config.ts");
  const open = src.indexOf("{", start);

  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }

  const body = src.slice(open + 1, end);
  const out = {};
  const entry = /(?:"([^"]+)"|([A-Za-z_][\w-]*))\s*:\s*(?:"(#[0-9A-Fa-f]{3,8})"|\{)/g;
  let m;

  while ((m = entry.exec(body))) {
    const key = m[1] ?? m[2];
    if (m[3]) {
      out[key] = m[3];
      continue;
    }
    let d = 1;
    let i = entry.lastIndex;
    for (; i < body.length && d > 0; i += 1) {
      if (body[i] === "{") d += 1;
      else if (body[i] === "}") d -= 1;
    }
    const inner = body.slice(entry.lastIndex, i - 1);
    const leaf = /(?:"([^"]+)"|([A-Za-z_][\w-]*))\s*:\s*"(#[0-9A-Fa-f]{3,8})"/g;
    let n;
    while ((n = leaf.exec(inner))) {
      const sub = n[1] ?? n[2];
      out[sub === "DEFAULT" ? key : `${key}-${sub}`] = n[3];
    }
    entry.lastIndex = i;
  }

  out.white = "#FFFFFF";
  out.black = "#000000";
  return out;
}

// ----------------------------------------------------------------- colour --

const toRgb = (value) => {
  let h = value.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const composite = (fg, bg, alpha) => fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);

const asHex = (rgb) =>
  "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase();

// ---------------------------------------------------------------- classes --

// hover:, sm:, placeholder: and the rest are prefixes as far as colour is
// concerned. A hover fill still has to carry its label.
function stripVariants(token) {
  let t = token;
  while (/^[\w-]+(?:\[[^\]]*\])?:/.test(t)) {
    const next = t.slice(t.indexOf(":") + 1);
    if (!next) break;
    t = next;
  }
  return t;
}

// name, name/50, [#0B1D2E]
function resolveColour(value, palette) {
  const slash = value.lastIndexOf("/");
  let base = value;
  let alpha = 1;

  if (slash > 0 && !value.slice(slash + 1).includes("]")) {
    const a = Number(value.slice(slash + 1));
    if (Number.isFinite(a)) {
      alpha = a / 100;
      base = value.slice(0, slash);
    }
  }

  if (base.startsWith("[") && base.endsWith("]")) {
    const inner = base.slice(1, -1);
    return /^#[0-9A-Fa-f]{3,8}$/.test(inner) ? { rgb: toRgb(inner), alpha } : null;
  }

  const found = palette[base];
  return found ? { rgb: toRgb(found), alpha } : null;
}

// The class lists an element can actually render with. A template literal
// holds a shared base plus one branch of a conditional, so each branch is
// its own candidate: merging them invents pairs that never appear together,
// which is how a checker earns a reputation for crying wolf.
function candidates(expression) {
  if (!expression.includes("${")) return [expression];

  const interpolations = [];
  let statics = "";
  let depth = 0;
  let buffer = "";

  for (let i = 0; i < expression.length; i += 1) {
    if (depth === 0 && expression[i] === "$" && expression[i + 1] === "{") {
      depth = 1;
      i += 1;
      buffer = "";
      continue;
    }
    if (depth > 0) {
      if (expression[i] === "{") depth += 1;
      else if (expression[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          interpolations.push(buffer);
          continue;
        }
      }
      buffer += expression[i];
    } else {
      statics += expression[i];
    }
  }

  const branches = [];
  for (const chunk of interpolations) {
    for (const literal of chunk.match(/"([^"]*)"|'([^']*)'/g) ?? []) {
      branches.push(literal.slice(1, -1));
    }
  }

  return branches.length === 0 ? [statics] : branches.map((b) => `${statics} ${b}`);
}

function readClassList(list, palette) {
  let fill = null;
  let text = null;
  let px = null;
  let weight = null;

  for (const raw of list.split(/\s+/).filter(Boolean)) {
    const t = stripVariants(raw);

    if (t.startsWith("bg-")) {
      const c = resolveColour(t.slice(3), palette);
      if (c) fill = c;
    } else if (t.startsWith("text-")) {
      const value = t.slice(5);
      const c = resolveColour(value, palette);
      if (c) {
        text = c;
        continue;
      }
      if (value in FONT_SIZES) px = FONT_SIZES[value];
      else {
        const arbitrary = value.match(/^\[(\d+(?:\.\d+)?)px\]$/);
        if (arbitrary) px = Number(arbitrary[1]);
      }
    } else if (t.startsWith("font-")) {
      const w = WEIGHTS[t.slice(5)];
      if (w) weight = w;
    }
  }

  return { fill, text, px, weight };
}

// ---------------------------------------------------------------- grounds --

// What is behind the text.
//
// An earlier version of this walked the JSX to work out each element's
// ancestry. It was wrong often enough on real TSX, and every fix uncovered
// another shape, which is a poor trade for a check that has to be trusted
// on sight. So the ground is declared rather than inferred:
//
//   // @contrast-surface navy               at the top, for a whole file
//   {"/* @contrast-surface navy-deep */"}   before a darker band
//   {"/* @contrast-surface white */"}       to come back
//
// A marker applies from its line until the next one. Most files need none,
// because most of this app is on white. A till needs one at the top, and a
// page with a navy hero needs two.
//
// Declaring it beats guessing: nobody has to work out what this tool
// believed, and it cannot quietly believe the wrong thing.
function groundMarks(source, palette) {
  const marks = [];
  const re = /@contrast-surface\s+([\w-]+|#[0-9A-Fa-f]{3,8})/g;
  let m;

  while ((m = re.exec(source))) {
    const token = m[1];
    let rgb;
    if (token.startsWith("#")) rgb = toRgb(token);
    else if (palette[token]) rgb = toRgb(palette[token]);
    else throw new Error(`@contrast-surface names an unknown colour: ${token}`);
    marks.push({ line: source.slice(0, m.index).split("\n").length, rgb, token });
  }
  return marks;
}

// The escape hatch, for the one case a ground cannot be declared: an
// element whose surface is chosen by whoever renders it. Put the marker on
// a line above it, with the reason:
//
//   {"/* @contrast-ignore the caller picks the ground via tone */"}
//
// Ignores are counted and printed, so they stay a decision somebody made
// rather than a place the check quietly stopped looking.
function ignoredLines(source) {
  const lines = new Set();
  source.split("\n").forEach((text, i) => {
    if (text.includes("@contrast-ignore")) {
      for (let n = 1; n <= 5; n += 1) lines.add(i + 1 + n);
    }
  });
  return lines;
}

function groundAt(marks, line) {
  let ground = { rgb: toRgb("#FFFFFF"), token: "white" };
  for (const mark of marks) {
    if (mark.line <= line) ground = mark;
    else break;
  }
  return ground;
}

const CLASSNAME = /className=(?:"([^"]*)"|\{`([\s\S]*?)`\}|\{"([^"]*)"\})/g;

function scanFile(source, palette) {
  const marks = groundMarks(source, palette);
  const ignored = ignoredLines(source);
  const findings = [];
  let suppressed = 0;

  CLASSNAME.lastIndex = 0;
  let m;

  while ((m = CLASSNAME.exec(source))) {
    const expression = m[1] ?? m[2] ?? m[3] ?? "";
    const line = source.slice(0, m.index).split("\n").length;
    const surface = groundAt(marks, line);

    for (const candidate of candidates(expression)) {
      const { fill, text, px, weight } = readClassList(
        candidate.replace(/\s+/g, " "),
        palette
      );
      if (!text) continue;

      const ground = fill ? composite(fill.rgb, surface.rgb, fill.alpha) : surface.rgb;
      const ink = composite(text.rgb, ground, text.alpha);

      const size = px ?? INHERITED_PX;
      const heavy = (weight ?? 400) >= 700;
      const need =
        size >= LARGE_PX || (size >= LARGE_BOLD_PX && heavy) ? AA_LARGE : AA_NORMAL;
      const ratio = contrast(ink, ground);

      // A hundredth of tolerance, so a value that rounds to the threshold
      // is not reported as missing it.
      if (ratio + 0.005 < need) {
        if (ignored.has(line)) {
          suppressed += 1;
          continue;
        }
        findings.push({
          line,
          ratio: ratio.toFixed(2),
          need: need.toFixed(1),
          ink: asHex(ink),
          ground: asHex(ground),
          size,
          heavy,
          assumedSize: px === null,
        });
      }
    }
  }

  return { findings, suppressed };
}

// ------------------------------------------------------------------ files --

function walk(dir, out = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(item.name)) out.push(full);
  }
  return out;
}

function main() {
  const palette = readPalette();
  const files = DIRS.filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) =>
    walk(path.join(ROOT, d))
  );

  let failures = 0;
  let suppressed = 0;

  for (const file of files.sort()) {
    const source = fs.readFileSync(file, "utf8");
    let findings;

    try {
      const result = scanFile(source, palette);
      findings = result.findings;
      suppressed += result.suppressed;
    } catch (error) {
      console.error(`${path.relative(ROOT, file)}: ${error.message}`);
      failures += 1;
      continue;
    }

    const seen = new Set();
    const unique = findings.filter((f) => {
      const key = `${f.line}:${f.ink}:${f.ground}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) continue;

    console.log(`\n${path.relative(ROOT, file).replace(/\\/g, "/")}`);
    for (const f of unique) {
      failures += 1;
      console.log(
        `  line ${f.line}: ${f.ink} on ${f.ground} = ${f.ratio}, needs ${f.need}` +
          ` at ${f.size}px${f.heavy ? " bold" : ""}${f.assumedSize ? " (inherited)" : ""}`
      );
    }
  }

  console.log(
    `\n${files.length} files, ${Object.keys(palette).length} tokens, ` +
      `${failures} ${failures === 1 ? "failure" : "failures"}` +
      (suppressed > 0 ? `, ${suppressed} ignored` : "") +
      "."
  );

  if (failures > 0) {
    console.log(
      "\nText under 4.5:1, or 3:1 when it is large, is text somebody cannot read.\n" +
        "Darken the ink, lighten the ground, or if this text is not on white say\n" +
        "so with a @contrast-surface marker above it."
    );
    process.exit(1);
  }
}

main();
