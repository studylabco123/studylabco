import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { asAnon, asUser, closeDb, createUser, db, resetData } from "./setup";

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

async function insertChild(parentId: string, year: number, level: string, board: string | null = null, tier: string | null = null) {
  return db.query(
    `insert into children (parent_id, first_name, last_name, school_year, level, exam_board, tier, subjects)
     values ($1, 'Sam', 'Test', $2, $3, $4, $5, '{Combined Science}')`,
    [parentId, year, level, board, tier],
  );
}

beforeEach(resetData);
afterAll(closeDb);

describe("v2 settings seed", () => {
  test("seed has KS3 prices 750/2000/1400 and pass prices 7900/12600/10200/16200", async () => {
    const { rows } = await db.query(
      "select price_ks3_assessment_pence a, price_ks3_one_to_one_pence o, price_ks3_group_pence g, pass_prices p from settings",
    );
    expect(rows[0]).toMatchObject({ a: 750, o: 2000, g: 1400 });
    expect(rows[0].p).toEqual({ KS3: { "6": 7900, "10": 12600 }, GCSE: { "6": 10200, "10": 16200 } });
  });

  test("lateFeePercent 50, passValidityMonths 6, passMinNoticeDays 7", async () => {
    const { rows } = await db.query("select late_fee_percent l, pass_validity_months v, pass_min_notice_days n from settings");
    expect(rows[0]).toEqual({ l: 50, v: 6, n: 7 });
  });

  test("owner_name is Abdullah Chopdat", async () => {
    const { rows } = await db.query("select owner_name from settings");
    expect(rows[0].owner_name).toBe("Abdullah Chopdat");
  });

  test("Saturday series is KS3 Years 7–9 at 1400", async () => {
    const { rows } = await db.query("select title, level, year_group, price_pence from group_series where product = 'saturday'");
    expect(rows).toEqual([{ title: "Saturday KS3 Science Group", level: "KS3", year_group: "Years 7–9", price_pence: 1400 }]);
  });

  test("generated Saturday sessions inherit the KS3 level and price", async () => {
    await db.query("select ensure_group_sessions(current_date + 30)");
    const { rows } = await db.query("select distinct s.level, s.price_pence from group_sessions s join group_series r on r.id = s.series_id where r.product = 'saturday'");
    expect(rows).toEqual([{ level: "KS3", price_pence: 1400 }]);
  });
});

describe("children level rules", () => {
  test("Year 7 GCSE child rejected; Year 11 KS3 rejected; Year 9 either accepted", async () => {
    const { id } = await createUser();
    expect(await errorCode(insertChild(id, 7, "GCSE", "AQA", "Higher"))).toBe("23514");
    expect(await errorCode(insertChild(id, 11, "KS3"))).toBe("23514");
    expect(await errorCode(insertChild(id, 6, "KS3"))).toBe("23514");
    expect(await errorCode(insertChild(id, 12, "GCSE", "AQA", "Higher"))).toBe("23514");
    await expect(insertChild(id, 9, "KS3")).resolves.toBeDefined();
    await expect(insertChild(id, 9, "GCSE", "AQA", "Higher")).resolves.toBeDefined();
  });

  test("GCSE child requires exam board and tier; KS3 child may omit them", async () => {
    const { id } = await createUser();
    expect(await errorCode(insertChild(id, 10, "GCSE"))).toBe("23514");
    expect(await errorCode(insertChild(id, 10, "GCSE", "AQA", null))).toBe("23514");
    expect(await errorCode(insertChild(id, 10, "GCSE", null, "Higher"))).toBe("23514");
    await expect(insertChild(id, 8, "KS3")).resolves.toBeDefined();
  });

  test("level defaults to GCSE", async () => {
    const { id } = await createUser();
    await db.query(
      `insert into children (parent_id, first_name, last_name, school_year, exam_board, tier, subjects)
       values ($1, 'A', 'B', 10, 'AQA', 'Higher', '{Biology}')`,
      [id],
    );
    const { rows } = await db.query("select level from children");
    expect(rows[0].level).toBe("GCSE");
  });
});

describe("passes", () => {
  test("parent reads own passes only; anon none", async () => {
    const a = await createUser();
    const b = await createUser();
    await db.query("insert into passes (parent_id, level, sessions_total, price_pence, status) values ($1, 'GCSE', 6, 10200, 'awaiting_payment'), ($2, 'KS3', 10, 12600, 'active')", [a.id, b.id]);
    const own = await asUser(a.id).query("select parent_id, payment_reference from passes");
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].parent_id).toBe(a.id);
    expect(own.rows[0].payment_reference).toMatch(/^SLC-\d+$/);
    expect(await errorCode(asAnon().query("select * from passes"))).toBe("42501");
  });

  test("parents cannot write passes; constraints hold", async () => {
    const a = await createUser();
    expect(await errorCode(asUser(a.id).query("insert into passes (parent_id, level, sessions_total, price_pence, status) values ($1, 'GCSE', 6, 1, 'active')", [a.id]))).toBeDefined();
    expect(await errorCode(db.query("insert into passes (parent_id, level, sessions_total, price_pence, status) values ($1, 'GCSE', 7, 1, 'active')", [a.id]))).toBe("23514");
    expect(await errorCode(db.query("insert into passes (parent_id, level, sessions_total, price_pence, status) values ($1, 'GCSE', 6, 1, 'bogus')", [a.id]))).toBe("23514");
  });

  test("bookings and ledger can reference a pass; bookings carry a nullable fee", async () => {
    const a = await createUser();
    const { rows } = await db.query("insert into passes (parent_id, level, sessions_total, price_pence, status) values ($1, 'GCSE', 6, 10200, 'active') returning id", [a.id]);
    const cols = await db.query(
      "select table_name, column_name, is_nullable from information_schema.columns where table_schema='public' and ((table_name='bookings' and column_name in ('pass_id','fee_pence')) or (table_name='ledger' and column_name='pass_id'))",
    );
    expect(cols.rows).toHaveLength(3);
    expect(cols.rows.every((r) => r.is_nullable === "YES")).toBe(true);
    await db.query("insert into ledger (pass_id, parent_id, kind, amount_pence, occurred_on) values ($1, $2, 'payment', 10200, '2026-11-01')", [rows[0].id, a.id]);
  });
});
