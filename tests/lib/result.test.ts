import { describe, expect, test } from "bun:test";
import { andThen, err, isErr, isOk, map, ok, unwrapOr, type Result } from "../../src/lib/result";

describe("ok/err", () => {
  test("ok wraps a value as a success result", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  test("err wraps a value as a failure result", () => {
    const result = err("bad");
    expect(result).toEqual({ ok: false, error: "bad" });
  });
});

describe("isOk/isErr", () => {
  test("isOk is true for ok, false for err", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err("e"))).toBe(false);
  });

  test("isErr is true for err, false for ok", () => {
    expect(isErr(err("e"))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });
});

describe("map", () => {
  test("applies the function on ok", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 });
  });

  test("passes through err unchanged", () => {
    const result = err<string, number>("bad");
    expect(map(result, (n) => n * 2)).toEqual({ ok: false, error: "bad" });
  });
});

describe("andThen", () => {
  const halve = (n: number): Result<number, string> => (n % 2 === 0 ? ok(n / 2) : err("odd"));

  test("chains ok results", () => {
    expect(andThen(ok(4), halve)).toEqual({ ok: true, value: 2 });
  });

  test("short-circuits on err", () => {
    const result = err<string, number>("initial failure");
    expect(andThen(result, halve)).toEqual({ ok: false, error: "initial failure" });
  });

  test("propagates a new err from the chained function", () => {
    expect(andThen(ok(3), halve)).toEqual({ ok: false, error: "odd" });
  });
});

describe("unwrapOr", () => {
  test("returns the value for ok", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
  });

  test("returns the fallback for err", () => {
    expect(unwrapOr(err("bad"), 0)).toBe(0);
  });
});
