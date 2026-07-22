import { app } from "./api/app";

export default {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  fetch: app.fetch,
};
