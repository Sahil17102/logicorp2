import type { User } from "@/contexts/AuthContext";
import { setAccessToken } from "./api";

const DEMO_USER: User = {
  id: "demo-client-user",
  email: "client@logicorp.in",
  phone: null,
  name: "Demo Seller",
  firstName: "Demo",
  lastName: "Seller",
  role: "user",
  teamRole: "owner",
  parentUserId: null,
  isVerified: true,
  onboardingComplete: true,
  hasPassword: true,
};

function readUser(): User | null {
  const raw = localStorage.getItem("logicorp-client-user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return DEMO_USER;
  }
}

function persistUser(user: User): User {
  localStorage.setItem("logicorp-client-user", JSON.stringify(user));
  setAccessToken("static-client-token");
  return user;
}

export const authApi = {
  getSession: async (): Promise<User | null> => {
    const user = readUser();
    if (user) setAccessToken("static-client-token");
    return user;
  },

  sendOtp: async (_email: string): Promise<{ isNewUser: boolean }> => {
    return { isNewUser: false };
  },

  verifyOtp: async (_params: {
    identifier: string;
    code: string;
  }): Promise<{ user: User; isNewUser: boolean }> => {
    return { user: persistUser(DEMO_USER), isNewUser: false };
  },

  loginWithPassword: async (params: {
    identifier: string;
    password: string;
  }): Promise<{ user: User }> => {
    const identifier = params.identifier.trim();
    const user = {
      ...DEMO_USER,
      email: identifier.includes("@") ? identifier : DEMO_USER.email,
      phone: identifier.includes("@") ? DEMO_USER.phone : identifier,
    };
    return { user: persistUser(user) };
  },

  loginWithGoogle: async (_params: {
    accessToken: string;
  }): Promise<{ user: User; isNewUser: boolean }> => {
    return { user: persistUser(DEMO_USER), isNewUser: false };
  },

  onboarding: async (_payload: Record<string, unknown>): Promise<{ user: User }> => {
    return { user: persistUser({ ...DEMO_USER, onboardingComplete: true }) };
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem("logicorp-client-user");
    setAccessToken(null);
  },
};
