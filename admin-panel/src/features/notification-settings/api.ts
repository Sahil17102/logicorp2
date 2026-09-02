import { api } from "@/lib/api";
import type { PreferencesResponse, UpdatePreferencePayload } from "./types";

const ADMIN_NOTIFICATION_PREFS_KEY = "logicorp-admin-notification-preferences";

function defaultPreferences(): PreferencesResponse {
  return {
    mute: { email: false, whatsapp: false, inApp: false },
    categories: ["operations", "finance", "account", "support"],
    events: [
      {
        key: "orders.review",
        category: "operations",
        label: "Order review alerts",
        description: "New orders, delayed shipments and operational exceptions.",
        channels: ["email", "inApp"],
        mandatory: false,
        settings: { email: true, whatsapp: false, inApp: true },
      },
      {
        key: "kyc.pending",
        category: "account",
        label: "KYC approvals",
        description: "Seller KYC and bank approval requests.",
        channels: ["email", "inApp"],
        mandatory: false,
        settings: { email: true, whatsapp: false, inApp: true },
      },
      {
        key: "finance.cod",
        category: "finance",
        label: "COD remittance",
        description: "COD batches, wallet credits and billing events.",
        channels: ["email", "inApp"],
        mandatory: false,
        settings: { email: true, whatsapp: false, inApp: true },
      },
      {
        key: "security.admin",
        category: "account",
        label: "Admin security",
        description: "Login, password and permission security alerts.",
        channels: ["email", "inApp"],
        mandatory: true,
        settings: { email: true, whatsapp: false, inApp: true },
      },
    ],
  };
}

function readPreferences(): PreferencesResponse {
  if (typeof window === "undefined") return defaultPreferences();
  const raw = localStorage.getItem(ADMIN_NOTIFICATION_PREFS_KEY);
  if (!raw) {
    const prefs = defaultPreferences();
    localStorage.setItem(ADMIN_NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    return prefs;
  }
  try {
    return JSON.parse(raw) as PreferencesResponse;
  } catch {
    const prefs = defaultPreferences();
    localStorage.setItem(ADMIN_NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    return prefs;
  }
}

function writePreferences(prefs: PreferencesResponse): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(ADMIN_NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  }
}

export const notificationSettingsApi = {
  getPreferences: async (): Promise<PreferencesResponse> => {
    try {
      const { data } = await api.get<PreferencesResponse>("/notifications/preferences");
      return data?.events ? data : readPreferences();
    } catch {
      return readPreferences();
    }
  },
  updatePreference: async (payload: UpdatePreferencePayload): Promise<void> => {
    try {
      await api.put("/notifications/preferences", payload);
      return;
    } catch {
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
    }
  },
};
