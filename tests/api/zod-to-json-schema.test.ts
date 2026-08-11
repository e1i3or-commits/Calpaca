import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { isOptional, zodToJsonSchema } from "../../src/api/zod-to-json-schema";

describe("zodToJsonSchema", () => {
  test("carries string constraints the server actually enforces", () => {
    expect(zodToJsonSchema(z.string().min(1).max(80).regex(/^[a-z0-9-]+$/))).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 80,
      pattern: "^[a-z0-9-]+$",
    });
  });

  test("maps string formats", () => {
    expect(zodToJsonSchema(z.string().uuid())).toMatchObject({ format: "uuid" });
    expect(zodToJsonSchema(z.string().email())).toMatchObject({ format: "email" });
    expect(zodToJsonSchema(z.string().url())).toMatchObject({ format: "uri" });
    expect(zodToJsonSchema(z.string().datetime())).toMatchObject({ format: "date-time" });
  });

  test("distinguishes integers from numbers and keeps bounds", () => {
    expect(zodToJsonSchema(z.number().int().min(5).max(480))).toEqual({
      type: "integer",
      minimum: 5,
      maximum: 480,
    });
    expect(zodToJsonSchema(z.number().min(0))).toEqual({ type: "number", minimum: 0 });
  });

  test("arrays keep their item schema and length bounds", () => {
    expect(zodToJsonSchema(z.array(z.string().uuid()).min(1).max(50))).toEqual({
      type: "array",
      items: { type: "string", format: "uuid" },
      minItems: 1,
      maxItems: 50,
    });
  });

  test("objects list required keys and exclude optional ones", () => {
    const schema = z.object({
      start: z.string(),
      notes: z.string().optional(),
      capacity: z.number().int().default(1),
    });
    const json = zodToJsonSchema(schema);
    expect(json).toMatchObject({ type: "object", additionalProperties: false });
    expect((json.required as string[]).sort()).toEqual(["start"]);
    expect(json.properties).toMatchObject({
      start: { type: "string" },
      notes: { type: "string" },
      capacity: { type: "integer", default: 1 },
    });
  });

  test("enums and literals become closed value sets", () => {
    expect(zodToJsonSchema(z.enum(["solo", "round_robin", "group"]))).toEqual({
      type: "string",
      enum: ["solo", "round_robin", "group"],
    });
    expect(zodToJsonSchema(z.literal(true))).toEqual({ const: true });
  });

  // OpenAPI 3.1 dropped the `nullable` keyword, so a nullable field has to be
  // expressed as a union of types.
  test("nullable becomes a type union, not a nullable keyword", () => {
    expect(zodToJsonSchema(z.string().nullable())).toEqual({ type: ["string", "null"] });
    expect(zodToJsonSchema(z.string().max(10).nullable())).toEqual({
      anyOf: [{ type: "string", maxLength: 10 }, { type: "null" }],
    });
  });

  test("unions, records, and intersections keep their structure", () => {
    expect(zodToJsonSchema(z.union([z.string(), z.number()]))).toEqual({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
    expect(zodToJsonSchema(z.record(z.string(), z.object({ k: z.string() })))).toMatchObject({
      type: "object",
      additionalProperties: { type: "object" },
    });
  });

  // A refinement's predicate cannot be expressed in JSON Schema; losing the
  // inner shape as well would be much worse than losing the predicate.
  test("refined and transformed schemas keep their inner shape", () => {
    const refined = z.object({ start: z.string(), end: z.string() })
      .refine((value) => value.start < value.end);
    expect(zodToJsonSchema(refined)).toMatchObject({
      type: "object",
      properties: { start: { type: "string" }, end: { type: "string" } },
    });
  });

  test("nested optional-inside-refined objects still report optionality", () => {
    expect(isOptional(z.string().optional())).toBe(true);
    expect(isOptional(z.string().default("x"))).toBe(true);
    expect(isOptional(z.string().nullable().optional())).toBe(true);
    expect(isOptional(z.string().nullable())).toBe(false);
    expect(isOptional(z.string())).toBe(false);
  });

  // Producing an empty schema is a documentation gap; throwing would take
  // /openapi.json down with it.
  test("an unsupported type degrades to a permissive schema instead of throwing", () => {
    expect(zodToJsonSchema(z.any())).toEqual({});
    expect(zodToJsonSchema(z.unknown())).toEqual({});
    expect(() => zodToJsonSchema(z.function() as never)).not.toThrow();
  });

  test("a realistic booking body converts whole", () => {
    const body = z.object({
      slotStart: z.string().datetime(),
      eventTypeSlug: z.string().min(1).max(80),
      hosts: z.array(z.string().uuid()).min(1).max(20).optional(),
      invitee: z.object({
        name: z.string().trim().min(1).max(100),
        email: z.string().email(),
        timezone: z.string(),
        notes: z.string().max(2000).optional(),
      }),
      answers: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
      guests: z.array(z.string().email()).max(10).default([]),
    });
    const json = zodToJsonSchema(body);
    expect((json.required as string[]).sort()).toEqual(["eventTypeSlug", "invitee", "slotStart"]);
    const properties = json.properties as Record<string, Record<string, unknown>>;
    expect(properties.slotStart).toMatchObject({ format: "date-time" });
    expect(properties.guests).toMatchObject({ type: "array", maxItems: 10, default: [] });
    const invitee = properties.invitee as { required: string[] };
    expect(invitee.required.sort()).toEqual(["email", "name", "timezone"]);
  });
});
