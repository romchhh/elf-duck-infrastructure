/**
 * Smoke-test referral attach + discount eligibility + reward group shape.
 * Uses disposable telegramIds, cleans up after.
 *
 *   node scripts/test-referral-flow.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, "../.env") });
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import User from "../models/User.js";
import { attachReferralIfAny } from "../lib/server/helpers/chunk13.js";
import { attachReferralToRewardGroup, REFERRAL_REWARD_ZL } from "../lib/server/helpers/chunk01.js";
import { getIsReferralFirstOrderDiscountEligible } from "../lib/server/helpers/chunk06.js";
import { buildReferralStatusForUser } from "../lib/server/helpers/chunk02.js";
import {
  buildReferralMiniAppDeepLink,
  setShopBotUsername,
} from "../lib/telegram/shopBotReferralLink.js";

const PREFIX = `ref_test_${Date.now()}_`;
const inviterTg = `${PREFIX}inviter`;
const inviteeTg = `${PREFIX}invitee`;
const invitee2Tg = `${PREFIX}invitee2`;
const inviterCode = `t${String(Date.now()).slice(-5)}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  const mark = ok ? "OK" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function cleanup() {
  await User.deleteMany({
    telegramId: { $in: [inviterTg, inviteeTg, invitee2Tg] },
  });
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("db:", mongoose.connection?.db?.databaseName);
  await cleanup();

  // --- deep link format ---
  setShopBotUsername(0, "elfduck_store_bot");
  const link = buildReferralMiniAppDeepLink(inviterCode, 0);
  check(
    "invite link uses ?start=ref_CODE (not startapp)",
    /^https:\/\/t\.me\/elfduck_store_bot\?start=ref_/.test(link),
    link
  );
  check(
    "invite link encodes ref_ prefix once",
    link.includes(`start=ref_${inviterCode}`) && !link.includes("ref_ref_"),
    link
  );

  // --- seed inviter ---
  const inviter = await User.create({
    telegramId: inviterTg,
    username: "ref_test_inviter",
    firstName: "Inviter",
    cashbackBalance: 0,
    cashbackLedger: [],
    referral: {
      code: inviterCode,
      usedCode: "",
      rewardGroups: [],
    },
  });

  const invitee = await User.create({
    telegramId: inviteeTg,
    username: "ref_test_invitee",
    firstName: "Invitee",
    cashbackBalance: 0,
    cashbackLedger: [],
    referral: {
      code: "",
      usedCode: "",
      rewardGroups: [],
    },
  });

  // --- attach: happy path ---
  const attached = await attachReferralIfAny(invitee, `ref_${inviterCode}`);
  check("attachReferralIfAny attaches with ref_ prefix", attached === true);

  const inviteeAfter = await User.findOne({ telegramId: inviteeTg }).lean();
  check(
    "invitee.usedCode saved",
    String(inviteeAfter?.referral?.usedCode || "") === inviterCode,
    String(inviteeAfter?.referral?.usedCode || "")
  );
  check(
    "invitee.invitedByTelegramId = inviter",
    String(inviteeAfter?.referral?.invitedByTelegramId || "") === inviterTg
  );

  const inviterAfter = await User.findOne({ telegramId: inviterTg }).lean();
  const groups = inviterAfter?.referral?.rewardGroups || [];
  check("inviter got reward group", groups.length === 1, `groups=${groups.length}`);
  check(
    "reward group has invitee + 25 zl",
    groups[0]?.memberTelegramIds?.includes(inviteeTg) &&
      Number(groups[0]?.rewardAmountZl) === REFERRAL_REWARD_ZL,
    JSON.stringify(groups[0]?.memberTelegramIds)
  );

  // --- attach: self-ref blocked ---
  const selfUser = await User.findOne({ telegramId: inviterTg });
  const selfAttach = await attachReferralIfAny(selfUser, inviterCode);
  check("self-referral blocked", selfAttach === false);

  // --- attach: already used blocked ---
  const inviteeDoc = await User.findOne({ telegramId: inviteeTg });
  const secondAttach = await attachReferralIfAny(inviteeDoc, inviterCode);
  check("second attach blocked (usedCode set)", secondAttach === false);

  // --- attach: bad code ---
  const invitee2 = await User.create({
    telegramId: invitee2Tg,
    username: "ref_test_invitee2",
    firstName: "Invitee2",
    referral: { code: "", usedCode: "", rewardGroups: [] },
  });
  const bad = await attachReferralIfAny(invitee2, "nope999");
  check("unknown code returns false", bad === false);

  // --- discount eligibility ---
  const below = await getIsReferralFirstOrderDiscountEligible(inviteeTg, [
    { qty: 1, unitPrice: 50, baseUnitPrice: 50 },
  ]);
  check(
    "discount blocked below 65 zl",
    below.eligible === false && below.reason === "TOTAL_BELOW_65",
    below.reason
  );

  const okDisc = await getIsReferralFirstOrderDiscountEligible(inviteeTg, [
    { qty: 1, unitPrice: 70, baseUnitPrice: 70 },
  ]);
  check(
    "discount 10% eligible from 65 zl",
    okDisc.eligible === true && Number(okDisc.percent) === 10,
    `${okDisc.reason} percent=${okDisc.percent}`
  );

  const noCode = await getIsReferralFirstOrderDiscountEligible(invitee2Tg, [
    { qty: 1, unitPrice: 100, baseUnitPrice: 100 },
  ]);
  check(
    "discount blocked without usedCode",
    noCode.eligible === false && noCode.reason === "NO_USED_REFERRAL_CODE",
    noCode.reason
  );

  // --- status: waiting purchase ---
  const freshInviter = await User.findOne({ telegramId: inviterTg });
  const status = await buildReferralStatusForUser(freshInviter);
  check("status has 1 referral", status.referralsCount === 1);
  const g0 = status.groups?.[0];
  check(
    "group not claimable before purchase",
    g0 && g0.isClaimable === false && g0.completedCount === 0,
    `claimable=${g0?.isClaimable} completed=${g0?.completedCount}`
  );

  // simulate first purchase done
  await User.updateOne(
    { telegramId: inviteeTg },
    { $set: { "referral.firstOrderDoneAt": new Date() } }
  );
  const freshInviter2 = await User.findOne({ telegramId: inviterTg });
  const status2 = await buildReferralStatusForUser(freshInviter2);
  const g1 = status2.groups?.[0];
  check(
    "group claimable after firstOrderDoneAt",
    g1 && g1.isClaimable === true && g1.completedCount === 1,
    `claimable=${g1?.isClaimable} completed=${g1?.completedCount} reward=${g1?.rewardAmountZl}`
  );
  check(
    "reward amount is 25",
    Number(g1?.rewardAmountZl) === 25
  );

  // --- duplicate group attach ---
  const inviterDoc = await User.findOne({ telegramId: inviterTg });
  const dup = attachReferralToRewardGroup(inviterDoc, inviteeTg);
  check("duplicate member not added to new group", dup === false);

  await cleanup();
  await mongoose.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log("\n---");
  console.log(`passed ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("referral flow OK");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await cleanup();
  } catch {}
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
