import express from "express";
import { protect } from "../controllers/auth.controller";
import { createDmChat } from "../controllers/chat.controller";

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// create message
router.route("/:receiverId").post(createDmChat);

export default router;
