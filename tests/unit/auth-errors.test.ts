import { describe, expect, test, vi } from "vitest";
import { CAPTCHA_MESSAGE, RATE_LIMIT_MESSAGE, commonAuthMessage } from "@/lib/auth/errors";
import { mountTurnstile, type TurnstileApi } from "@/lib/auth/turnstile-widget";

describe("commonAuthMessage", () => {
  test("captcha_failed asks for the security check again", () => {
    expect(commonAuthMessage({ code: "captcha_failed", status: 400 })).toBe("Please complete the security check again.");
    expect(CAPTCHA_MESSAGE).toBe("Please complete the security check again.");
  });
  test("429 maps to the rate limit message", () => {
    expect(commonAuthMessage({ status: 429 })).toBe(RATE_LIMIT_MESSAGE);
  });
  test("other errors fall through to the caller", () => {
    expect(commonAuthMessage({ code: "invalid_credentials", status: 400 })).toBeUndefined();
  });
});

describe("mountTurnstile", () => {
  function setup() {
    let options!: Parameters<TurnstileApi["render"]>[1];
    const api: TurnstileApi = {
      render: vi.fn((_el, o) => {
        options = o;
        return "w1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const tokens: string[] = [];
    const widget = mountTurnstile(api, {} as HTMLElement, "site", (t) => tokens.push(t));
    return { api, tokens, widget, options: () => options };
  }
  test("stores the token from the widget and clears it on expiry or error", () => {
    const { tokens, options } = setup();
    options().callback("tok1");
    options()["expired-callback"]();
    options()["error-callback"]();
    expect(tokens).toEqual(["tok1", "", ""]);
  });
  test("reset clears the spent token and resets the Cloudflare widget", () => {
    const { api, tokens, widget } = setup();
    widget.reset();
    expect(tokens).toEqual([""]);
    expect(api.reset).toHaveBeenCalledWith("w1");
  });
  test("remove takes the Cloudflare widget out of the page", () => {
    const { api, widget } = setup();
    widget.remove();
    expect(api.remove).toHaveBeenCalledWith("w1");
  });
});
