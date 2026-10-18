import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { HealthResponse } from "@knowledge/shared";

const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`API server listening on http://localhost:${info.port}`);
});
