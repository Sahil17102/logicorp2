import type { NotificationListResponse } from "./types";

const staticNotifications: NotificationListResponse = {
  items: [],
  unreadCount: 0,
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
