import { buildCalendar, tokenMatches } from "@/lib/calendar/ics";
import { loadFeedEntries } from "@/lib/calendar/feed";
import { getPrivateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Private calendar feed for the tutor's own calendar app. The unguessable
 * token in the URL is the only credential, so a wrong token is a plain 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { calendarFeedToken } = await getPrivateSettings();
  if (!tokenMatches(token, calendarFeedToken)) return notFound();
  const ics = buildCalendar(await loadFeedEntries());
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="studylabco.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
