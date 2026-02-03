class AppError extends Error {
  statusCode: number;
  status: "fail" | "error";
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;

    this.statusCode = statusCode;
    this.status = String(statusCode).startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    // Node/V8: capture stack trace if available
    Error.captureStackTrace?.(this, new.target);
  }
}

export default AppError;
