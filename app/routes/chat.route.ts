import express from "express";
import { protect } from "../controllers/auth.controller";
import {
  createDmChat,
  getChatMessages,
  getMyChats,
  sendMessage,
} from "../controllers/chat.controller";

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

router.route("/").get(getMyChats);
router.route("/messages/:chatId").get(getChatMessages);

// send message
router.route("/messages/:chatId/send").post(sendMessage);
// create message
router.route("/:receiverId").post(createDmChat);

export default router;
