import { api } from "./api";
import { shouldUseStaticClientData } from "./staticMode";

export interface NotificationItem {
  id: string;
  event: string;
  category: string;
  title: string;
  body: string;
  link?: string;
  readAt: string | null;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
}

export interface PreferenceItem {
  key: string;
  category: string;
  label: string;
  description: string;
  channels: ("email" | "whatsapp" | "inApp")[];
  mandatory: boolean;
  settings: { email: boolean; whatsapp: boolean; inApp: boolean };
}

export interface PreferencesResponse {
  mute: { email: boolean; whatsapp: boolean; inApp: boolean };
  events: PreferenceItem[];
  categories: string[];
}

const CLIENT_NOTIFICATION_PREFS_KEY = "logicorp-client-notification-preferences";

function defaultPreferences(): PreferencesResponse {
  return {
    mute: { email: false, whatsapp: false, inApp: false },
    categories: ["orders", "payments", "account", "support"],
    events: [
      {
        key: "order.created",
        category: "orders",
        label: "Order updates",
        description: "New order, pickup, shipping and delivery updates.",
        channels: ["email", "inApp"],
        mandatory: false,
        settings: { email: true, whatsapp: false, inApp: true },
      },
      {
        key: "wallet.low_balance",
        category: "payments",
        label: "Wallet balance",
        description: "Low balance and wallet credit alerts.",
        channels: ["email", "inApp"],
        mandatory: false,
        settings: { email: true, whatsapp: false, inApp: true },
      },
      {
        key: "account.security",
        category: "account",
        label: "Security alerts",
        description: "Login, password and important account security updates.",
        channels: ["email", "inApp"],
        mandatory: true,
        settings: { email: true, whatsapp: false, inApp: true },
      },
      {
        key: "support.ticket",
        category: "support",
        label: "Support replies",
        description: "Replies and status changes on your support tickets.",
        channels: ["email", "inApp"],
        mandatory: false,
        settings: { email: true, whatsapp: false, inApp: true },
      },
    ],
  };
}

function readPreferences(): PreferencesResponse {
  if (typeof window === "undefined") return defaultPreferences();
  const raw = localStorage.getItem(CLIENT_NOTIFICATION_PREFS_KEY);
  if (!raw) {
    const prefs = defaultPreferences();
    localStorage.setItem(CLIENT_NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    return prefs;
  }
  try {
    return JSON.parse(raw) as PreferencesResponse;
  } catch {
    const prefs = defaultPreferences();
    localStorage.setItem(CLIENT_NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    return prefs;
  }
}

function writePreferences(prefs: PreferencesResponse): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(CLIENT_NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  }
}

export const notificationsApi = {
  list: async (opts?: { limit?: number; unread?: boolean }) => {
    if (shouldUseStaticClientData()) return { items: [], unreadCount: 0 };
    try {
      const { data } = await api.get<NotificationListResponse>("/notifications", {
        params: { limit: opts?.limit, unread: opts?.unread },
      });
      return data;
    } catch {
      return { items: [], unreadCount: 0 };
    }
  },
  unreadCount: async () => {
    if (shouldUseStaticClientData()) return 0;
    try {
      const { data } = await api.get<{ count: number }>("/notifications/unread-count");
      return data.count;
    } catch {
      return 0;
    }
  },
  markRead: async (id: string) => {
    if (shouldUseStaticClientData()) return;
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      return;
    }
  },
  markAllRead: async () => {
    if (shouldUseStaticClientData()) return;
    try {
      await api.post("/notifications/read-all");
    } catch {
      return;
    }
  },
  getPreferences: async () => {
    if (shouldUseStaticClientData()) return readPreferences();
    try {
      const { data } = await api.get<PreferencesResponse>("/notifications/preferences");
      return data;
    } catch {
      return readPreferences();
    }
  },
  updatePreference: async (payload: {
    event?: string;
    channel?: "email" | "whatsapp" | "inApp";
    enabled?: boolean;
    mute?: Partial<{ email: boolean; whatsapp: boolean; inApp: boolean }>;
  }) => {
    if (!shouldUseStaticClientData()) {
      try {
        await api.put("/notifications/preferences", payload);
        return;
      } catch {
        // Keep static preferences usable when the API is unavailable.
      }
    }

    const prefs = readPreferences();
    if (payload.mute) {
      prefs.mute = { ...prefs.mute, ...payload.mute };
    }
    if (payload.event && payload.channel && typeof payload.enabled === "boolean") {
      prefs.events = prefs.events.map((event) =>
        event.key === payload.event
          ? { ...event, settings: { ...event.settings, [payload.channel!]: payload.enabled! } }
          : event,
      );
    }
    writePreferences(prefs);
  },
};
