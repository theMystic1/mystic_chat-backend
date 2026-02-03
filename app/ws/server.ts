import type { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Chat } from "../models/chat.schema";

/** JSON-safe value types */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];

/** Strict DTOs */
export type ChatDTO = {
  id: string;
  type: "dm" | "group";
  members: string[];
  createdAt?: string;
};

export type MessageDTO = {
  id: string;
  chatId: string;
  senderId: string;
  type: "text" | "image" | "file" | "system";
  text?: string;
  createdAt?: string;
  // optional for image/file:
  attachments?: { kind: "image" | "file"; url: string }[];
};

/** Server->client event types */
export type ServerEvent =
  | { type: "welcome"; data: string }
  | { type: "auth_ok"; data: { userId: string } }
  | { type: "auth_error"; data: string }
  | { type: "joined_chat"; data: { chatId: string } }
  | { type: "join_denied"; data: { chatId: string; reason: string } }
  | { type: "left_chat"; data: { chatId: string } }
  | { type: "chat_created"; data: ChatDTO }
  | { type: "message_sent"; data: MessageDTO };

/** Client->server event types */
type ClientEvent =
  | { type: "auth"; token: string }
  | { type: "join_chat"; chatId: string }
  | { type: "leave_chat"; chatId: string };

type AliveSocket = WebSocket & {
  isAlive?: boolean;
  userId?: string; // authenticated userId (string)
  subs?: Set<string>; // chatIds
};

type AuthedSocket = WebSocket & {
  userId?: string;
};

const sendJson = (socket: WebSocket, payload: ServerEvent): void => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

/**
 * PubSub topics:
 * - chatId -> sockets subscribed to that chat
 */
const chatSubs = new Map<string, Set<AliveSocket>>();

const subscribe = (socket: AliveSocket, chatId: string) => {
  if (!socket.subs) socket.subs = new Set();
  socket.subs.add(chatId);

  const set = chatSubs.get(chatId) ?? new Set<AliveSocket>();
  set.add(socket);
  chatSubs.set(chatId, set);
};

const unsubscribe = (socket: AliveSocket, chatId: string) => {
  socket.subs?.delete(chatId);
  const set = chatSubs.get(chatId);
  if (!set) return;

  set.delete(socket);
  if (set.size === 0) chatSubs.delete(chatId);
};

const cleanupSocket = (socket: AliveSocket) => {
  if (!socket.subs) return;
  for (const chatId of socket.subs) {
    unsubscribe(socket, chatId);
  }
  socket.subs.clear();
};

const publishToChat = (chatId: string, event: ServerEvent) => {
  const set = chatSubs.get(chatId);
  if (!set || set.size === 0) return;

  const data = JSON.stringify(event);
  for (const client of set) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(data);
  }
};

const parseClientEvent = (raw: WebSocket.RawData): ClientEvent | null => {
  try {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") return null;

    if (obj.type === "auth" && typeof obj.token === "string") return obj;
    if (obj.type === "join_chat" && typeof obj.chatId === "string") return obj;
    if (obj.type === "leave_chat" && typeof obj.chatId === "string") return obj;

    return null;
  } catch {
    return null;
  }
};

const verifyJwt = (token: string): { id: string } => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");

  const decoded = jwt.verify(token, secret) as any;
  const id = decoded?.id ?? decoded?._id ?? decoded?.sub;
  if (!id || typeof id !== "string") throw new Error("Invalid token payload");
  return { id };
};

export const attachWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", (socket: AliveSocket) => {
    socket.isAlive = true;
    socket.subs = new Set();

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    sendJson(socket, { type: "welcome", data: "welcome to mystChats" });

    socket.on("message", async (raw) => {
      const evt = parseClientEvent(raw);
      if (!evt) return;

      // 1) AUTH
      if (evt.type === "auth") {
        try {
          const { id } = verifyJwt(evt.token);
          socket.userId = id;
          sendJson(socket, { type: "auth_ok", data: { userId: id } });
        } catch (e: any) {
          sendJson(socket, {
            type: "auth_error",
            data: e?.message ?? "Auth failed",
          });
          socket.terminate();
        }
        return;
      }

      // Must be authed for join/leave
      if (!socket.userId) {
        sendJson(socket, { type: "auth_error", data: "Authenticate first" });
        socket.terminate();
        return;
      }

      // 2) JOIN CHAT (subscribe) with membership check
      if (evt.type === "join_chat") {
        const chatId = evt.chatId;

        if (!Types.ObjectId.isValid(chatId)) {
          sendJson(socket, {
            type: "join_denied",
            data: { chatId, reason: "Invalid chatId" },
          });
          return;
        }

        let chat;
        try {
          chat = await Chat.findById(chatId).select("members").lean();
        } catch (err) {
          sendJson(socket, {
            type: "join_denied",
            data: { chatId, reason: "Server error" },
          });
          return;
        }

        if (!chat) {
          sendJson(socket, {
            type: "join_denied",
            data: { chatId, reason: "Chat not found" },
          });
          return;
        }

        const isMember = (chat.members || []).some(
          (m: any) => String(m) === String(socket.userId),
        );

        if (!isMember) {
          sendJson(socket, {
            type: "join_denied",
            data: { chatId, reason: "Not a chat member" },
          });
          return;
        }

        subscribe(socket, chatId);
        sendJson(socket, { type: "joined_chat", data: { chatId } });
        return;
      }

      // 3) LEAVE CHAT (unsubscribe)
      if (evt.type === "leave_chat") {
        unsubscribe(socket, evt.chatId);
        sendJson(socket, { type: "left_chat", data: { chatId: evt.chatId } });
        return;
      }
    });

    socket.on("close", () => cleanupSocket(socket));
    socket.on("error", () => cleanupSocket(socket));
  });

  // ---- Heartbeat (ping/pong) ----
  const HEARTBEAT_MS = 30_000;
  const interval = setInterval(() => {
    for (const client of wss.clients as Set<AliveSocket>) {
      if (client.isAlive === false) {
        client.terminate();
        cleanupSocket(client);
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_MS);

  wss.on("close", () => clearInterval(interval));

  const broadcastChatCreated = (chat: ChatDTO) => {
    const payload: ServerEvent = { type: "chat_created", data: chat };
    const data = JSON.stringify(payload);
    const memberSet = new Set(chat.members.map(String));

    for (const client of wss.clients as Set<AuthedSocket>) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (!client.userId) continue;

      if (memberSet.has(String(client.userId))) {
        client.send(data);
      }
    }
  };

  const broadcastMessageCreated = (message: MessageDTO) => {
    publishToChat(message.chatId, { type: "message_sent", data: message });
  };

  return { wss, broadcastChatCreated, broadcastMessageCreated };
};
