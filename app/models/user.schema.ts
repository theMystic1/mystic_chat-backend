import mongoose, {
  type Query,
  type HydratedDocument,
  type Model,
} from "mongoose";
import validator from "validator";
import crypto from "crypto";

// 1) Define the TS shape of your User
export type IUser = {
  userName?: string;
  displayName?: string;
  email: string;
  avatarUrl?: string;
  bio?: string;

  lastSeenAt?: Date;
  signinAt?: Date;

  signinToken?: string;
  signinTokenExpires?: Date;

  active?: boolean;
  isNewUser?: boolean;
};

// 2) Instance methods typing
type UserMethods = {
  createSigninToken: () => string;
};

// 3) Hydrated doc type
export type UserDoc = HydratedDocument<IUser, UserMethods>;

// 4) Schema
const userSchema = new mongoose.Schema<
  IUser,
  Model<IUser, {}, UserMethods>,
  UserMethods
>(
  {
    userName: {
      type: String,
      unique: true,
      trim: true,
      default: "",
    },
    displayName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide your email"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Please provide a valid email"],
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
    },

    lastSeenAt: {
      type: Date,
      default: new Date(),
    },
    signinAt: Date,
    signinToken: String,
    signinTokenExpires: Date,
    isNewUser: {
      type: Boolean,
      default: true,
    },

    active: {
      type: Boolean,
      default: true,
      select: false,
    },
  },
  { timestamps: true },
);

// userSchema.pre(/^find/, function (this: Query<any, IUser>) {
//   this.where({ active: { $ne: false } });
// });

userSchema.methods.createSigninToken = function (this: UserDoc) {
  const signinToken = crypto
    .randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");

  this.signinToken = crypto
    .createHash("sha256")
    .update(signinToken)
    .digest("hex");
  this.signinTokenExpires = new Date(Date.now() + 10 * 60 * 1000);

  return signinToken;
};

const User = mongoose.model<IUser, Model<IUser, {}, UserMethods>>(
  "User",
  userSchema,
);

export default User;
