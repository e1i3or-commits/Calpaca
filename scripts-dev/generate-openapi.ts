import { openApiJson } from "../src/api/openapi";

await Bun.write("docs/openapi.json", openApiJson());
console.log("Generated docs/openapi.json");
