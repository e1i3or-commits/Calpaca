import type { ZodTypeAny } from "zod";

/**
 * Converts the Zod v3 schemas that define this API into JSON Schema for the
 * OpenAPI document, so the published contract carries the same constraints the
 * server actually enforces instead of `additionalProperties: true`.
 *
 * Why hand-rolled: the route files use Zod's classic (v3) API, and the
 * `z.toJSONSchema` shipped under `zod/v4` reads v4 internals only — handed a v3
 * schema it dies on `schema._zod.def`. Migrating ~20 route files, `bookings.ts`
 * among them, to change how documentation is generated is not a trade worth
 * making. This walks `_def` instead.
 *
 * Scope is deliberately the subset this API uses. Anything unrecognized becomes
 * a permissive `{}` rather than throwing: a gap in the reference is a
 * documentation bug, while a throw here would take down `/openapi.json`. Nothing
 * in this file participates in request validation, so a mistake can only ever
 * produce wrong docs, never wrong behavior.
 */

export type JsonSchema = Record<string, unknown>;

type Def = {
  typeName: string;
  checks?: { kind: string; value?: unknown; regex?: RegExp }[];
  [key: string]: unknown;
};

function def(schema: ZodTypeAny): Def {
  return (schema as unknown as { _def: Def })._def;
}

function stringSchema(node: Def): JsonSchema {
  const out: JsonSchema = { type: "string" };
  for (const check of node.checks ?? []) {
    switch (check.kind) {
      case "min": out.minLength = check.value; break;
      case "max": out.maxLength = check.value; break;
      case "length": out.minLength = check.value; out.maxLength = check.value; break;
      case "regex": out.pattern = check.regex?.source; break;
      case "email": out.format = "email"; break;
      case "url": out.format = "uri"; break;
      case "uuid": out.format = "uuid"; break;
      case "datetime": out.format = "date-time"; break;
      case "date": out.format = "date"; break;
      default: break;
    }
  }
  return out;
}

function numberSchema(node: Def): JsonSchema {
  const out: JsonSchema = { type: "number" };
  for (const check of node.checks ?? []) {
    switch (check.kind) {
      case "int": out.type = "integer"; break;
      case "min": out.minimum = check.value; break;
      case "max": out.maximum = check.value; break;
      default: break;
    }
  }
  return out;
}

/** `.nullable()` becomes a two-branch type rather than JSON Schema's nullable
 * keyword, which OpenAPI 3.1 dropped. */
function nullable(inner: JsonSchema): JsonSchema {
  if (typeof inner.type === "string" && Object.keys(inner).length === 1) {
    return { type: [inner.type, "null"] };
  }
  return { anyOf: [inner, { type: "null" }] };
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const node = def(schema);
  switch (node.typeName) {
    case "ZodString":
      return stringSchema(node);
    case "ZodNumber":
      return numberSchema(node);
    case "ZodBigInt":
      return { type: "integer" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodDate":
      return { type: "string", format: "date-time" };
    case "ZodLiteral":
      return { const: node.value };
    case "ZodNull":
      return { type: "null" };
    case "ZodEnum":
      return { type: "string", enum: [...(node.values as string[])] };
    case "ZodNativeEnum":
      return { enum: Object.values(node.values as Record<string, unknown>) };
    case "ZodArray": {
      const out: JsonSchema = {
        type: "array",
        items: zodToJsonSchema(node.type as ZodTypeAny),
      };
      const min = node.minLength as { value: number } | null;
      const max = node.maxLength as { value: number } | null;
      if (min) out.minItems = min.value;
      if (max) out.maxItems = max.value;
      return out;
    }
    case "ZodTuple":
      return {
        type: "array",
        prefixItems: (node.items as ZodTypeAny[]).map(zodToJsonSchema),
      };
    case "ZodObject": {
      const shape = (node.shape as () => Record<string, ZodTypeAny>)();
      const properties: JsonSchema = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isOptional(value)) required.push(key);
      }
      const out: JsonSchema = { type: "object", properties };
      if (required.length > 0) out.required = required;
      // Zod strips unknown keys by default, so the documented contract says so.
      if (node.unknownKeys === "strip" || node.unknownKeys === "strict") {
        out.additionalProperties = false;
      }
      return out;
    }
    case "ZodRecord":
      return {
        type: "object",
        additionalProperties: zodToJsonSchema(node.valueType as ZodTypeAny),
      };
    case "ZodUnion":
      return { anyOf: (node.options as ZodTypeAny[]).map(zodToJsonSchema) };
    case "ZodDiscriminatedUnion":
      return {
        anyOf: [...(node.options as ZodTypeAny[])].map(zodToJsonSchema),
        ...(typeof node.discriminator === "string"
          ? { discriminator: { propertyName: node.discriminator } }
          : {}),
      };
    case "ZodIntersection":
      return {
        allOf: [
          zodToJsonSchema(node.left as ZodTypeAny),
          zodToJsonSchema(node.right as ZodTypeAny),
        ],
      };
    case "ZodNullable":
      return nullable(zodToJsonSchema(node.innerType as ZodTypeAny));
    case "ZodOptional":
      // Optionality is expressed by the parent's `required` list, not here.
      return zodToJsonSchema(node.innerType as ZodTypeAny);
    case "ZodDefault": {
      const inner = zodToJsonSchema(node.innerType as ZodTypeAny);
      try {
        return { ...inner, default: (node.defaultValue as () => unknown)() };
      } catch {
        return inner;
      }
    }
    case "ZodCatch":
      return zodToJsonSchema(node.innerType as ZodTypeAny);
    // .refine()/.superRefine()/.transform() wrap a schema in ZodEffects. The
    // predicate cannot be expressed in JSON Schema, so the inner shape stands
    // and the human-readable constraint belongs in the operation summary.
    case "ZodEffects":
      return zodToJsonSchema(node.schema as ZodTypeAny);
    case "ZodPipeline":
      return zodToJsonSchema(node.in as ZodTypeAny);
    case "ZodLazy":
      return zodToJsonSchema((node.getter as () => ZodTypeAny)());
    case "ZodReadonly":
      return zodToJsonSchema(node.innerType as ZodTypeAny);
    default:
      return {};
  }
}

/** Optional, defaulted, and catch-wrapped fields are all absent-permitted. */
export function isOptional(schema: ZodTypeAny): boolean {
  const node = def(schema);
  if (node.typeName === "ZodOptional" || node.typeName === "ZodDefault") return true;
  if (node.typeName === "ZodCatch") return true;
  if (node.typeName === "ZodEffects") return isOptional(node.schema as ZodTypeAny);
  if (node.typeName === "ZodNullable") return isOptional(node.innerType as ZodTypeAny);
  return false;
}
