/** The token the Turnstile widget puts in the form, or undefined when there is none. */
export function turnstileToken(formData: FormData): string | undefined {
  const v = formData.get("cf-turnstile-response");
  return typeof v === "string" && v ? v : undefined;
}
