import mongoose from "mongoose";

/**
 * Скільки з Mongo вже враховано в Google Sheet за день (по ключах tier).
 * Sync додає лише (mongoTotal - lastSynced), не перезаписує ручні правки.
 */
const SheetDayReportBotSnapshotSchema = new mongoose.Schema(
  {
    spreadsheetId: { type: String, required: true, trim: true },
    dayKey: { type: String, required: true, trim: true },
    tiers: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

SheetDayReportBotSnapshotSchema.index(
  { spreadsheetId: 1, dayKey: 1 },
  { unique: true }
);

export default mongoose.models.SheetDayReportBotSnapshot ||
  mongoose.model("SheetDayReportBotSnapshot", SheetDayReportBotSnapshotSchema);
