import { api } from "../api.js";

let BROADCAST_TEMPLATES = [];

export const loadBroadcastTemplates = async () => {
  const attempts = 8;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const data = await api("/admin/broadcast/templates");
      BROADCAST_TEMPLATES = Array.isArray(data.templates) ? data.templates : [];
      return;
    } catch (e) {
      lastError = e;
      const refused =
        e?.cause?.code === "ECONNREFUSED" ||
        /fetch failed|ECONNREFUSED/i.test(String(e?.message || e));
      if (!refused || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error("loadBroadcastTemplates:", lastError);
  BROADCAST_TEMPLATES = [];
};

export const getBroadcastTemplateById = (id) =>
  BROADCAST_TEMPLATES.find((x) => String(x._id) === String(id));
