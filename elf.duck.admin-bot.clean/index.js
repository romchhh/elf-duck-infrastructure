import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { assertAdminBotEnv } from "./src/config.js";
import { launchAdminBot } from "./src/launchAdminBot.js";

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.env"
  ),
});

assertAdminBotEnv();
await launchAdminBot();
