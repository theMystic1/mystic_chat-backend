import WebSocket from "ws";

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
  attachments?: { kind: "image" | "file"; url: string }[];
};

export type ServerEvent =
  | { type: "welcome"; data: string }
  | { type: "auth_ok"; data: { userId: string } }
  | { type: "auth_error"; data: string }
  | { type: "joined_chat"; data: { chatId: string } }
  | { type: "join_denied"; data: { chatId: string; reason: string } }
  | { type: "left_chat"; data: { chatId: string } }
  | { type: "chat_created"; data: ChatDTO }
  | { type: "message_sent"; data: MessageDTO }
  | {
      type: "message_delivered";
      data: { chatId: string; messageId: string; deliveredTo: string };
    }
  | {
      type: "message_read";
      data: {
        chatId: string;
        messageId: string;
        readBy: string;
        readAt: string;
      };
    }
  | {
      type: "messages_delivered";
      data: { chatId: string; messageIds: string[]; deliveredTo: string };
    }
  | {
      type: "messages_read";
      data: {
        chatId: string;
        messageIds: string[];
        readBy: string;
        readAt: string;
      };
    }
  | { type: "typing_start"; data: { chatId: string; userId: string } }
  | { type: "typing_stop"; data: { chatId: string; userId: string } }
  // ✅ Presence snapshot + incremental updates
  | { type: "presence_state"; data: { onlineUserIds: string[] } }
  | { type: "presence_online"; data: { userId: string } }
  | { type: "presence_offline"; data: { userId: string } }
  | {
      type: "chat_updated";
      data: {
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
      };
    };

/** Client->server events */
export type ClientEvent =
  | { type: "auth"; token: string }
  | { type: "join_chat"; chatId: string }
  | { type: "leave_chat"; chatId: string }
  | { type: "ack_delivered"; chatId: string; messageId: string }
  | { type: "ack_read"; chatId: string; messageId: string }
  | { type: "ack_delivered_all"; chatId: string }
  | { type: "ack_read_all"; chatId: string }
  | { type: "typing_start"; chatId: string }
  | { type: "typing_stop"; chatId: string };

export type AliveSocket = WebSocket & {
  isAlive?: boolean;
  userId?: string;
  subs?: Set<string>;
  delivered?: Set<string>;
  read?: Set<string>;
};

export type AuthedSocket = WebSocket & { userId?: string };
