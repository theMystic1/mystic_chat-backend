import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, {
  type Secret,
  type SignOptions,
  type JwtPayload,
} from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";

import { catchAsync } from "../utils/catch-async";
import User, { IUser } from "../models/user.schema";
import Email from "../utils/email";
import AppError from "../utils/app-error";
import { promisify } from "util";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type JwtPayloadWithId = JwtPayload & { id: string };

export const verifyJwt = (token: string, secret: Secret) =>
  new Promise<JwtPayloadWithId>((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) return reject(err);

      // jsonwebtoken can return string | JwtPayload
      if (!decoded || typeof decoded === "string") {
        return reject(new Error("Invalid token payload"));
      }

      if (typeof (decoded as any).id !== "string") {
        return reject(new Error("Token payload missing id"));
      }

      resolve(decoded as JwtPayloadWithId);
    });
  });

const JWT_SECRET: Secret =
  process.env.JWT_SECRET ??
  (() => {
    throw new Error("JWT_SECRET is missing");
  })();

const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ??
  "7d") as SignOptions["expiresIn"];

export const signToken = (id: string) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const createSendToken = (
  user: any,
  statusCode: number,
  req: Request,
  res: Response,
) => {
  const token = signToken(user._id);

  res.cookie("access_token", token, {
    expires: new Date(
      Date.now() + +process.env.JWT_COOKIE_EXPIRES_IN! * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  });

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

export const signinUser = catchAsync(async (req, res, next) => {
  const { email } = req.body as { email?: string };
  if (!email) return next(new AppError("Email is required", 400));

  // Find or create (your call)
  let user = await User.findOne({ email });

  // console.log(user);
  if (!user) user = await User.create({ email, userName: email.split("@")[0] });

  // Call your instance method
  const signinToken = user.createSigninToken();

  // Persist hashed token + expiry
  await user.save({ validateBeforeSave: false });

  const url = `${req.protocol}://${req.get("host")}/verify-signin`;

  // console.log(url);

  await new Email(user, url).sendSignInToken(signinToken);

  return res.status(200).json({
    status: "success",
    message: "Sign-in code sent to email",
  });
});

export const authenticateUser = catchAsync(async (req, res, next) => {
  const { email, token } = req.body as { email?: string; token?: string };

  console.log(token);
  if (!email || !token)
    return next(new AppError("Email and token are required", 400));

  const normalizedToken = String(token).trim().padStart(6, "0");
  const hashed = crypto
    .createHash("sha256")
    .update(normalizedToken)
    .digest("hex");

  const user = await User.findOne({
    email,
    signinToken: hashed,
    signinTokenExpires: { $gt: new Date() },
  });

  // console.log(user);

  if (!user) return next(new AppError("Invalid or expired sign-in code", 401));

  // Clear token fields
  user.signinToken = undefined;
  user.signinTokenExpires = undefined;
  user.signinAt = new Date();

  await user.save({ validateBeforeSave: false });

  // NOW issue JWT / session
  createSendToken(user, 200, req, res);
});

export const protect: RequestHandler = catchAsync(async (req, res, next) => {
  // 1) Get token
  let token: string | undefined;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    token = auth.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt as string;
  }

  if (!token) {
    return next(
      new AppError("You are not logged in! Please log in to get access.", 401),
    );
  }

  // 2) Verify token
  const decoded = await verifyJwt(token, process.env.JWT_SECRET!);

  // 3) Check user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        "The user belonging to this token does no longer exist.",
        401,
      ),
    );
  }

  // 4) (Optional) Check if user changed password after token issued (skip for now)

  // Grant access
  (req as any).user = currentUser;
  res.locals.user = currentUser;

  return next();
});
