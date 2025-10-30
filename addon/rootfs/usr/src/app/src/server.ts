import "dotenv/config";

import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import WebSocket, { WebSocketServer } from "ws";

import { createLogger } from "./logger";
import { loadConfig, getConfig } from "./config/options";
import { HomeAssistantClient } from "./services/homeAssistantClient";
import type { ValveController } from "./core/valveManager";
import { ValveManager } from "./core/valveManager";
import { OfflineValveManager } from "./core/offlineValveManager";
import { getDatabasePath, replaceDatabaseWithFile, createDatabaseBackup } from "./services/database";

loadConfig();
const config = getConfig();
const logger = createLogger(config.logLevel);

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());
app.use(express.raw({ type: "application/octet-stream", limit: "200mb" }));

app.use((request: Request, response: Response, next: NextFunction) => {
  const start = Date.now();
  response.on("finish", () => {
    const durationMs = Date.now() - start;
    logger.info(
      {
        method: request.method,
        url: request.originalUrl,
        status: response.statusCode,
        durationMs,
        contentLength: request.headers["content-length"],
      },
      "HTTP request completed",
    );
  });
  next();
});

const clients = new Set<WebSocket>();

const broadcast = async (message: unknown) => {
  const data = JSON.stringify(message);
  for (const client of Array.from(clients)) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    } else {
      clients.delete(client);
    }
  }
};

let valveManager: ValveController;

if (config.token) {
  const haClient = new HomeAssistantClient(config.baseUrl, config.token, logger);
  valveManager = new ValveManager(haClient, logger, broadcast);
} else {
  valveManager = new OfflineValveManager(logger, broadcast);
}

app.get("/api/valves", async (_request: Request, response: Response, next: NextFunction) => {
  try {
    const snapshot = await valveManager.getSnapshot();
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/database/export", async (_request: Request, response: Response, next: NextFunction) => {
  try {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
      logger.warn({ dbPath }, "Database export requested but file missing");
      response.status(404).json({ detail: "Database file not found" });
      return;
    }

    logger.info({ dbPath }, "Streaming database export");
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Disposition", "attachment; filename=luftator.db");
    fs.createReadStream(dbPath)
      .on("error", (error) => next(error))
      .pipe(response);
  } catch (error) {
    next(error);
  }
});

app.post("/api/database/import", async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!request.body || !(request.body instanceof Buffer) || request.body.length === 0) {
      response.status(400).json({ detail: "Request body must be a binary SQLite file" });
      return;
    }

    const buffer = request.body as Buffer;
    if (!buffer.subarray(0, 16).toString("utf-8").includes("SQLite format")) {
      logger.warn({ length: buffer.length }, "Rejected database import: invalid signature");
      response.status(400).json({ detail: "Uploaded file does not appear to be a SQLite database" });
      return;
    }

    logger.info({ size: buffer.length }, "Replacing database from uploaded file");
    await createDatabaseBackup();
    await replaceDatabaseWithFile(buffer);

    logger.info("Database import completed, restarting valve manager");
    await valveManager.stop();
    await valveManager.start();

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/valves/:entityId", async (request: Request, response: Response, next: NextFunction) => {
  const entityId = request.params.entityId;
  if (!entityId) {
    response.status(400).json({ detail: "Missing entityId path parameter" });
    return;
  }

  try {
    const { value } = request.body as { value?: unknown };

    const numericValue = typeof value === "string" ? Number(value) : (value as number | undefined);
    if (numericValue === undefined || Number.isNaN(numericValue)) {
      response.status(400).json({ detail: "Missing or invalid 'value' in payload" });
      return;
    }

    logger.debug({ entityId, value: numericValue }, "Valve value POST received");
    const result = await valveManager.setValue(entityId, Number(numericValue));
    logger.info({ entityId, value: numericValue }, "Valve value updated via API");
    response.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (/Unknown valve/.test(error.message)) {
        logger.warn({ entityId }, "Valve value update failed: unknown valve");
        response.status(404).json({ detail: error.message });
        return;
      }
      if (/Offline mode/.test(error.message)) {
        logger.warn({ entityId }, "Valve value update rejected: offline mode");
        response.status(503).json({ detail: error.message });
        return;
      }
    }
    next(error);
  }
});

const staticRoot = config.staticRoot;
const assetsPath = path.join(staticRoot, "assets");
const indexPath = path.join(staticRoot, "index.html");

if (fs.existsSync(staticRoot)) {
  if (fs.existsSync(assetsPath)) {
    app.use("/assets", express.static(assetsPath, { fallthrough: true }));
  }

  app.get("/", (_request: Request, response: Response, next: NextFunction) => {
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }

    response.sendFile(indexPath);
  });

  app.get(/^(?!\/api\/|\/ws\/|\/assets\/).*/, (_request: Request, response: Response, next: NextFunction) => {
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }

    response.sendFile(indexPath);
  });
}

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  logger.error({ error }, "Unhandled error");
  response.status(500).json({ detail: "Internal server error" });
});

const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws/valves",
});

wss.on("connection", async (socket) => {
  clients.add(socket);
  logger.info({ clientCount: clients.size }, "WebSocket client connected");

  socket.on("close", () => {
    clients.delete(socket);
    logger.info({ clientCount: clients.size }, "WebSocket client disconnected");
  });

  socket.on("error", (error) => {
    logger.warn({ error }, "WebSocket client error");
  });

  try {
    const snapshot = await valveManager.getSnapshot();
    socket.send(
      JSON.stringify({
        type: "snapshot",
        payload: snapshot,
      }),
    );
  } catch (error) {
    logger.error({ error }, "Failed to send initial snapshot to websocket client");
  }
});

const port = config.webPort;
const host = "0.0.0.0";

async function start() {
  await valveManager.start();

  httpServer.listen(port, host, () => {
    logger.info({ port }, "Luftujha backend listening");
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down Luftujha backend");

  wss.close();

  await valveManager.stop();

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });

  process.exit(0);
}

process.on("SIGINT", (signal) => {
  void shutdown(signal.toString());
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal.toString());
});

void start().catch((error) => {
  logger.fatal({ error }, "Failed to start backend");
  process.exit(1);
});
