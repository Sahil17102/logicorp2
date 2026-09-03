import type { User } from "@/contexts/AuthContext";
import { setAccessToken } from "./api";
import { isCourierApiConfigured, loginCourierApi, shouldUseCourierApi } from "./courierApi";

const USER_STORAGE_KEY = "logicorp-client-user";
const ONBOARDING_STORAGE_KEY = "logicorp-client-onboarding-complete";

const DEMO_USER: User = {
  id: "demo-client-user",
  email: "support@logicorp.in",
  phone: null,
  name: "Sahil Mittal",
  firstName: "Sahil",
  lastName: "Mittal",
  role: "user",
  teamRole: "owner",
  parentUserId: null,
  isVerified: true,
  onboardingComplete: true,
  hasPassword: true,
};

function hasCompletedOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "false";
}

function withOnboardingState(user: User): User {
  const isLegacyDemoUser =
    user.id === DEMO_USER.id ||
    user.name === "Demo Seller" ||
    user.email === "client@logicorp.in";

  return {
    ...user,
    email: isLegacyDemoUser && user.email === "client@logicorp.in" ? DEMO_USER.email : user.email,
    name: isLegacyDemoUser ? DEMO_USER.name : user.name || DEMO_USER.name,
    firstName: isLegacyDemoUser ? DEMO_USER.firstName : user.firstName || DEMO_USER.firstName,
    lastName: isLegacyDemoUser ? DEMO_USER.lastName : user.lastName || DEMO_USER.lastName,
    isVerified: true,
    onboardingComplete: true,
  };
}

function readUser(): User | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return withOnboardingState(JSON.parse(raw) as User);
  } catch {
    return withOnboardingState(DEMO_USER);
  }
}

function persistUser(user: User): User {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  const normalized = withOnboardingState(user);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
  setAccessToken("static-client-token");
  return normalized;
}

function makeLoginUser(identifier?: string): User {
  const cleanIdentifier = identifier?.trim() || "";
  return {
    ...DEMO_USER,
    email: cleanIdentifier.includes("@") ? cleanIdentifier : DEMO_USER.email,
    phone: cleanIdentifier && !cleanIdentifier.includes("@") ? cleanIdentifier : DEMO_USER.phone,
    onboardingComplete: true,
  };
}

export const authApi = {
  getSession: async (): Promise<User | null> => {
    const user = readUser();
    if (user) setAccessToken("static-client-token");
    return user;
  },

  sendOtp: async (_email: string): Promise<{ isNewUser: boolean }> => {
    return { isNewUser: !hasCompletedOnboarding() };
  },

  verifyOtp: async (params: {
    identifier: string;
    code: string;
  }): Promise<{ user: User; isNewUser: boolean }> => {
    const user = makeLoginUser(params.identifier);
    return { user: persistUser(user), isNewUser: !user.onboardingComplete };
  },

  loginWithPassword: async (params: {
    identifier: string;
    password: string;
  }): Promise<{ user: User }> => {
    const identifier = params.identifier.trim();
    if (shouldUseCourierApi() && !isCourierApiConfigured()) {
      await loginCourierApi(identifier, params.password);
    }
    const user = makeLoginUser(identifier);
    return { user: persistUser(user) };
  },

  loginWithGoogle: async (params: {
    accessToken: string;
  }): Promise<{ user: User; isNewUser: boolean }> => {
    const user = makeLoginUser(params.accessToken.includes("@") ? params.accessToken : undefined);
    return { user: persistUser(user), isNewUser: !user.onboardingComplete };
  },

  onboarding: async (payload: Record<string, unknown>): Promise<{ user: User }> => {
    const current = readUser() ?? DEMO_USER;
    const firstName = typeof payload.firstName === "string" ? payload.firstName : current.firstName;
    const lastName = typeof payload.lastName === "string" ? payload.lastName : current.lastName;
    const email = typeof payload.email === "string" ? payload.email : current.email;
    const phone = typeof payload.phone === "string" ? payload.phone : current.phone;

    return {
      user: persistUser({
        ...current,
        firstName,
        lastName,
        name: [firstName, lastName].filter(Boolean).join(" ") || current.name,
        email,
        phone,
        onboardingComplete: true,
      }),
    };
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem(USER_STORAGE_KEY);
    setAccessToken(null);
  },
};
