/**
 * Демо-реферал для тесту claim у кабінеті.
 *
 *   node scripts/seed-referral-claim-demo.mjs
 *   node scripts/seed-referral-claim-demo.mjs --inviter 7119952932
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

const REFERRAL_REWARD_ZL = 25;

function genRefCode() {
  return Math.random().toString(36).slice(2, 8);
}

function ensureReferralGroupsArray(user) {
  if (!user.referral) user.referral = {};
  user.referral.rewardGroups = Array.isArray(user.referral.rewardGroups)
    ? user.referral.rewardGroups
    : [];
  return user.referral.rewardGroups;
}

function attachReferralToRewardGroup(ownerUser, referredTelegramId) {
  const referralId = String(referredTelegramId || "").trim();
  if (!ownerUser || !referralId) return false;

  const groups = ensureReferralGroupsArray(ownerUser);
  const alreadyAdded = groups.some(
    (group) =>
      Array.isArray(group?.memberTelegramIds) &&
      group.memberTelegramIds.map((x) => String(x)).includes(referralId)
  );
  if (alreadyAdded) return false;

  groups.push({
    pairIndex: groups.length + 1,
    memberTelegramIds: [referralId],
    rewardClaimed: false,
    rewardClaimedAt: null,
    rewardAmountZl: REFERRAL_REWARD_ZL,
  });

  if (typeof ownerUser.markModified === "function") {
    ownerUser.markModified("referral.rewardGroups");
  }

  return true;
}

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, "../.env") });
dotenv.config({ path: path.join(backendRoot, ".env") });

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const INVITER_TG = arg("--inviter", "7119952932");
const TEST_INVITEE_TG = arg("--invitee", "79997119952");
const DEMO_ORDER_NO = "ED-REFDEMO711";

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("db:", mongoose.connection.db.databaseName);

  let inviter = await User.findOne({ telegramId: INVITER_TG });
  if (!inviter) {
    console.error("inviter not found:", INVITER_TG);
    process.exit(1);
  }

  if (!String(inviter?.referral?.code || "").trim()) {
    inviter.referral = inviter.referral || {};
    inviter.referral.code = genRefCode();
    await inviter.save();
  }

  const inviterCode = String(inviter.referral.code || "").trim();

  let invitee = await User.findOne({ telegramId: TEST_INVITEE_TG });
  if (!invitee) {
    invitee = await User.create({
      telegramId: TEST_INVITEE_TG,
      username: "ref_demo_invitee",
      firstName: "Ref Demo",
      lastName: "Test",
      cashbackBalance: 0,
      cashbackLedger: [],
      referral: {
        code: "",
        usedCode: inviterCode,
        invitedByTelegramId: INVITER_TG,
        firstOrderDoneAt: null,
        rewardGroups: [],
      },
    });
    console.log("created test invitee", TEST_INVITEE_TG);
  } else {
    invitee.referral = invitee.referral || {};
    invitee.referral.usedCode = inviterCode;
    invitee.referral.invitedByTelegramId = INVITER_TG;
    await invitee.save();
    console.log("updated test invitee", TEST_INVITEE_TG);
  }

  inviter = await User.findOne({ telegramId: INVITER_TG });
  const groups = ensureReferralGroupsArray(inviter);
  let targetGroup = groups.find(
    (g) =>
      Array.isArray(g?.memberTelegramIds) &&
      g.memberTelegramIds.map(String).includes(TEST_INVITEE_TG)
  );

  if (!targetGroup) {
    attachReferralToRewardGroup(inviter, TEST_INVITEE_TG);
    await inviter.save();
    inviter = await User.findOne({ telegramId: INVITER_TG });
    targetGroup = ensureReferralGroupsArray(inviter).find((g) =>
      g?.memberTelegramIds?.map(String).includes(TEST_INVITEE_TG)
    );
    console.log("attached reward group");
  } else {
    targetGroup.rewardClaimed = false;
    targetGroup.rewardClaimedAt = null;
    inviter.markModified("referral.rewardGroups");
    await inviter.save();
    console.log("reset reward group to unclaimed");
  }

  const product = await Product.findOne({ isActive: { $ne: false } })
    .select({ _id: 1, productKey: 1, title1: 1, title2: 1 })
    .lean();

  if (!product?._id) {
    console.error("no product in DB for demo order");
    process.exit(1);
  }

  const now = new Date();
  await Order.findOneAndUpdate(
    { orderNo: DEMO_ORDER_NO },
    {
      $set: {
        userTelegramId: TEST_INVITEE_TG,
        deliveryType: "pickup",
        status: "completed",
        completedAt: now,
        totalZl: 70,
        items: [
          {
            productId: product._id,
            productKey: String(product.productKey || "ref-demo"),
            productTitle1: String(product.title1 || "Ref demo"),
            productTitle2: String(product.title2 || ""),
            flavors: [
              {
                flavorKey: "ref-demo",
                qty: 1,
                unitPrice: 70,
                baseUnitPrice: 70,
              },
            ],
          },
        ],
        payment: {
          status: "paid",
          method: "blik",
          paidAt: now,
          amountZl: 70,
        },
      },
      $setOnInsert: {
        orderNo: DEMO_ORDER_NO,
        currency: "PLN",
      },
    },
    { upsert: true, new: true }
  );

  await User.updateOne(
    { telegramId: TEST_INVITEE_TG },
    { $set: { "referral.firstOrderDoneAt": now } }
  );

  const freshInviter = await User.findOne({ telegramId: INVITER_TG });
  const groupRow = ensureReferralGroupsArray(freshInviter).find((g) =>
    g?.memberTelegramIds?.map(String).includes(TEST_INVITEE_TG)
  );
  const paid = await Order.distinct("userTelegramId", {
    userTelegramId: TEST_INVITEE_TG,
    status: { $nin: ["canceled", "annulled"] },
    $or: [
      { "payment.status": "paid" },
      { status: { $in: ["processing", "done", "completed", "shipped"] } },
    ],
  });
  const isClaimable =
    Boolean(groupRow) &&
    groupRow.rewardClaimed !== true &&
    paid.map(String).includes(TEST_INVITEE_TG);

  console.log("\n--- ready ---");
  console.log({
    inviter: INVITER_TG,
    inviterCode,
    testInvitee: TEST_INVITEE_TG,
    demoOrderNo: DEMO_ORDER_NO,
    groupId: String(groupRow?._id || ""),
    isClaimable,
    inviteDeepLink: `https://t.me/elfduck_shop_bot?start=ref_${inviterCode}`,
  });

  if (!isClaimable) {
    console.error("WARN: group is not claimable — check order / reward group");
    process.exit(1);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
