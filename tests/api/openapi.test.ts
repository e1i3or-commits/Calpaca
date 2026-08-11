import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "../../src/api/app";
import {
  documentedRequestSchemas,
  generateOpenApiDocument,
  openApiJson,
  openApiOperations,
} from "../../src/api/openapi";

const root = join(import.meta.dir, "../..");

function declaredRoutes(): string[] {
  const files = [
    join(root, "src/api/app.ts"),
    join(root, "src/api/openapi.ts"),
    ...readdirSync(join(root, "src/api/routes"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(root, "src/api/routes", name)),
  ];
  const routes: string[] = [];
  const pattern = /(?:\b(?:app|router|routes|webhookRoutes)\.|^\s*\.)(get|post|put|patch|delete)\("([^"]+)"/gm;
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
      const path = match[2]!.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      if (path !== "/api-docs") routes.push(`${match[1]} ${path}`);
    }
  }
  return routes.sort();
}

describe("OpenAPI reference", () => {
  test("serves an OpenAPI 3.1 document and searchable reference", async () => {
    const document = generateOpenApiDocument();
    expect(document.openapi).toBe("3.1.0");
    const operationCount = Object.values(document.paths)
      .reduce((count, operations) => count + Object.keys(operations).length, 0);
    expect(operationCount).toBe(openApiOperations.length);

    const jsonResponse = await app.request("/openapi.json");
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual(document);

    const htmlResponse = await app.request("/api-docs");
    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain("Search endpoints");
  });

  test("tracks every declared application route", () => {
    const documented = openApiOperations
      .map(([method, path]) => `${method} ${path}`)
      .sort();
    expect(documented).toEqual(declaredRoutes());
  });

  test("keeps the checked-in document generated", () => {
    expect(readFileSync(join(root, "docs/openapi.json"), "utf8")).toBe(openApiJson());
  });
});

describe("documented request schemas", () => {
  test("every named schema is generated from a validator, not a placeholder", () => {
    const document = generateOpenApiDocument();
    const schemas = document.components.schemas as Record<string, Record<string, unknown>>;
    for (const name of Object.keys(documentedRequestSchemas)) {
      const schema = schemas[`${name}Request`];
      expect(schema).toBeDefined();
      expect(schema!.type).toBe("object");
      // A placeholder would have no properties and permit anything.
      expect(Object.keys(schema!.properties as object).length).toBeGreaterThan(0);
      expect(schema!.additionalProperties).toBe(false);
    }
  });

  test("operations with a documented body reference it instead of a permissive object", () => {
    const document = generateOpenApiDocument();
    let referenced = 0;
    for (const [, path, , , , requestSchema] of openApiOperations) {
      if (!requestSchema) continue;
      const operations = document.paths[path] as Record<string, {
        requestBody?: { content: { "application/json": { schema: Record<string, unknown> } } };
      }>;
      for (const operation of Object.values(operations)) {
        const schema = operation.requestBody?.content["application/json"].schema;
        if (!schema?.$ref) continue;
        expect(schema.$ref).toBe(`#/components/schemas/${requestSchema}Request`);
        referenced += 1;
      }
    }
    // Guards against the registry silently losing its schema column.
    expect(referenced).toBeGreaterThanOrEqual(11);
  });

  // The point of generating from the validator: the two cannot disagree.
  test("the documented booking body matches what the validator requires", () => {
    const schemas = generateOpenApiDocument().components.schemas as Record<
      string,
      { required?: string[] }
    >;
    const documented = [...(schemas.BookingRequest!.required ?? [])].sort();
    const parsed = documentedRequestSchemas.Booking.safeParse({});
    expect(parsed.success).toBe(false);
    const missing = parsed.success
      ? []
      : [...new Set(parsed.error.issues
          .filter((issue) => issue.code === "invalid_type" && issue.path.length === 1)
          .map((issue) => String(issue.path[0])))].sort();
    expect(documented).toEqual(missing);
  });
});
