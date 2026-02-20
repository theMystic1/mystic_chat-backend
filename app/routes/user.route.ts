import express from "express";

import {
  authenticateUser,
  logoutUser,
  protect,
  signinUser,
} from "../controllers/auth.controller";
import {
  deleteUser,
  getMe,
  getOneUser,
  updateMe,
  updateUser,
} from "../controllers/user.controller";

const router = express.Router();

router.post("/signin", signinUser);
router.post("/resendToken", signinUser);
router.post("/verify", authenticateUser);

// Protect all routes after this middleware
router.use(protect);

router.route("/me").get(getMe, getOneUser).patch(updateMe);
router.route("/:id").get(getOneUser).patch(updateUser).delete(deleteUser);
router.post("/logout", logoutUser);

export default router;
