import {
  broadcastJobs,
  inpostTrackingInputState,
  managerClientMessageState,
  managerClientMessageStateByChat,
  paymentReminderIntervals,
  paymentReminderTimeouts,
  PROMO_CODES_COLLECTION,
  BROADCAST_TEMPLATES_COLLECTION,
} from "../runtimeState.js";
import { getActiveUserBots } from "../botRegistry.js";
import * as c0 from "./chunk00.js";
import * as c1 from "./chunk01.js";
import * as c2 from "./chunk02.js";
import * as c3 from "./chunk03.js";
import * as c4 from "./chunk04.js";
import * as c5 from "./chunk05.js";
import * as c6 from "./chunk06.js";
import * as c7 from "./chunk07.js";
import * as c8 from "./chunk08.js";
import * as c9 from "./chunk09.js";
import * as c10 from "./chunk10.js";
import * as c11 from "./chunk11.js";
import * as c12 from "./chunk12.js";
import * as c13 from "./chunk13.js";
const merged = {
  ...c0,
  ...c1,
  ...c2,
  ...c3,
  ...c4,
  ...c5,
  ...c6,
  ...c7,
  ...c8,
  ...c9,
  ...c10,
  ...c11,
  ...c12,
  ...c13,
  getActiveUserBots,
  broadcastJobs,
  inpostTrackingInputState,
  managerClientMessageState,
  managerClientMessageStateByChat,
  paymentReminderTimeouts,
  paymentReminderIntervals,
  PROMO_CODES_COLLECTION,
  BROADCAST_TEMPLATES_COLLECTION,
};
export default merged;