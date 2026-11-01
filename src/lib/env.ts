/**
 * True in a real production deployment. The e2e suite runs a production build
 * locally with E2E_HARNESS=1; that switch is ignored on Vercel (VERCEL is set
 * on every Vercel build and function), so a stray E2E_HARNESS there cannot
 * relax production behaviour (review I4, Minor 7).
 */
export function isRealProduction(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const harness = process.env.E2E_HARNESS === "1" && !process.env.VERCEL;
  return !harness;
}
