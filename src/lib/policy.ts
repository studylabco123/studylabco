/** Version of the Terms, Refund Policy and Privacy Policy that consents are recorded against. */
export const POLICY_VERSION = "2026-11-01";

/** How long a block booking's seats are held while the parent pays (written to block_bookings.hold_expires_at). */
export const BLOCK_HOLD_HOURS = 72;

/** The booking window as parents read it: "4 weeks" when it is whole weeks, else "30 days". */
export function bookingWindowText(days: number): string {
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return days === 1 ? "1 day" : `${days} days`;
}
