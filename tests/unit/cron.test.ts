import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/daily/route";

const url = "http://localhost:3000/api/cron/daily";
const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("cron route", () => {
  it("cron returns 401 without secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await GET(new Request(url, { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is not configured, even for an empty bearer", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request(url, { headers: { authorization: "Bearer " } }))).status).toBe(401);
    expect((await GET(new Request(url, { headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
  });
});
