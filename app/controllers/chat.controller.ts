import { Types } from "mongoose";
import { catchAsync } from "../utils/catch-async";
import { Chat } from "../models/chat.schema";
import { Contact } from "../models/friends.schema";
import APIFeatures from "../utils/api-features";
import { Message } from "../models/messages.schema";
import AppError from "../utils/app-error";
import { RequestHandler } from "express";
import User from "../models/user.schema";

export const getMyChats = catchAsync(async (req, res, next) => {
  const meRaw = (req as any).user?._id || (req as any).user?.id;
  if (!meRaw) return next(new AppError("Not authenticated", 401));
  const meId = new Types.ObjectId(String(meRaw));

  const baseQuery = Chat.find({
    members: meId,
    $or: [
      { lastMessageId: { $ne: null } },
      { lastMessageAt: { $exists: true, $ne: null } },

      {
        $and: [
          {
            $or: [
              { lastMessageId: null },
              { lastMessageId: { $exists: false } },
            ],
          },
          {
            $or: [
              { lastMessageAt: null },
              { lastMessageAt: { $exists: false } },
            ],
          },
          { createdBy: meId },
        ],
      },
    ],
  })
    .populate("lastMessageId")
    .populate("members");

  const features = new APIFeatures(baseQuery, req.query).filter().paginate();

  const enriched = await (features.query as any).sort({
    lastMessageAt: -1,
    updatedAt: -1,
  });

  return res.status(200).json({
    status: "success",
    results: enriched.length,
    data: { chats: enriched },
  });
});

export const getChatMessages = catchAsync(async (req, res, next) => {
  const { chatId } = req.params;
  const curUserIdRaw = (req as any).user?._id || (req as any).user?.id;

  if (!Types.ObjectId.isValid(chatId)) {
    return next(new AppError("Invalid chatId", 400));
  }

  const curUserId = new Types.ObjectId(curUserIdRaw);
  const chatObjectId = new Types.ObjectId(chatId);

  // 1) Fetch chat (needed for type/members and access control)
  const chat = await Chat.findById(chatObjectId).populate("members").lean();
  if (!chat) return next(new AppError("Chat not found", 404));

  // 2) Ensure current user is a member of this chat
  const isMember = (chat.members || []).some(
    (m: any) => String(m._id) === String(curUserId),
  );
  if (!isMember)
    return next(new AppError("You do not have access to this chat", 403));

  // 3) Fetch messages for this chat (use APIFeatures)
  const baseQuery = Message.find({
    chatId: chatObjectId,
    deletedFor: { $ne: curUserId }, // only if you support "delete for me"
  });

  const features = new APIFeatures(baseQuery, req.query)
    .filter()
    .sort()
    .paginate();

  const messages = await features.query.sort({ createdAt: 1 }).lean();

  // 4) Compute isMutual (WhatsApp-style: I saved them)
  let isMutual = false;

  if (chat.type === "dm") {
    const otherUserId = (chat.members || []).find(
      (id: any) => String(id) !== String(curUserId),
    );
    if (otherUserId) {
      const contact = await Contact.findOne({
        ownerId: curUserId,
        targetUserId: otherUserId,
        isBlocked: false,
      })
        .select("_id")
        .lean();

      isMutual = !!contact;
    }
  }

  return res.status(200).json({
    status: "success",
    results: messages.length,
    data: { messages, chat },
    isMutual,
  });
});

type ChatParams = Record<string, string>; // or { chatId: string } if you have one

type CreateDmBody = {}; // receiver comes from params

const makeDmKey = (a: Types.ObjectId, b: Types.ObjectId) => {
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? `${sa}:${sb}` : `${sb}:${sa}`;
};

export const createDmChat: RequestHandler<ChatParams, any, CreateDmBody> =
  catchAsync(async (req, res, next) => {
    const meRaw =
      (req as any).user?.id || (req as any).user?._id || (req as any).user?.id;
    if (!meRaw) return next(new AppError("Not authenticated", 401));

    const { receiver } = req.body;

    if (!receiver) {
      return next(
        new AppError(
          "Receiver email or userName is required to add a user",
          400,
        ),
      );
    }

    const isEmail = receiver.includes("@");

    const meId = new Types.ObjectId(String(meRaw));

    let receiverE;

    if (isEmail) receiverE = await User.findOne({ email: receiver });
    else receiverE = await User.findOne({ userName: receiver });

    if (!receiverE) return next(new AppError("Invalid User ID", 400));

    // console.log("req", isEmail, receiverE);

    const recId = receiverE._id;
    if (String(meId) === String(recId)) {
      return next(new AppError("You cannot create a chat with yourself", 400));
    }

    const dmKey = makeDmKey(meId, recId);

    // Find or create (prevents duplicates)
    let chat = await Chat.findOne({ type: "dm", dmKey });

    if (!chat) {
      chat = await Chat.create({
        type: "dm",
        dmKey,
        members: [meId, recId],
        createdBy: meId,
      });
    }

    // Broadcast
    req.app.locals.broadcastChatCreated?.(chat);

    return res.status(201).json({
      status: "success",
      data: { chat },
    });
  });

