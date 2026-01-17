import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { Logger } from "pino";
import type { ValveController } from "../core/valveManager";

export function createValvesRouter(valveManager: ValveController, logger: Logger) {
  const router = Router();

  router.get("/", async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const snapshot = await valveManager.getSnapshot();
      response.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:entityId", async (request: Request, response: Response, next: NextFunction) => {
    const entityId = request.params.entityId;
    if (!entityId) {
      response.status(400).json({ detail: "Missing entityId path parameter" });
      return;
    }

    try {
      const { value } = request.body as { value?: unknown };

      const numericValue =
        typeof value === "string" ? Number(value) : (value as number | undefined);
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

  return router;
}
