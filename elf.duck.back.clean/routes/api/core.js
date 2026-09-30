import { bindApiGlobals } from "./bindApiGlobals.js";

export function registerRoutes(app) {
  bindApiGlobals();

// ==== API ====

app.get("/ping", (_, res) => res.json({ ok: true }));

// регистрируем юзера из mini-app
app.post("/register-user", async (req, res) => {
  try {
    const verified = verifyTelegramWebAppInitData(req.headers?.["x-telegram-init-data"]);
    const telegramId = String(verified?.telegramId || "").trim();

    if (!telegramId) {
      return res.status(401).json({ ok: false, error: "INVALID_TELEGRAM_INIT_DATA" });
    }

    const tgUser = verified?.user || {};
    const username = String(tgUser?.username || "").trim();
    const firstName = String(tgUser?.first_name || "").trim();
    const lastName = String(tgUser?.last_name || "").trim();
    const photoUrl = String(tgUser?.photo_url || "").trim();

    const { ref } = req.body || {};
    const normalizedRef = String(ref || "").replace(/^ref_/, "").trim();

    // Single upsert instead of findOne → create/save → findById. One round-trip
    // for the common "returning user" path.
    const setOnInsert = { telegramId };
    const set = {};
    if (username) set.username = username;
    if (firstName) set.firstName = firstName;
    if (lastName) set.lastName = lastName;
    if (photoUrl) set.photoUrl = photoUrl;
    if (verified?.botToken) {
      set.shopBotIndex = resolveShopBotIndexFromToken(verified.botToken);
      set.shopBotKnown = true;
    }

    let user = await User.findOneAndUpdate(
      { telegramId },
      { $set: set, $setOnInsert: setOnInsert },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let mutated = false;
    if (!user.referral?.code) {
      await ensureUserRefCode(user);
      mutated = true;
    }
    if (normalizedRef) {
      const before = JSON.stringify(user.referral || {});
      await attachReferralIfAny(user, normalizedRef);
      if (JSON.stringify(user.referral || {}) !== before) mutated = true;
    }

    if (mutated) {
      user = await User.findById(user._id).lean();
    } else {
      user = user.toObject ? user.toObject() : user;
    }

    return res.json({ ok: true, user });
  } catch (e) {
    console.error("/register-user error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// получить юзера
app.get("/get-user", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;

    const user = await User.findOne({ telegramId }).lean();
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    res.json({ ok: true, user });
  } catch (e) {
    console.error("/get-user error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/cart/summary", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);
    if (!telegramId) return;
    // if (!telegramId) {
    //   return res.status(400).json({ ok: false, error: "telegramId is required" });
    // }

    const cart = await Cart.findOne({ telegramId }).lean();
    const items = Array.isArray(cart?.items) ? cart.items : [];

    const totalZl = Number(
      items
        .reduce(
          (sum, item) =>
            sum + Number(item?.qty || 0) * Number(item?.unitPrice || 0),
          0
        )
        .toFixed(2)
    );

    return res.json({
      ok: true,
      totalZl,
      itemsCount: items.length,
    });
  } catch (e) {
    console.error("GET /cart/summary error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/referral/status", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);
    if (!telegramId) return;
    // if (!telegramId) {
    //   return res.status(400).json({ ok: false, error: "telegramId is required" });
    // }

    const user = await User.findOne(
      { telegramId },
      {
        telegramId: 1,
        referral: 1,
        shopBotIndex: 1,
        shopBotKnown: 1,
      }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    await persistShopBotIndexFromInitData(req, telegramId);

    const shopBotIndex = await resolveShopBotIndexForReferral(req, user);
    const referralStatus = attachReferralInviteToStatus(
      await buildReferralStatusForUser(user),
      shopBotIndex
    );

    return res.json({
      ok: true,
      referralStatus,
    });
  } catch (e) {
    console.error("GET /referral/status error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/referral/claim", async (req, res) => {

  try {

    console.log("[REFERRAL CLAIM] NEW ROUTE HIT", {

      hasInitData: Boolean(req.headers?.["x-telegram-init-data"]),

      groupId: req.body?.groupId,

    });

    const telegramId = requireTrustedTelegramId(req, res);

    console.log("[REFERRAL CLAIM] TRUSTED TELEGRAM ID:", telegramId);

    if (!telegramId) return;

    const safeGroupId = String(req.body?.groupId || "").trim();

    if (!safeGroupId) {
      return res.status(400).json({
        ok: false,
        error: "GROUP_ID_REQUIRED",
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const referralStatus = await buildReferralStatusForUser(user);
    const groups = Array.isArray(referralStatus?.groups) ? referralStatus.groups : [];

    const selectedGroup = groups.find(
      (group) => String(group?.id || "") === safeGroupId
    );

    if (!selectedGroup) {
      return res.status(404).json({ ok: false, error: "REFERRAL_GROUP_NOT_FOUND" });
    }

    if (selectedGroup.rewardClaimed === true || selectedGroup.isClaimed === true) {
      return res.json({ ok: false, status: "ALREADY_CLAIMED" });
    }

    const memberIds = Array.isArray(selectedGroup?.members)
      ? selectedGroup.members.map((m) => String(m?.telegramId || "").trim()).filter(Boolean)
      : [];

    if (memberIds.length < 2) {
      return res.json({ ok: false, status: "NOT_ENOUGH_REFERRALS" });
    }

    const referredUsers = await User.find(
      { telegramId: { $in: memberIds } },
      { telegramId: 1, username: 1, firstName: 1, referral: 1 }
    ).lean();

    const referredById = new Map(
      referredUsers.map((row) => [String(row.telegramId || ""), row])
    );

    const paidOrderTelegramIds = await Order.distinct("userTelegramId", {
      userTelegramId: { $in: memberIds },
      $or: [
        { "payment.status": "paid" },
        { status: { $in: ["processing", "done"] } },
      ],
    });

    const paidSet = new Set(
      (paidOrderTelegramIds || []).map((x) => String(x || "").trim())
    );

    const members = memberIds.map((tgId) => {
      const refUser = referredById.get(tgId);
      const completed =
        Boolean(refUser?.referral?.firstOrderDoneAt) || paidSet.has(tgId);

      return {
        telegramId: tgId,
        displayName: getReferralDisplayName(refUser || { telegramId: tgId }),
        completed,
      };
    });

    const completedMembers = members.filter((m) => m?.completed === true);
    const pendingMembers = members.filter((m) => m?.completed !== true);

    if (completedMembers.length === 1 && pendingMembers.length === 1) {
      return res.json({
        ok: false,
        status: "ONE_COMPLETED",
        completed: completedMembers[0].displayName,
        pending: pendingMembers[0].displayName,
      });
    }

    if (completedMembers.length === 0) {
      return res.json({
        ok: false,
        status: "NONE_COMPLETED",
        users: members.map((m) => m.displayName),
      });
    }

    if (completedMembers.length !== 2) {
      return res.json({ ok: false, status: "GROUP_NOT_READY" });
    }

    const realGroups = ensureReferralGroupsArray(user);
    const targetGroup = realGroups.find(
      (group) => String(group?._id || "") === safeGroupId
    );

    if (!targetGroup) {
      return res.status(404).json({ ok: false, error: "REFERRAL_GROUP_NOT_FOUND" });
    }

    if (targetGroup.rewardClaimed === true) {
      return res.json({ ok: false, status: "ALREADY_CLAIMED" });
    }

    targetGroup.rewardClaimed = true;
    targetGroup.rewardClaimedAt = new Date();

    user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];
    user.cashbackLedger.push({
      sourceOrderId: null,
      amountZl: 25,
      remainingZl: 25,
      earnedAt: new Date(),
      expiresAt: addDays(new Date(), 40),
      warnedAt: null,
      expiredAt: null,
    });

    if (typeof user.markModified === "function") {
      user.markModified("referral.rewardGroups");
      user.markModified("cashbackLedger");
    }

    recalcUserCashbackBalanceFromLedger(user);
    await user.save();

    return res.json({
      ok: true,
      status: "REWARD_GRANTED",
      amount: 25,
      groupId: safeGroupId,
    });
  } catch (e) {
    console.error("POST /referral/claim error:", e);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

}
