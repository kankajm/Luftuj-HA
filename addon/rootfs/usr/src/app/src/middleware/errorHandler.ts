import type { Request, Response, NextFunction } from "express";
import type { Logger } from "pino";

export function createErrorHandler(logger: Logger) {
  return function errorHandler(
    error: Error,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ): void {
    void _next;
    logger.error({ error }, "Unhandled error");
    response.status(500).json({ detail: "Internal server error" });
  };
}
