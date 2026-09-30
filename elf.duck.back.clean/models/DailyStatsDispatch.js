import mongoose from "mongoose";

const DailyStatsDispatchSchema = new mongoose.Schema(
  {
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    kind: {
      type: String,
      default: "telegram",
    },
    dayKey: { type: String, default: "" },
    pointKey: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Старі ключі можна прибирати — для dedupe важливий лише поточний dayKey.
DailyStatsDispatchSchema.index(
  { sentAt: 1 },
  { expireAfterSeconds: 120 * 24 * 60 * 60 }
);

export default mongoose.model(
  "DailyStatsDispatch",
  DailyStatsDispatchSchema
);
