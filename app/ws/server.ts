// app/ws/server.ts
import type { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Chat } from "../models/chat.schema";
import { Message } from "../models/messages.schema";
import User from "../models/user.schema";
import {AliveSocket,  AuthedSocket, ChatDTO, ClientEvent, MessageDTO, ServerEvent } from "../utils/types";

const sendJson = (socket: WebSocket, payload: ServerEvent): void => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

/** chatId -> subscribed sockets */
const chatSubs = new Map<string, Set<AliveSocket>>();

const subscribe = (socket: AliveSocket, chatId: string) => {
  socket.subs ??= new Set();
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
  for (const chatId of socket.subs) unsubscribe(socket, chatId);
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

const publishToChatExcept = (
  chatId: string,
  exceptUserId: string,
  event: ServerEvent,
) => {
  const set = chatSubs.get(chatId);
  if (!set || set.size === 0) return;

  const data = JSON.stringify(event);
  for (const client of set) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (!client.userId) continue;
    if (String(client.userId) === String(exceptUserId)) continue;
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

    if (
      obj.type === "ack_delivered" &&
      typeof obj.chatId === "string" &&
      typeof obj.messageId === "string"
    )
      return obj;

    if (
      obj.type === "ack_read" &&
      typeof obj.chatId === "string" &&
      typeof obj.messageId === "string"
    )
      return obj;

    if (obj.type === "ack_delivered_all" && typeof obj.chatId === "string")
      return obj;
    if (obj.type === "ack_read_all" && typeof obj.chatId === "string")
      return obj;

    if (obj.type === "typing_start" && typeof obj.chatId === "string")
      return obj;
    if (obj.type === "typing_stop" && typeof obj.chatId === "string")
      return obj;

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

  // ✅ multi-device safe presence
  const userConnCount = new Map<string, number>();

  const broadcastAll = (event: ServerEvent) => {
    const data = JSON.stringify(event);
    for (const client of wss.clients as unknown as Set<WebSocket>) {
      if (client.readyState !== WebSocket.OPEN) continue;
      client.send(data);
    }
  };

  const setOnline = (userId: string) => {
    const n = (userConnCount.get(userId) ?? 0) + 1;
    userConnCount.set(userId, n);
    if (n === 1) {
      broadcastAll({ type: "presence_online", data: { userId } });
    }
  };

  const setOffline = (userId: string) => {
    const n = (userConnCount.get(userId) ?? 0) - 1;
    if (n <= 0) {
      userConnCount.delete(userId);
      broadcastAll({ type: "presence_offline", data: { userId } });

      User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
    } else {
      userConnCount.set(userId, n);
    }
  };

  const sendPresenceSnapshot = (socket: AliveSocket) => {
    sendJson(socket, {
      type: "presence_state",
      data: { onlineUserIds: Array.from(userConnCount.keys()) },
    });
  };

  wss.on("connection", (socket: AliveSocket) => {
    socket.isAlive = true;
    socket.subs = new Set();
    socket.delivered = new Set();
    socket.read = new Set();

    socket.on("pong", () => (socket.isAlive = true));
    sendJson(socket, { type: "welcome", data: "welcome to mystChats" });

    const finalizeDisconnect = () => {
      const uid = socket.userId ? String(socket.userId) : null;

      cleanupSocket(socket);

      // ✅ ensure presence decremented exactly once
      if (uid) setOffline(uid);
    };

    socket.on("message", async (raw) => {
      const evt = parseClientEvent(raw);
      if (!evt) return;

      // AUTH
      if (evt.type === "auth") {
        try {
          const { id } = verifyJwt(evt.token);

          // if socket re-auths as a different user, decrement previous
          if (socket.userId && String(socket.userId) !== String(id)) {
            setOffline(String(socket.userId));
          }

          socket.userId = id;

          // ✅ send snapshot BEFORE announcing auth_ok (either order is fine)
          sendPresenceSnapshot(socket);

          // ✅ mark online (multi-device safe)
          setOnline(id);

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

      if (!socket.userId) {
        sendJson(socket, { type: "auth_error", data: "Authenticate first" });
        socket.terminate();
        return;
      }

      // JOIN
      if (evt.type === "join_chat") {
        const chatId = evt.chatId;

        if (!Types.ObjectId.isValid(chatId)) {
          sendJson(socket, {
            type: "join_denied",
            data: { chatId, reason: "Invalid chatId" },
          });
          return;
        }

        const chat = await Chat.findById(chatId).select("members").lean();
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

      // LEAVE
      if (evt.type === "leave_chat") {
        unsubscribe(socket, evt.chatId);
        sendJson(socket, { type: "left_chat", data: { chatId: evt.chatId } });
        return;
      }

      const mustBeSubscribed = (chatId: string) =>
        socket.subs?.has(chatId) === true;

      // ACK DELIVERED (single)
      if (evt.type === "ack_delivered") {
        if (!mustBeSubscribed(evt.chatId)) return;

        const key = `${evt.chatId}:${evt.messageId}`;
        if (socket.delivered?.has(key)) return;
        socket.delivered?.add(key);

        await Message.updateOne(
          { _id: evt.messageId },
          { $addToSet: { deliveredTo: socket.userId } },
        ).catch(() => {});

        publishToChat(evt.chatId, {
          type: "message_delivered",
          data: {
            chatId: evt.chatId,
            messageId: evt.messageId,
            deliveredTo: String(socket.userId),
          },
        });
        return;
      }

      // ACK READ (single)
      if (evt.type === "ack_read") {
        if (!mustBeSubscribed(evt.chatId)) return;

        const key = `${evt.chatId}:${evt.messageId}`;
        if (socket.read?.has(key)) return;
        socket.read?.add(key);

        const readAt = new Date().toISOString();

        await Message.updateOne(
          { _id: evt.messageId },
          { $addToSet: { readBy: socket.userId } },
        ).catch(() => {});

        publishToChat(evt.chatId, {
          type: "message_read",
          data: {
            chatId: evt.chatId,
            messageId: evt.messageId,
            readBy: String(socket.userId),
            readAt,
          },
        });
        return;
      }

      // ACK DELIVERED ALL
      if (evt.type === "ack_delivered_all") {
        const chatId = evt.chatId;
        if (!mustBeSubscribed(chatId)) return;

        const docs = await Message.find({
          chatId,
          senderId: { $ne: socket.userId },
          deliveredTo: { $ne: socket.userId },
        }).select("_id");

        const ids = docs.map((d) => String(d._id));
        if (!ids.length) return;

        await Message.updateMany(
          { _id: { $in: ids } },
          { $addToSet: { deliveredTo: socket.userId } },
        );

        publishToChat(chatId, {
          type: "messages_delivered",
          data: { chatId, messageIds: ids, deliveredTo: String(socket.userId) },
        });
        return;
      }

      // ACK READ ALL
      if (evt.type === "ack_read_all") {
        const chatId = evt.chatId;
        if (!mustBeSubscribed(chatId)) return;

        const docs = await Message.find({
          chatId,
          senderId: { $ne: socket.userId },
          readBy: { $ne: socket.userId },
        }).select("_id");

        const ids = docs.map((d) => String(d._id));
        if (!ids.length) return;

        const readAt = new Date().toISOString();

        await Message.updateMany(
          { _id: { $in: ids } },
          { $addToSet: { readBy: socket.userId } },
        );

        publishToChat(chatId, {
          type: "messages_read",
          data: {
            chatId,
            messageIds: ids,
            readBy: String(socket.userId),
            readAt,
          },
        });
        return;
      }

      // TYPING
      if (evt.type === "typing_start") {
        if (!mustBeSubscribed(evt.chatId)) return;
        publishToChatExcept(evt.chatId, String(socket.userId), {
          type: "typing_start",
          data: { chatId: evt.chatId, userId: String(socket.userId) },
        });
        return;
      }

      if (evt.type === "typing_stop") {
        if (!mustBeSubscribed(evt.chatId)) return;
        publishToChatExcept(evt.chatId, String(socket.userId), {
          type: "typing_stop",
          data: { chatId: evt.chatId, userId: String(socket.userId) },
        });
        return;
      }
    });

    socket.on("close", finalizeDisconnect);
    socket.on("error", finalizeDisconnect);
  });

  const HEARTBEAT_MS = 30_000;
  const interval = setInterval(() => {
    for (const client of wss.clients as Set<AliveSocket>) {
      if (client.isAlive === false) {
        // terminate will trigger close -> finalizeDisconnect
        client.terminate();
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

    for (const client of wss.clients as unknown as Set<AuthedSocket>) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (!client.userId) continue;
      if (memberSet.has(String(client.userId))) client.send(data);
    }
  };

  const broadcastMessageCreated = (message: MessageDTO) => {
    publishToChat(message.chatId, { type: "message_sent", data: message });
  };

  const broadcastChatUpdated = async (payload: {
    chatId: string;
    lastMessage: {
      messageId: string;
      senderId: string;
      type: "text" | "image" | "file" | "system";
      text: string;
      createdAt: string;
    };
    delivery?: { userId: string; lastDeliveredMessageId: string };
    read?: { userId: string; lastReadMessageId: string };
  }) => {
    const chat = await Chat.findById(payload.chatId).select("members").lean();
    if (!chat) return;

    const memberSet = new Set((chat.members || []).map((m: any) => String(m)));
    const evt: ServerEvent = { type: "chat_updated", data: payload };
    const data = JSON.stringify(evt);

    for (const client of wss.clients as unknown as Set<AuthedSocket>) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (!client.userId) continue;
      if (!memberSet.has(String(client.userId))) continue;
      client.send(data);
    }
  };

  return {
    wss,
    broadcastChatCreated,
    broadcastMessageCreated,
    broadcastChatUpdated,
  };
};
