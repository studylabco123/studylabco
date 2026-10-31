/** Minimal slice of Cloudflare's window.turnstile API that we use. */
export interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId?: string): void;
}

/**
 * Renders the widget explicitly and reports each token (or "" when it expires,
 * errors or is reset). Tokens are single use: call reset() after every submit
 * that returned an error so the next submit carries a fresh token.
 */
export function mountTurnstile(api: TurnstileApi, el: HTMLElement, siteKey: string, onToken: (t: string) => void) {
  const id = api.render(el, {
    sitekey: siteKey,
    callback: (t) => onToken(t),
    "expired-callback": () => onToken(""),
    "error-callback": () => onToken(""),
  });
  return {
    reset() {
      onToken("");
      api.reset(id);
    },
  };
}
