import type { CoffeeBean } from "../types";

export interface ParsedBean {
  name?: string;
  origin?: string;
  roaster?: string;
  roastLevel?: CoffeeBean["roastLevel"];
  notes?: string;
}

// Common specialty-coffee producing countries (lowercase).
const ORIGINS = [
  "ethiopia",
  "colombia",
  "brazil",
  "kenya",
  "guatemala",
  "costa rica",
  "honduras",
  "peru",
  "rwanda",
  "burundi",
  "panama",
  "indonesia",
  "sumatra",
  "yemen",
  "el salvador",
  "nicaragua",
  "mexico",
  "uganda",
  "tanzania",
  "bolivia",
  "ecuador",
  "india",
  "vietnam",
  "china",
  "congo",
  "jamaica",
  "papua new guinea",
];

// Flavour/tasting descriptors used as a fallback for the notes field.
const FLAVORS = [
  "fruity",
  "floral",
  "citrus",
  "berry",
  "berries",
  "blueberry",
  "strawberry",
  "cherry",
  "peach",
  "apricot",
  "apple",
  "chocolate",
  "cocoa",
  "caramel",
  "nutty",
  "honey",
  "jasmine",
  "vanilla",
  "spice",
  "winey",
  "wine",
  "tropical",
  "brown sugar",
  "toffee",
  "almond",
  "hazelnut",
  "lemon",
  "orange",
  "bergamot",
  "tea",
  "malt",
  "molasses",
  "plum",
  "raisin",
  "fig",
  "grape",
  "melon",
  "mango",
  "pineapple",
  "hibiscus",
  "stone fruit",
];

// Lines that are never a coffee name (marketing / packaging boilerplate).
const NAME_NOISE =
  /specialty coffee|arabica|single origin|whole bean|ground coffee|net\s*(wt|weight)|\b\d+\s*(g|oz|kg|lb)\b|roasted (in|with)|www\.|\.com/i;

const LABELS = {
  origin: /^\W*(?:origin|country)\W*[:-]\s*(.+)$/i,
  roaster: /^\W*(?:roaster|roastery|roasted by)\W*[:-]\s*(.+)$/i,
  roast: /^\W*roast(?:\s*(?:level|profile))?\W*[:-]\s*(.+)$/i,
  notes:
    /^\W*(?:roaster\s+)?(?:tasting\s*notes?|flavou?r(?:\s*(?:profile|notes))?|notes|cup(?:ping)?|we\s*tasted?)\W*[:-]\s*(.+)$/i,
  name: /^\W*(?:coffee\s*name|name)\W*[:-]\s*(.+)$/i,
};

/** Run OCR on an image data URL / object URL and return the raw text. */
export async function runOcr(image: string): Promise<string> {
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(image, "eng");
  return data.text ?? "";
}

function clean(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^["'\s.,;:-]+|["'\s.,;:-]+$/g, "")
    .trim();
}

function titleCase(s: string): string {
  return s.replace(
    /\w\S*/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

function labeledValue(lines: string[], re: RegExp): string | undefined {
  for (const l of lines) {
    const m = l.match(re);
    if (m && clean(m[1])) return clean(m[1]);
  }
  return undefined;
}

function isLabel(l: string): boolean {
  return Object.values(LABELS).some((re) => re.test(l));
}

function roastFromText(t: string): CoffeeBean["roastLevel"] | undefined {
  const s = t.toLowerCase();
  if (/medium[\s-]*dark/.test(s)) return "medium-dark";
  if (/\blight\b/.test(s)) return "light";
  if (/\bmedium\b/.test(s)) return "medium";
  if (/\bdark\b/.test(s)) return "dark";
  return undefined;
}

function detectOrigin(lines: string[]): string | undefined {
  const labeled = labeledValue(lines, LABELS.origin);
  if (labeled) return titleCase(labeled);
  // Unlabeled: extract just the country so a product-name line
  // (e.g. "Ethiopia Wubanchi G1") doesn't leak into the origin field.
  const country = ORIGINS.find((o) =>
    lines.some((l) => !isLabel(l) && l.toLowerCase().includes(o)),
  );
  return country ? titleCase(country) : undefined;
}

function detectRoaster(lines: string[]): string | undefined {
  const labeled = labeledValue(lines, LABELS.roaster);
  if (labeled) return titleCase(labeled);
  const line = lines.find(
    (l) =>
      /roaster|roastery|coffee\s*roasters|coffee\s*co\b/i.test(l) &&
      !LABELS.roast.test(l),
  );
  return line && clean(line).length <= 40 ? titleCase(clean(line)) : undefined;
}

function detectNotes(lines: string[], lower: string): string | undefined {
  const labeled = labeledValue(lines, LABELS.notes);
  if (labeled) return clean(labeled);
  const found = FLAVORS.filter((f) => lower.includes(f));
  if (found.length === 0) return undefined;
  const unique = Array.from(new Set(found));
  return unique.map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join(", ");
}

function detectName(
  lines: string[],
  origin?: string,
  roaster?: string,
): string | undefined {
  const labeled = labeledValue(lines, LABELS.name);
  if (labeled) return titleCase(labeled);

  const candidates = lines.filter((l) => {
    if (isLabel(l) || NAME_NOISE.test(l)) return false;
    if (roaster && titleCase(clean(l)) === roaster) return false;
    if (
      /^(light|medium|dark|medium[\s-]*dark)\s*(roast(ed)?)?$/i.test(clean(l))
    )
      return false;
    if (ORIGINS.some((o) => clean(l).toLowerCase() === o)) return false;
    return clean(l).length >= 3;
  });
  if (candidates.length === 0) return undefined;

  // Prefer a short, prominent line that names the coffee (often includes origin).
  const withOrigin = candidates.find(
    (l) =>
      ORIGINS.some((o) => l.toLowerCase().includes(o)) && clean(l).length <= 45,
  );
  const short = candidates.find((l) => clean(l).length <= 45);
  const chosen = withOrigin ?? short ?? candidates[0];
  return chosen ? titleCase(clean(chosen)) : origin;
}

/** Heuristically map raw OCR text onto editable bean fields. */
export function parseBeanText(text: string): ParsedBean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && /[a-z]/i.test(l));

  const lower = text.toLowerCase();
  const origin = detectOrigin(lines);
  const roaster = detectRoaster(lines);
  const notes = detectNotes(lines, lower);
  const roastLevel =
    roastFromText(labeledValue(lines, LABELS.roast) ?? "") ??
    roastFromText(text);
  const name = detectName(lines, origin, roaster);

  const parsed: ParsedBean = {};
  if (name) parsed.name = name;
  if (origin) parsed.origin = origin;
  if (roaster) parsed.roaster = roaster;
  if (roastLevel) parsed.roastLevel = roastLevel;
  if (notes) parsed.notes = notes;
  return parsed;
}
