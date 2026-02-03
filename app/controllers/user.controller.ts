import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catch-async";
import User from "../models/user.schema";
import {
  deleteOne,
  getAll,
  getOne,
  updateOne,
} from "./factoryFunction.controller";

// const multerStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'public/img/users');
//   },
//   filename: (req, file, cb) => {
//     const ext = file.mimetype.split('/')[1];
//     cb(null, `user-${req.user.id}-${Date.now()}.${ext}`);
//   }
// });

type AuthedRequest = Request & {
  user: { id: string };
};

export const getMe = (req: Request, res: Response, next: NextFunction) => {
  req.params.id = (req as any).user.id;
  next();
};

export const updateMe = catchAsync(async (req, res, next) => {
  //  update user or update user
  const updatedUser = await User.findByIdAndUpdate(
    (req as any).user.id,
    req.body,
    {
      new: true,
      runValidators: true,
    },
  );

  res.status(200).json({
    status: "success",
    data: {
      user: updatedUser,
    },
  });
});

export const deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate((req as any).user.id, { active: false });

  res.status(204).json({
    status: "success",
    data: null,
  });
});

export const createUser = (req: Request, res: Response) => {
  res.status(500).json({
    status: "error",
    message: "This route is not defined! Please use /signup instead",
  });
};

export const getOneUser = getOne(User);
export const getAllUsers = getAll(User);

// Do NOT update passwords with this!
export const updateUser = updateOne(User);
export const deleteUser = deleteOne(User);
