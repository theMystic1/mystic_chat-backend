import dotenv from "dotenv";
import path from "path";
import http from "http";
import mongoose from "mongoose";

import app from "./app";
import { attachWebSocketServer } from "./ws/server";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err);
  process.exit(1);
});

// Load env ONCE, as early as possible
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PORT = Number(process.env.PORT ?? 1996);
const HOST = process.env.HOST ?? "0.0.0.0";

const DB = process.env.MONGODB_URL?.replace(
  "<PASSWORD>",
  process.env.MONGODB_PASSWORD ?? "",
);

if (!DB) {
  console.error("Missing MONGODB_URL");
  process.exit(1);
}

mongoose
  .connect(DB)
  .then(() => console.log("DB connection successful!"))
  .catch((err) => {
    console.error("DB connection failed:", err);
    process.exit(1);
  });

// Create HTTP server from express app
const appServer = http.createServer(app);

// Attach WS server to same HTTP server
const {
  broadcastChatCreated,
  wss,
  broadcastMessageCreated,
  broadcastChatUpdated,
} = attachWebSocketServer(appServer);

// (Optional) store it for controllers to use, but strongly type it (see below)
app.locals.broadcastChatCreated = broadcastChatCreated;
app.locals.broadcastMessageCreated = broadcastMessageCreated;
app.locals.broadcastChatUpdated = broadcastChatUpdated;

const server = appServer.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;

  console.log(`Server running on ${baseUrl}`);
  console.log(
    `WebSocket running on ws://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}/ws`,
  );
});

process.on("unhandledRejection", (err: any) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...");
  console.error(err);
  server.close(() => process.exit(1));
});

process.on("SIGTERM", () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully");
  server.close(() => console.log("💥 Process terminated!"));
  // Optional: close ws server too
  wss.close();
});

export default app;
