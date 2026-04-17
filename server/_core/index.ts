import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./auth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { seedScenariosIfEmpty } from "../db";
import { assertProductionConfig } from "./productionConfig";
import { ENV } from "./env";
import { isLocalStorageEnabled } from "../storage";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  assertProductionConfig();

  const app = express();
  const server = createServer(app);
  app.set("trust proxy", ENV.isProduction ? "loopback" : false);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  if (isLocalStorageEnabled()) {
    app.use(
      "/api/storage",
      express.static(ENV.localStorageDir, {
        fallthrough: false,
        immutable: true,
        maxAge: "1h",
      })
    );
  }

  registerAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Seed default scenarios if the database is empty (non-blocking)
  seedScenariosIfEmpty().catch(err =>
    console.warn("[Startup] Could not seed scenarios:", err)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
