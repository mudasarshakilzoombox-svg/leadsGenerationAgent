/**
 * AIC-PRE-08: untrusted content sanitization. Website text, inbound emails and provider data are
 * data, never instructions. This always transforms and never blocks.
 */

export const UNTRUSTED_OPEN = '<untrusted_content';
export const UNTRUSTED_CLOSE = '</untrusted_content>';
export const DEFAULT_UNTRUSTED_CAP = 40_000;

// C0/C1 controls except tab and newline, bidi overrides/isolates, zero-width and BOM. Built from
// code points so the source stays plain ASCII and reviewable.
const INVISIBLE_RANGES: ReadonlyArray<[number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f], // zero-width space/joiners, LRM, RLM
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
];
/** A character-class entry for one code point, escaped for RegExp source (backslash, then u+hex). */
const BACKSLASH = String.fromCharCode(92);
const point = (n: number) => `${BACKSLASH}u${n.toString(16).padStart(4, '0')}`;
const INVISIBLE = new RegExp(
  `[${INVISIBLE_RANGES.map(([a, b]) => (a === b ? point(a) : `${point(a)}-${point(b)}`)).join('')}]`,
  'g',
);
const SCRIPT_STYLE = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG = /<\/?[a-z][^>]*>/gi;
const DELIMITER = /<\/?\s*untrusted_content/gi;
// Role-like markers at line start that try to impersonate the conversation structure.
const ROLE_MARKER = /^\s*(system|assistant|user|developer|human)\s*:/gim;

export function sanitizeUntrusted(input: string, cap = DEFAULT_UNTRUSTED_CAP): string {
  let text = input.normalize('NFKC');
  text = text.replace(SCRIPT_STYLE, ' ');
  text = text.replace(TAG, ' ');
  text = text.replace(INVISIBLE, '');
  // Neutralize our delimiter so content cannot close its own block or open a new one.
  text = text.replace(DELIMITER, (m) => m.replace('<', String.fromCharCode(0x2039)));
  text = text.replace(ROLE_MARKER, (_m, role: string) => `[${role}]:`);
  text = text
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > cap) text = text.slice(0, cap);
  return text;
}

/** Wrap sanitized untrusted text in the delimiter the system prompts refer to (05 §5). */
export function wrapUntrusted(source: string, id: string, text: string, cap?: number): string {
  const safeSource = source.replace(/[^a-z0-9_-]/gi, '');
  const safeId = id.replace(/[^a-z0-9_.:-]/gi, '');
  return `${UNTRUSTED_OPEN} source="${safeSource}" id="${safeId}">\n${sanitizeUntrusted(text, cap)}\n${UNTRUSTED_CLOSE}`;
}
