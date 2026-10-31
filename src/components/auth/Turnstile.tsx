"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { mountTurnstile, type TurnstileApi } from "@/lib/auth/turnstile-widget";

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile widget. Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is set. The token lives in a hidden `cf-turnstile-response` input that server
 * actions read with turnstileToken(). Tokens are single use, so pass `resetSignal`
 * (e.g. the action state): whenever it changes after a submit the widget is reset
 * and a fresh token is obtained.
 */
export function Turnstile({ resetSignal }: { resetSignal?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<ReturnType<typeof mountTurnstile> | null>(null);
  const [token, setToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);

  const mount = useCallback(() => {
    if (!siteKey || widget.current || !container.current || !window.turnstile) return;
    widget.current = mountTurnstile(window.turnstile, container.current, siteKey, setToken);
  }, [siteKey]);

  useEffect(() => {
    if (scriptReady || window.turnstile) mount();
  }, [scriptReady, mount]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    widget.current?.reset();
  }, [resetSignal]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={container} />
      <input type="hidden" name="cf-turnstile-response" value={token} readOnly />
    </>
  );
}
