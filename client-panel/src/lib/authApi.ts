import type { User } from "@/contexts/AuthContext";
import { setAccessToken } from "./api";
import { isCourierApiConfigured, loginCourierApi, shouldUseCourierApi } from "./courierApi";

const USER_STORAGE_KEY = "logicorp-client-user";
const ACCOUNTS_STORAGE_KEY = "rocketride-client-accounts";

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

function withOnboardingState(user: User): User {
  const isLegacyDemoUser =
    user.id === DEMO_USER.id ||
    user.name === "Demo Seller" ||
    user.email === "client@logicorp.in";

  return {
    ...user,
    email: isLegacyDemoUser && user.email === "client@logicorp.in" ? DEMO_USER.email : user.email,
    name: isLegacyDemoUser ? DEMO_USER.name : user.name,
    firstName: isLegacyDemoUser ? DEMO_USER.firstName : user.firstName,
    lastName: isLegacyDemoUser ? DEMO_USER.lastName : user.lastName,
    isVerified: true,
    onboardingComplete: user.onboardingComplete,
  };
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function readAccounts(): User[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User[]) : [];
  } catch {
    return [];
  }
}

function findAccount(identifier: string): User | null {
  const normalized = normalizeIdentifier(identifier);
  const saved = readAccounts().find((account) =>
    [account.email, account.phone].some((value) => value && normalizeIdentifier(value) === normalized),
  );
  if (saved) return saved;

  const current = readUser();
  if (current && [current.email, current.phone].some((value) => value && normalizeIdentifier(value) === normalized)) {
    return current;
  }
  return null;
}

function saveAccount(user: User): void {
  const accounts = readAccounts();
  const next = accounts.filter((account) => account.id !== user.id);
  next.push(user);
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
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
  const normalized = withOnboardingState(user);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
  saveAccount(normalized);
  setAccessToken("static-client-token");
  return normalized;
}

function makeLoginUser(identifier?: string, onboardingComplete = false): User {
  const cleanIdentifier = identifier?.trim() || "";
  return {
    ...DEMO_USER,
    id: `client-${normalizeIdentifier(cleanIdentifier || crypto.randomUUID())}`,
    email: cleanIdentifier.includes("@") ? cleanIdentifier : null,
    phone: cleanIdentifier && !cleanIdentifier.includes("@") ? cleanIdentifier : null,
    name: null,
    firstName: null,
    lastName: null,
    onboardingComplete,
    hasPassword: false,
  };
}

export const authApi = {
  getSession: async (): Promise<User | null> => {
    const user = readUser();
    if (user) setAccessToken("static-client-token");
    return user;
  },

  sendOtp: async (identifier: string): Promise<{ isNewUser: boolean }> => {
    return { isNewUser: !findAccount(identifier) };
  },

  verifyOtp: async (params: {
    identifier: string;
    code: string;
  }): Promise<{ user: User; isNewUser: boolean }> => {
    const existingUser = findAccount(params.identifier);
    const user = existingUser ?? makeLoginUser(params.identifier, false);
    return { user: persistUser(user), isNewUser: !existingUser };
  },

  loginWithPassword: async (params: {
    identifier: string;
    password: string;
  }): Promise<{ user: User }> => {
    const identifier = params.identifier.trim();
    if (shouldUseCourierApi() && !isCourierApiConfigured()) {
      await loginCourierApi(identifier, params.password);
    }
    const user = findAccount(identifier);
    if (!user) throw new Error("Account not found. Please sign in with OTP to create your account.");
    return { user: persistUser(user) };
  },

  loginWithGoogle: async (params: {
    accessToken: string;
  }): Promise<{ user: User; isNewUser: boolean }> => {
    const identifier = params.accessToken.includes("@") ? params.accessToken : undefined;
    const existingUser = identifier ? findAccount(identifier) : null;
    const user = existingUser ?? makeLoginUser(identifier, false);
    return { user: persistUser(user), isNewUser: !existingUser };
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
