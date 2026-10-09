import mongoose from "mongoose";

/** Останній знімок залишків АССОРТИМЕНТ (по spreadsheetId) для cron без зайвих записів у Mongo. */
const SheetAssortmentFingerprintSchema = new mongoose.Schema(
  {
    spreadsheetId: { type: String, required: true, unique: true, index: true },
    fingerprint: { type: String, default: "" },
    checkedAt: { type: Date, default: null },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.SheetAssortmentFingerprint ||
  mongoose.model("SheetAssortmentFingerprint", SheetAssortmentFingerprintSchema);
