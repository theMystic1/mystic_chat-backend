import mongoose, { Schema, Types } from "mongoose";

export type MessageType = "text" | "image" | "file" | "system";
export type DeliveryStatus = "sent" | "delivered" | "read";

type Attachment = {
  kind: "image" | "file";
  url: string;
  mimeType?: string;
  size?: number;
  name?: string;
  width?: number;
  height?: number;
};

type Reaction = {
  emoji: string; // "👍", "❤️", etc.
  userId: Types.ObjectId; // who reacted
  reactedAt: Date;
};

export type MessageDoc = {
  chatId: Types.ObjectId;
  senderId: Types.ObjectId;

  type: MessageType;

  text?: string;

  attachments: Attachment[];

  // reply-to / quote
  replyToMessageId?: Types.ObjectId | null;

  // editing / deletion
  editedAt?: Date | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null; // for "delete for everyone"

  // per-user delete ("delete for me")
  deletedFor: Types.ObjectId[];

  // reactions
  reactions: Reaction[];

  deliveredTo: Types.ObjectId[];
  readBy: Types.ObjectId[];

  // optional: "server side status" for last-mile UX
  // (WhatsApp does it per-recipient, but this is a simple MVP field)
  status: DeliveryStatus;
  createdAt?: Date;
};

const attachmentSchema = new Schema<Attachment>(
  {
    kind: { type: String, enum: ["image", "file"], required: true },
    url: { type: String, required: true },

    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    name: { type: String, default: "" },

    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

const reactionSchema = new Schema<Reaction>(
  {
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reactedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDoc>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat", // or "Chat" if that’s your model name
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },

    text: { type: String, default: "" },

    attachments: { type: [attachmentSchema], default: [] },

    replyToMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    deletedFor: { type: [Schema.Types.ObjectId], ref: "User", default: [] },

    reactions: { type: [reactionSchema], default: [] },

    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    deliveredTo: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    readBy: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
  },
  { timestamps: true },
);

// Pagination: latest messages in a conversation
messageSchema.index({ chatId: 1, createdAt: -1 });

// Optional: ensure reactions don’t duplicate per user+emoji (enforced at app level)
export const Message = mongoose.model<MessageDoc>("Message", messageSchema);
