import { setAccessToken } from "@/lib/api";
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
  const raw = localStorage.getItem("logicorp-admin-user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return DEMO_ADMIN;
  }
}

function persistAdmin(user: User): User {
  localStorage.setItem("logicorp-admin-user", JSON.stringify(user));
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
    const user = {
      ...DEMO_ADMIN,
      email: params.email.trim() || DEMO_ADMIN.email,
    };
    return { user: persistAdmin(user) };
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem("logicorp-admin-user");
    setAccessToken(null);
  },

  changePassword: async (_params: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> => {
    return { message: "Password updated in static demo mode." };
  },
};
