import mongoose, { Schema, Types } from "mongoose";

const chatSchema = new Schema(
  {
    // userId: {
    //   type: Schema.Types.ObjectId,
    //   ref: "User",
    //   required: true,
    //   index: true,
    // },

    // likely lastMessageId (not messageId)
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
    dmKey: {
      type: String,
    },

    isMuted: { type: Boolean, default: false },
    isSpam: { type: Boolean, default: false },

    type: { type: String, enum: ["group", "dm"], default: "dm" },

    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
  },
  { timestamps: true },
);

export const Chat = mongoose.model("Chat", chatSchema);
