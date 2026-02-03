import type { RequestHandler } from "express";
import type { Model, PopulateOptions, Query, HydratedDocument } from "mongoose";

import AppError from "../utils/app-error";
import APIFeatures from "../utils/api-features";
import { catchAsync } from "../utils/catch-async";

type IdParams = { id: string };

// A model type that preserves all Mongoose generics (methods/virtuals/etc.)
type AnyMongooseModel<
  TRaw,
  TQueryHelpers = {},
  TInstanceMethods = {},
  TVirtuals = {},
  THydrated = HydratedDocument<TRaw, TInstanceMethods>,
> = Model<TRaw, TQueryHelpers, TInstanceMethods, TVirtuals, THydrated>;

const sendDoc = (
  res: Parameters<RequestHandler>[1],
  statusCode: number,
  doc: unknown,
) =>
  res.status(statusCode).json({
    status: "success",
    data: { data: doc },
  });

export const deleteOne = <
  TRaw,
  TQueryHelpers = {},
  TInstanceMethods = {},
  TVirtuals = {},
  THydrated = HydratedDocument<TRaw, TInstanceMethods>,
>(
  Model: AnyMongooseModel<
    TRaw,
    TQueryHelpers,
    TInstanceMethods,
    TVirtuals,
    THydrated
  >,
): RequestHandler<IdParams> =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) return next(new AppError("No document found with that ID", 404));

    return res.status(204).json({ status: "success", data: null });
  });

export const updateOne = <
  TRaw,
  TQueryHelpers = {},
  TInstanceMethods = {},
  TVirtuals = {},
  THydrated = HydratedDocument<TRaw, TInstanceMethods>,
>(
  Model: AnyMongooseModel<
    TRaw,
    TQueryHelpers,
    TInstanceMethods,
    TVirtuals,
    THydrated
  >,
): RequestHandler<IdParams> =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) return next(new AppError("No document found with that ID", 404));

    return sendDoc(res, 200, doc);
  });

export const createOne = <
  TRaw,
  TQueryHelpers = {},
  TInstanceMethods = {},
  TVirtuals = {},
  THydrated = HydratedDocument<TRaw, TInstanceMethods>,
>(
  Model: AnyMongooseModel<
    TRaw,
    TQueryHelpers,
    TInstanceMethods,
    TVirtuals,
    THydrated
  >,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const doc = await Model.create(req.body as Partial<TRaw>);
    return sendDoc(res, 201, doc);
  });

export const getOne = <
  TRaw,
  TQueryHelpers = {},
  TInstanceMethods = {},
  TVirtuals = {},
  THydrated = HydratedDocument<TRaw, TInstanceMethods>,
>(
  Model: AnyMongooseModel<
    TRaw,
    TQueryHelpers,
    TInstanceMethods,
    TVirtuals,
    THydrated
  >,
  popOptions?: string | PopulateOptions | (string | PopulateOptions)[],
): RequestHandler<IdParams> =>
  catchAsync(async (req, res, next) => {
    let query = Model.findById(req.params.id) as unknown as Query<
      THydrated | null,
      THydrated
    >;

    if (popOptions) query = query.populate(popOptions as any);

    const doc = await query;

    if (!doc) return next(new AppError("No document found with that ID", 404));

    return sendDoc(res, 200, doc);
  });

export const getAll = <
  TRaw,
  TQueryHelpers = {},
  TInstanceMethods = {},
  TVirtuals = {},
  THydrated = HydratedDocument<TRaw, TInstanceMethods>,
>(
  Model: AnyMongooseModel<
    TRaw,
    TQueryHelpers,
    TInstanceMethods,
    TVirtuals,
    THydrated
  >,
  // baseFilter: FilterQuery<TRaw> = {},
): RequestHandler =>
  catchAsync(async (req, res) => {
    const features = new APIFeatures(Model.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const docs = await features.query;

    return res.status(200).json({
      status: "success",
      results: docs.length,
      data: { data: docs },
    });
  });
