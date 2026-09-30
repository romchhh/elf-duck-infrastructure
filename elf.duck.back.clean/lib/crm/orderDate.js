/** CRM order date by operational status (shared by orders list + analytics). */
export function getCrmOrderDateExpression() {
  return {
    $switch: {
      branches: [
        {
          case: { $eq: ["$status", "annulled"] },
          then: { $ifNull: ["$annulledAt", "$createdAt"] },
        },
        {
          case: { $eq: ["$status", "canceled"] },
          then: { $ifNull: ["$canceledAt", "$createdAt"] },
        },
        {
          case: { $in: ["$status", ["completed", "done"]] },
          then: { $ifNull: ["$completedAt", "$createdAt"] },
        },
        {
          case: { $eq: ["$status", "shipped"] },
          then: { $ifNull: ["$shippedAt", "$createdAt"] },
        },
      ],
      default: "$createdAt",
    },
  };
}
