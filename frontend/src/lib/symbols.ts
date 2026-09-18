/**
 * PSX lists a few instruments under a company's ticker plus a suffix, and the
 * exchange feed carries most of them with no company name at all.
 *
 * The suffixed ex-entitlement tickers (BOPXD while BOP trades ex-dividend,
 * HICLXB ex-bonus, and so on) are the same share for a few days. Rights
 * letters and preference shares are different instruments, but a page about
 * "Javedan Corporation (Pref)" with the ordinary share's template is thin.
 * None of these should rank on their own: the ex-entitlement pages point at
 * the parent, the rest stay out of the index.
 */

const EX_ENTITLEMENT = /^([A-Z0-9]+?)(XD|XB|XR|NC|WU)$/;
const SECONDARY_INSTRUMENT = /\((RIGHT|PREF|PREFERENCE)[^)]*\)/i;

/** Company name shorn of the corporate suffix, for titles with a length budget. */
export function shortName(name: string): string {
  return name.replace(/[\s,]+(Limited|Ltd\.?|Ltd)$/i, "").trim();
}

/**
 * The ordinary share behind an ex-entitlement ticker, or null when the
 * symbol is a plain listing. The feed leaves `name` equal to the symbol for
 * these temporary tickers, which is how they are told apart from a company
 * whose real ticker happens to end in the same letters.
 */
export function parentSymbol(symbol: string, name: string): string | null {
  if (name && name !== symbol) return null;
  const match = EX_ENTITLEMENT.exec(symbol);
  return match ? match[1] : null;
}

/** Rights letters and preference shares, which are not the company's stock. */
export function isSecondaryInstrument(name: string): boolean {
  return SECONDARY_INSTRUMENT.test(name);
}
