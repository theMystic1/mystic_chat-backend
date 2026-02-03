import type {
  ErrorRequestHandler,
  Request,
  Response,
  NextFunction,
} from "express";
import dotenv from "dotenv";
import path from "path";

import AppError from "../utils/app-error";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type AnyObj = Record<string, unknown>;

const isRecord = (x: unknown): x is AnyObj => {
  return typeof x === "object" && x !== null;
};

const hasStringProp = <T extends string>(
  obj: AnyObj,
  key: T,
): obj is AnyObj & Record<T, string> => {
  return typeof obj[key] === "string";
};

const hasNumberProp = <T extends string>(
  obj: AnyObj,
  key: T,
): obj is AnyObj & Record<T, number> => {
  return typeof obj[key] === "number";
};

// ---- Mongoose/Mongo error shape bits we care about ----
type MongooseCastError = {
  name: "CastError";
  path?: string;
  value?: unknown;
};

type MongooseValidationError = {
  name: "ValidationError";
  errors: Record<string, { message: string }>;
};

type MongoDuplicateKeyError = {
  code: 11000;
  keyValue?: Record<string, unknown>;
};

// ---- Handlers ----
const handleCastErrorDB = (err: MongooseCastError) => {
  const path = err.path ?? "field";
  const value = String(err.value);
  return new AppError(`Invalid ${path}: ${value}.`, 400);
};

const handleDuplicateFieldsDB = (err: MongoDuplicateKeyError) => {
  // Prefer keyValue (more reliable than errmsg)
  const keyValue = err.keyValue ?? {};
  const entries = Object.entries(keyValue);

  const valueStr =
    entries.length > 0
      ? `${entries[0][0]}=${JSON.stringify(entries[0][1])}`
      : "duplicate value";

  return new AppError(
    `Duplicate field value: ${valueStr}. Please use another value!`,
    400,
  );
};

const handleValidationErrorDB = (err: MongooseValidationError) => {
  const errors = Object.values(err.errors).map((e) => e.message);
  return new AppError(`Invalid input data. ${errors.join(". ")}`, 400);
};

const handleJWTError = () => {
  return new AppError("Invalid token. Please log in again!", 401);
};

const handleJWTExpiredError = () => {
  return new AppError("Your token has expired! Please log in again.", 401);
};

// ---- Senders ----
const sendErrorDev = (err: AppError, req: Request, res: Response) => {
  if (req.originalUrl.startsWith("/api")) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // If you aren’t rendering views, you can remove this branch
  return res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
};

const sendErrorProd = (err: AppError, req: Request, res: Response) => {
  if (req.originalUrl.startsWith("/api")) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }

    console.error("ERROR 💥", err);
    return res.status(500).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  console.error("ERROR 💥", err);
  return res.status(500).json({
    status: "error",
    message: "Please try again later.",
  });
};

// ---- Main middleware (typed) ----
export const globalErrorHandler: ErrorRequestHandler = (
  err: unknown,
  req,
  res,
  _next,
) => {
  // Normalize to AppError first
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof Error) {
    error = new AppError(err.message || "Internal Server Error", 500);
    error.isOperational = false;
  } else {
    error = new AppError(String(err), 500);
    error.isOperational = false;
  }

  if (process.env.NODE_ENV === "development") {
    return sendErrorDev(error, req, res);
  }

  // Production: map known errors to operational AppErrors
  let mapped: AppError = error;

  if (isRecord(err)) {
    // CastError
    if (hasStringProp(err, "name") && err.name === "CastError") {
      mapped = handleCastErrorDB(err as unknown as MongooseCastError);
    }

    // Mongo duplicate key
    if (hasNumberProp(err, "code") && err.code === 11000) {
      mapped = handleDuplicateFieldsDB(
        err as unknown as MongoDuplicateKeyError,
      );
    }

    // ValidationError
    if (hasStringProp(err, "name") && err.name === "ValidationError") {
      mapped = handleValidationErrorDB(
        err as unknown as MongooseValidationError,
      );
    }

    // JWT errors
    if (hasStringProp(err, "name") && err.name === "JsonWebTokenError") {
      mapped = handleJWTError();
    }
    if (hasStringProp(err, "name") && err.name === "TokenExpiredError") {
      mapped = handleJWTExpiredError();
    }
  }

  return sendErrorProd(mapped, req, res);
};
