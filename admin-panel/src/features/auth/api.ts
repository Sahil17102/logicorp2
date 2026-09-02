import { setAccessToken } from "@/lib/api";
import { seedAdmin, STATIC_ADMIN_KEY } from "@/lib/staticSeeds";
import type { User } from "./types";

const DEMO_ADMIN: User = {
  id: "demo-admin-user",
  email: "admin@logicorp.in",
  phone: null,
  name: "Demo Admin",
  firstName: "Demo",
  lastName: "Admin",
  role: "superadmin",
  designation: "Operations Lead",
  roleLabel: "Superadmin",
  assignedSellerIds: [],
  permissions: [],
  isVerified: true,
  onboardingComplete: true,
};

function readAdmin(): User | null {
  const raw = localStorage.getItem(STATIC_ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function persistAdmin(user: User): User {
  localStorage.setItem(STATIC_ADMIN_KEY, JSON.stringify(user));
  setAccessToken("static-admin-token");
  return user;
}

export const authApi = {
  getSession: async (): Promise<User | null> => {
    const user = readAdmin();
    if (user) setAccessToken("static-admin-token");
    return user;
  },

  login: async (params: {
    email: string;
    password: string;
  }): Promise<{ user: User }> => {
    const seededAdmin = seedAdmin();
    const user = {
      ...seededAdmin,
      email: params.email.trim() || seededAdmin.email || DEMO_ADMIN.email,
    };
    return { user: persistAdmin(user) };
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem(STATIC_ADMIN_KEY);
    setAccessToken(null);
  },

  changePassword: async (_params: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> => {
    return { message: "Password updated in static demo mode." };
  },
};
