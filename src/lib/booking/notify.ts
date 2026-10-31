import "server-only";

/**
 * Hook for booking emails (Task 11). The booking services call it once per
 * successful request with every booking id it created. A no-op for now.
 */
export async function onBookingCreated(bookingIds: string[]): Promise<void> {
  void bookingIds;
}

/**
 * Hook for the cancellation emails (Task 11). Called once after a parent
 * cancels a booking. A no-op for now.
 */
export async function onBookingCancelled(
  bookingId: string,
  outcome: "free" | "late",
): Promise<void> {
  void bookingId;
  void outcome;
}
