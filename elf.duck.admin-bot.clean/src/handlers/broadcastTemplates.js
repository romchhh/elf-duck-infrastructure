import { api } from "../api.js";

let BROADCAST_TEMPLATES = [];

export const loadBroadcastTemplates = async () => {
  try {
    const data = await api("/admin/broadcast/templates");

    BROADCAST_TEMPLATES = Array.isArray(data.templates) ? data.templates : [];
  } catch (e) {
    console.error("loadBroadcastTemplates:", e);
    BROADCAST_TEMPLATES = [];
  }
};

export const getBroadcastTemplateById = (id) =>
  BROADCAST_TEMPLATES.find((x) => String(x._id) === String(id));
