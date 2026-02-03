import dotenv from "dotenv";
import path from "path";
import express from "express";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import http from "http";
// import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";

import { globalErrorHandler } from "./controllers/error.controller";
import AppError from "./utils/app-error";
import userRouter from "./routes/user.route";
import chatRouter from "./routes/chat.route";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Start express app
const app = express();

app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// 1) GLOBAL MIDDLEWARES
// Implement CORS
app.use(
  cors({
    origin: [
      "http://localhost:1996",
      "http://localhost:3000",
      "http://localhost:19006", // Expo web (if used)
      // add your production domains here
    ],
    credentials: true,
  }),
);
// Access-Control-Allow-Origin *
// api.natours.com, front-end natours.com
// app.use(cors({
//   origin: 'https://www.natours.com'
// }))

// app.options('/api/v1/tours/:id', cors());

app.options(/.*/, cors());

// Serving static files
app.use(express.static(path.join(__dirname, "public")));

// Set security HTTP headers
app.use(helmet());

// Development logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Limit requests from same API
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP, please try again in an hour!",
});
app.use("/api", limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
// app.use(mongoSanitize());

// Data sanitization against XSS
// app.use(xss());

// Prevent parameter pollution
// app.use(
//   hpp({
//     whitelist: [
//       "duration",
//       "ratingsQuantity",
//       "ratingsAverage",
//       "maxGroupSize",
//       "difficulty",
//       "price",
//     ],
//   }),
// );

app.use(compression());

// Test middleware

// 3) ROUTES
// app.use("/", viewRouter);
// app.use("/api/v1/tours", tourRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/chat", chatRouter);
// app.use("/api/v1/reviews", reviewRouter);
// app.use("/api/v1/bookings", bookingRouter);

app.all(/.*/, (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;
