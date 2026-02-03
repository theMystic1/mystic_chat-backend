import mongoose, { Schema, Types } from "mongoose";

export type ContactDoc = {
  ownerId: Types.ObjectId; // the user who saved this contact
  targetUserId?: Types.ObjectId | null; // if matched to a registered user
  contactEmail: string; // always stored (normalized)
  displayName: string; // local name, user-specific
  avatarUrl?: string | null;

  labels: string[];
  isFavorite: boolean;
  isBlocked: boolean;

  matchedAt?: Date | null; // when we resolved email -> user
};

const contactSchema = new Schema<ContactDoc>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    displayName: { type: String, required: true, trim: true },

    avatarUrl: { type: String, default: null },

    labels: { type: [String], default: [] },

    isFavorite: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },

    matchedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Prevent saving the same email twice for the same owner
contactSchema.index({ ownerId: 1, contactEmail: 1 }, { unique: true });

// Optional: if you only allow saving registered users, use ownerId+targetUserId unique instead
// contactSchema.index({ ownerId: 1, targetUserId: 1 }, { unique: true, sparse: true });

export const Contact = mongoose.model<ContactDoc>("Contact", contactSchema);
