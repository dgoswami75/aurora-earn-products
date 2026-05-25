import { Response } from "express";
import { StructuredError } from "./domain/types";

export const ErrorCodes = {
  INVALID_TIER: "INVALID_TIER",
  DATA_UNAVAILABLE: "DATA_UNAVAILABLE",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export function sendError(
  res: Response,
  httpStatus: number,
  code: ErrorCode,
  message: string,
): void {
  const body: StructuredError = { error: { code, message } };
  res.status(httpStatus).json(body);
}
