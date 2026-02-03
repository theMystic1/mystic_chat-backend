import type { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";

/** JSON-safe value types */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];

/** A simple event envelope for your WS messages */
export type WsEvent<
  T extends string = string,
  D extends JsonValue = JsonValue,
> = {
  type: T;
  data?: D;
};

export const sendJson = (socket: WebSocket, payload: WsEvent): void => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

export const broadcast = (wss: WebSocketServer, payload: WsEvent): void => {
  const data = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(data);
  }
};

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
};

/** Strict server->client event types */
export type ServerEvent =
  | { type: "welcome"; data: string }
  | { type: "chat_created"; data: ChatDTO }
  | { type: "message_sent"; data: MessageDTO };

export const attachWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", (socket) => {
    sendJson(socket, { type: "welcome", data: "welcome to mystChats" });
    socket.on("error", console.error);
  });

  const broadcastChatCreated = (chat: ChatDTO) => {
    broadcast(wss, { type: "chat_created", data: chat } satisfies ServerEvent);
  };

  const broadcastMessageCreated = (message: MessageDTO) => {
    broadcast(wss, {
      type: "message_sent",
      data: message,
    } satisfies ServerEvent);
  };

  return { wss, broadcastChatCreated, broadcastMessageCreated };
};
