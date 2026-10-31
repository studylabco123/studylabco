/** Uppercase, strip whitespace, and reinsert a single space before the last 3 characters. */
export function normalisePostcode(pc: string): string {
  const compact = pc.toUpperCase().replace(/\s+/g, "");
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/** Outward code (district) of a postcode; '' if there is none. */
function district(pc: string): string {
  const n = normalisePostcode(pc);
  const i = n.indexOf(" ");
  return i === -1 ? "" : n.slice(0, i);
}

/** True when the outward code exactly matches one of the allowed districts. */
export function isAllowedPostcode(pc: string, districts: string[]): boolean {
  const d = district(pc);
  if (!d) return false;
  return districts.some((x) => x.toUpperCase().replace(/\s+/g, "") === d);
}
