import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSchedulerMcpServer } from "./server";

const server = createSchedulerMcpServer({
  baseUrl: process.env.SCHEDULER_API_URL ?? "http://localhost:3000",
  fetch,
});

await server.connect(new StdioServerTransport());
