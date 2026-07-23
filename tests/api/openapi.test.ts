import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "../../src/api/app";
import {
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
