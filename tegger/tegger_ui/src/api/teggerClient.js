const API_URL = "";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `Ошибка сервера: ${response.status}`;

    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      // Ответ не содержит JSON
    }

    const error = new Error(message);
    error.status = response.status;

    throw error;
  }

  return response.json();
}

async function uploadFile(path, file) {
  const body = new FormData();

  body.append("file", file);

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body,
  });

  if (!response.ok) {
    let message = `Ошибка сервера: ${response.status}`;

    try {
      const data = await response.json();

      message = data.detail || message;
    } catch {
      // Ответ не содержит JSON
    }

    throw new Error(message);
  }

  return response.json();
}

export const teggerClient = {
  worker: {
    status: () => request("/api/campaign-worker/status"),
    start: (id, consentConfirmed) => request(`/api/campaign-worker/start/${encodeURIComponent(id)}`, {method:"POST", body:JSON.stringify({consentConfirmed})}),
    stop: (id) => request(`/api/campaign-worker/stop/${encodeURIComponent(id)}`, {method:"POST"}),
  },
  parser: {
    accounts: () => request("/api/parser/accounts"),
    run: (config) => request("/api/parser/run", { method: "POST", body: JSON.stringify(config) }),
  },
  health: () => request("/api/health"),

  auth: {
    login: (username, password) =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),

    me: () => request("/api/auth/me"),

    logout: () =>
      request("/api/auth/logout", {
        method: "POST",
      }),
  },

  dashboard: () => request("/api/dashboard"),
  logs: {
    list: ({ level = "ALL", sender = "all", search = "" } = {}) =>
      request(`/api/logs?${new URLSearchParams({ level, sender, search }).toString()}`),
  },

    accounts: {
        addImport: async ({ sender, proxy, storyTemplate, file }) => {
          const body = new FormData();
          body.append("sender", sender);
          body.append("proxy", proxy || "");
          body.append("storyTemplate", storyTemplate || "");
          body.append("file", file);
          const response = await fetch(`${API_URL}/api/accounts/add/import`, {
            method: "POST", credentials: "include", body,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
          return data;
        },
        phoneStart: (data) => request("/api/accounts/add/phone/start", { method: "POST", body: JSON.stringify(data) }),
        phoneCode: (data) => request("/api/accounts/add/phone/code", { method: "POST", body: JSON.stringify(data) }),
        phonePassword: (data) => request("/api/accounts/add/phone/password", { method: "POST", body: JSON.stringify(data) }),
        sync: () => request("/api/accounts/sync", { method: "POST" }),

        getChannel: (sender) =>
        request(`/api/accounts/${encodeURIComponent(sender)}/channel`),

        createChannel: (sender) =>
        request(`/api/accounts/${encodeURIComponent(sender)}/channel/create`, {
            method: "POST",
        }),

        logout: (sender, confirmation) =>
        request(`/api/accounts/${encodeURIComponent(sender)}/telegram/logout`, {
            method: "POST",
            body: JSON.stringify({ confirmation }),
        }),

        pinChannel: (sender) =>
        request(`/api/accounts/${encodeURIComponent(sender)}/channel/pin`, {
            method: "POST",
        }),

        uploadChannelAsset: async (sender, kind, file) => {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
            `${API_URL}/api/accounts/${encodeURIComponent(sender)}/channel/assets/${encodeURIComponent(kind)}`,
            {
            method: "POST",
            credentials: "include",
            body: formData,
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        return data;
        },

    list: () => request("/api/accounts"),

    get: (sender) =>

        request(`/api/accounts/${encodeURIComponent(sender)}`),

    getAppearance: (sender) =>

        request(

        `/api/accounts/${encodeURIComponent(sender)}/appearance`

        ),

    getTelegramStatus: (sender) =>
        request(`/api/accounts/${encodeURIComponent(sender)}/telegram/status`),

    uploadAvatar: (sender, file) =>
        uploadFile(
            `/api/accounts/${encodeURIComponent(sender)}/avatar`,
            file
        ),

     getAvatarUrl: (sender) =>
        `${API_URL}/api/accounts/${encodeURIComponent(sender)}/avatar`,

    saveAppearance: (sender, data) =>

        request(

        `/api/accounts/${encodeURIComponent(sender)}/appearance`,

        {

            method: "PUT",

            body: JSON.stringify(data),

        }

        ),

    },

campaigns: {
    addAccount: (id, senderId) => request(`/api/campaigns/${encodeURIComponent(id)}/accounts`, {
      method: "POST", body: JSON.stringify({ senderId }),
    }),
    simulation: (id) => request(`/api/campaigns/${encodeURIComponent(id)}/simulation`),
    simulationAction: (id, action) => request(`/api/campaigns/${encodeURIComponent(id)}/simulation/${encodeURIComponent(action)}`, { method: "POST" }),


    accounts: (id) =>

    request(`/api/campaigns/${encodeURIComponent(id)}/accounts`),

    setStatus: (id, status) =>

    request(`/api/campaigns/${encodeURIComponent(id)}/status`, {

        method: "POST",

        body: JSON.stringify({ status }),

    }),

    startTest: (id) =>
        request(`/api/campaigns/${encodeURIComponent(id)}/test/start`, {
            method: "POST",
        }),

    stopTest: (id) =>
        request(`/api/campaigns/${encodeURIComponent(id)}/test/stop`, {
            method: "POST",
        }),

    testReport: (id) =>
        request(`/api/campaigns/${encodeURIComponent(id)}/test/report`),

  list: () => request("/api/campaigns"),

    preflight: (id) =>

    request(`/api/campaigns/${encodeURIComponent(id)}/preflight`),

    checkWorker: (id) =>

    request(`/api/campaigns/${encodeURIComponent(id)}/worker/check`, {

        method: "POST",

    }),

    dryRun: (id) =>
        request(`/api/campaigns/${encodeURIComponent(id)}/worker/dry-run`, {
            method: "POST",
        }),

  create: (data) =>

    request("/api/campaigns", {

      method: "POST",

      body: JSON.stringify(data),

    }),

    get: (id) =>
      request(`/api/campaigns/${encodeURIComponent(id)}`),

    targets: (id) =>
      request(`/api/campaigns/${encodeURIComponent(id)}/targets`),
  },

  settings: {
    telegram: () => request("/api/settings/telegram"),
    saveTelegram: (data) => request("/api/settings/telegram", { method: "PUT", body: JSON.stringify(data) }),
    testLogBot: () => request("/api/settings/connection-test", { method: "POST" }),
    get: () => request("/api/settings"),
    save: (data) => request("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ ...data.limits, ...data.timings }),
    }),
  },
};

export default teggerClient;