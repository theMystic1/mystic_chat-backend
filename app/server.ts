import express, { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";

import app from "./app";
import mongoose from "mongoose";

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
app.use(express.json());

const DB = process.env.MONGODB_URL?.replace(
  "<PASSWORD>",
  process.env?.MONGODB_PASSWORD as string,
);

mongoose
  .connect(DB as string)
  .then(() => console.log("DB connection successful!"));

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hello from TypeScript Express" });
});

const PORT = process.env.PORT || 1996;

const server = app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});

process.on("unhandledRejection", (err: any) => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully");
  server.close(() => {
    console.log("💥 Process terminated!");
  });
});

export default app;
