import type { NotificationListResponse } from "./types";

const staticNotifications: NotificationListResponse = {
  items: [
    {
      id: "demo-notification-1",
      event: "shipment.delayed",
      category: "operations",
      title: "12 delayed shipments need review",
      body: "Open orders are already loaded locally for this static admin preview.",
      link: "/orders",
      readAt: null,
      createdAt: "2026-09-02T12:30:00.000Z",
    },
    {
      id: "demo-notification-2",
      event: "cod.remittance",
      category: "finance",
      title: "COD remittance batch is ready",
      body: "Static data is available without connecting an API.",
      link: "/cod-remittance",
      readAt: "2026-09-02T13:00:00.000Z",
      createdAt: "2026-09-02T11:45:00.000Z",
    },
  ],
  unreadCount: 1,
};

export const notificationsApi = {
  list: async (opts?: { limit?: number; unread?: boolean }): Promise<NotificationListResponse> => {
    const items = staticNotifications.items
      .filter((item) => (opts?.unread ? !item.readAt : true))
      .slice(0, opts?.limit ?? staticNotifications.items.length);

    return {
      items,
      unreadCount: staticNotifications.items.filter((item) => !item.readAt).length,
    };
  },
  unreadCount: async (): Promise<number> => {
    return staticNotifications.items.filter((item) => !item.readAt).length;
  },
  markRead: async (id: string): Promise<void> => {
    const notification = staticNotifications.items.find((item) => item.id === id);
    if (notification && !notification.readAt) notification.readAt = new Date().toISOString();
  },
  markAllRead: async (): Promise<void> => {
    const now = new Date().toISOString();
    staticNotifications.items.forEach((item) => {
      item.readAt = item.readAt ?? now;
    });
  },
};
