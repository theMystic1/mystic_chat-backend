import { Types } from "mongoose";
import { catchAsync } from "../utils/catch-async";
import { Chat } from "../models/chat.schema";
import { Contact } from "../models/friends.schema";
import APIFeatures from "../utils/api-features";
import { Message } from "../models/messages.schema";
import AppError from "../utils/app-error";

export const getMyChats = catchAsync(async (req, res, next) => {
  const meId = new Types.ObjectId((req as any).user.id);

  // 1) Base query: only my chats
  const baseQuery = Chat.find({ userId: meId });

  // 2) Apply API features (filter/sort/fields/paginate)
  const features = new APIFeatures(baseQuery, req.query)
    .filter()
    .sort()
    .paginate();

  // 3) Execute query
  const chats = await features.query.lean();

  // 4) Collect "other user ids" for DMs
  const dmOtherIds = chats
    .filter((c: any) => c.type === "dm")
    .map((c: any) => {
      const other = (c.members || []).find(
        (id: any) => String(id) !== String(meId),
      );
      return other ? String(other) : null;
    })
    .filter(Boolean) as string[];

  // 5) Pull contacts that match those other ids (one query)
  const contactDocs = dmOtherIds.length
    ? await Contact.find({
        ownerId: meId,
        targetUserId: { $in: dmOtherIds.map((id) => new Types.ObjectId(id)) },
        isBlocked: false,
      })
        .select("targetUserId")
        .lean()
    : [];

  const contactSet = new Set(
    contactDocs.map((d: any) => String(d.targetUserId)),
  );

  // 6) Add computed isMutual (DO NOT save it)
  const enriched = chats.map((c: any) => {
    if (c.type !== "dm") return { ...c, isMutual: false };

    const other = (c.members || []).find(
      (id: any) => String(id) !== String(meId),
    );
    const otherId = other ? String(other) : "";

    return {
      ...c,
      isMutual: otherId ? contactSet.has(otherId) : false,
    };
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
  const chat = await Chat.findById(chatObjectId).lean();
  if (!chat) return next(new AppError("Chat not found", 404));

  // 2) Ensure current user is a member of this chat
  const isMember = (chat.members || []).some(
    (id: any) => String(id) === String(curUserId),
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

  const messages = await features.query.lean();

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
    data: { chat, messages },
    isMutual,
  });
});