export const sendMessage = catchAsync(async (req, res, next) => {
  const meRaw = (req as any).user?._id || (req as any).user?.id;
  if (!meRaw) return next(new AppError("Not authenticated", 401));

  const { chatId } = req.params;
  if (!Types.ObjectId.isValid(chatId)) {
    return next(new AppError("Invalid chatId", 400));
  }

  const meId = new Types.ObjectId(String(meRaw));
  const chatObjectId = new Types.ObjectId(chatId);

  const { message, type } = req.body as {
    message?: string;
    type?: "text" | "image" | "file" | "system";
    attachments?: unknown;
  };

  const normalizedType = type ?? "text";
  const messageText = typeof message === "string" ? message.trim() : "";

  if (normalizedType === "text" && !messageText) {
    return next(new AppError("Message text is required", 400));
  }

  const attachments = Array.isArray((req.body as any).attachments)
    ? (req.body as any).attachments
    : [];

  if (normalizedType === "image" || normalizedType === "file") {
    const valid = attachments.some((a: any) => {
      const kindOk = a?.kind === "image" || a?.kind === "file";
      const urlOk = typeof a?.url === "string" && a.url.trim().length > 0;
      return kindOk && urlOk;
    });

    if (!valid) {
      return next(
        new AppError(
          "attachments is required for image/file messages and must include at least one item with a valid kind and non-empty url",
          400,
        ),
      );
    }
  }

  // 1) verify membership
  const chat = await Chat.findById(chatObjectId).select("members type").lean();
  if (!chat) return next(new AppError("Chat not found", 404));

  const isMember = (chat.members || []).some(
    (id: any) => String(id) === String(meId),
  );
  if (!isMember) {
    return next(new AppError("You do not have access to this chat", 403));
  }

  // 2) Create message
  const chatMessage = await Message.create({
    senderId: meId,
    chatId: chatObjectId,
    text: messageText,
    type: normalizedType,
    attachments:
      normalizedType === "image" || normalizedType === "file"
        ? attachments
        : [],
  });

  // 3) Update chat inbox fields + sender cursors (delivered/read for sender)
  const now = new Date();

  // Map keys must be strings; ObjectId hex string is safe for Mongo dot notation keys.
  const meKey = String(meId);

  await Chat.updateOne(
    { _id: chatObjectId },
    {
      $set: {
        lastMessageId: chatMessage._id,
        lastMessage: {
          messageId: chatMessage._id,
          senderId: chatMessage.senderId,
          type: chatMessage.type,
          text: chatMessage.text ?? "",
          createdAt: chatMessage.createdAt ?? now,
        },

        // sender has "delivered" and "read" their own message immediately
        [`delivery.lastDeliveredMessageIdByUser.${meKey}`]: chatMessage._id,
        [`delivery.lastDeliveredAtByUser.${meKey}`]: now,
        [`read.lastReadMessageIdByUser.${meKey}`]: chatMessage._id,
        [`read.lastReadAtByUser.${meKey}`]: now,
      },
    },
  );

  // 4) Broadcast message (for open chat screens)
  req.app.locals.broadcastMessageCreated?.({
    id: String(chatMessage._id),
    chatId: String(chatMessage.chatId),
    senderId: String(chatMessage.senderId),
    type: chatMessage.type,
    text: chatMessage.text,
    createdAt: chatMessage.createdAt?.toISOString?.(),
    attachments: chatMessage.attachments ?? [],
  });

  // 5) Broadcast chat update (for chat list screens)
  // This is the key part for “top-level sync”
  req.app.locals.broadcastChatUpdated?.({
    chatId: String(chatObjectId),
    lastMessage: {
      messageId: String(chatMessage._id),
      senderId: String(chatMessage.senderId),
      type: chatMessage.type,
      text: chatMessage.text ?? "",
      createdAt: chatMessage.createdAt?.toISOString?.() ?? now.toISOString(),
    },
    // optional: include sender cursor so chat list can render "sent" immediately
    delivery: {
      userId: meKey,
      lastDeliveredMessageId: String(chatMessage._id),
    },
    read: { userId: meKey, lastReadMessageId: String(chatMessage._id) },
  });

  return res.status(201).json({
    status: "success",
    data: { message: chatMessage },
  });
});
