import express from "express";
import { protect } from "../controllers/auth.controller";
import {
  createDmChat,
  getChatMessages,
  getMyChats,
  sendMessage,
  createGroupChat,
  getChatMembers,
  addMembersToGroup,
  updateGroupChat,
} from "../controllers/chat.controller";

const router = express.Router();

router.use(protect);

router.route("/").get(getMyChats).post(createDmChat);
router.route("/group").post(createGroupChat);
router.route("/group/:chatId").patch(updateGroupChat);
router.route("/members/:chatId").get(getChatMembers).patch(addMembersToGroup);
router.route("/messages/:chatId").get(getChatMessages);

// send message
router.route("/messages/:chatId/send").post(sendMessage);
// create message
// router.route("/:receiverId");

export default router;
