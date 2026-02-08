import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },

    unreadCount: { type: Number, default: 0 },
    lastReadAt: { type: Date, default: null },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    dmKey: { type: String },

    isMuted: { type: Boolean, default: false },
    isSpam: { type: Boolean, default: false },

    type: { type: String, enum: ["group", "dm"], default: "dm" },

    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastMessage: {
      messageId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
      senderId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      type: {
        type: String,
        enum: ["text", "image", "file", "system"],
        default: "text",
      },
      text: { type: String, default: "" },
      createdAt: { type: Date, default: null },
    },

    delivery: {
      lastDeliveredMessageIdByUser: {
        type: Map,
        of: Schema.Types.ObjectId,
        default: {},
      },
      lastDeliveredAtByUser: {
        type: Map,
        of: Date,
        default: {},
      },
    },

    read: {
      lastReadMessageIdByUser: {
        type: Map,
        of: Schema.Types.ObjectId,
        default: {},
      },
      lastReadAtByUser: {
        type: Map,
        of: Date,
        default: {},
      },
    },
  },
  { timestamps: true },
);

// Helpful indexes (optional)
chatSchema.index({ members: 1, updatedAt: -1 });
chatSchema.index({ dmKey: 1 }, { unique: false });

export const Chat = mongoose.model("Chat", chatSchema);
