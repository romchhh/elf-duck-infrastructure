import mongoose from "mongoose";

const broadcastCampaignSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        default: "",
      },

      audience: {
        type: String,
        default: "all",
      },

      filters: {
        statuses: {
          type: [String],
          default: [],
        },

        categoryKeys: {
          type: [String],
          default: [],
        },

        locationKeys: {
          type: [String],
          default: [],
        },

        minCheck: {
          type: Number,
          default: 0,
        },

        minCashback: {
          type: Number,
          default: 0,
        },

        favProduct: {
          type: String,
          default: "",
        },

        telegram: {
          type: String,
          default: "",
        },
      },

      message: {
        title: {
          type: String,
          default: "",
        },

        text: {
          type: String,
          default: "",
        },

        promo: {
          type: String,
          default: "",
        },

        photoUrl: {
          type: String,
          default: "",
        },

        photoFileId: {
  type: String,
  default: "",
},

        buttonText: {
          type: String,
          default: "",
        },

        buttonUrl: {
          type: String,
          default: "",
        },
      },

      templateId: {
        type:
          mongoose.Schema.Types.ObjectId,
        default: null,
      },

      jobId: {
        type: String,
        default: "",
        index: true,
      },

      status: {
        type: String,
        enum: [
          "queued",
          "running",
          "completed",
          "failed",
        ],
        default: "queued",
      },

      recipientTelegramIds: {
        type: [String],
        default: [],
      },

      sentTelegramIds: {
        type: [String],
        default: [],
        },

      processedTelegramIds: {
        type: [String],
        default: [],
      },

      recipients: {
        type: Number,
        default: 0,
      },

      processed: {
        type: Number,
        default: 0,
      },

      sent: {
        type: Number,
        default: 0,
      },

      failed: {
        type: Number,
        default: 0,
      },

      blocked: {
        type: Number,
        default: 0,
      },

      purchases: {
        type: Number,
        default: 0,
      },

      buyers: { type: Number, default: 0 },

      revenue: {
        type: Number,
        default: 0,
      },

      conversion: {
        type: Number,
        default: 0,
      },

      startedAt: {
        type: Date,
        default: null,
      },

      finishedAt: {
        type: Date,
        default: null,
      },

      lastErrors: {
        type: [String],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

broadcastCampaignSchema.index({
  createdAt: -1,
});

broadcastCampaignSchema.index({
  status: 1,
  createdAt: -1,
});

export default mongoose.model(
  "BroadcastCampaign",
  broadcastCampaignSchema
);