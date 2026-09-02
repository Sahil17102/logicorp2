import type { User } from "@/features/auth/types";
import type { Plan } from "@/features/plans/types";
import type { LocationListItem } from "@/features/serviceability/types";
import type { UserListItem } from "@/features/users/types";

export const STATIC_PLANS_KEY = "logicorp-static-plans";
export const STATIC_USERS_KEY = "logicorp-static-users";
export const STATIC_LOCATIONS_KEY = "logicorp-static-locations";
export const STATIC_ADMIN_KEY = "logicorp-admin-user";
export const STATIC_ADMIN_ACCOUNT_KEY = "logicorp-static-admin-account";

function nowIso(): string {
  return new Date().toISOString();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): T {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, JSON.stringify(value));
  }
  return value;
}

export function readStaticPlans(): Plan[] {
  seedBasicPlan();
  return readJson<Plan[]>(STATIC_PLANS_KEY, []);
}

export function writeStaticPlans(plans: Plan[]): Plan[] {
  return writeJson(STATIC_PLANS_KEY, plans);
}

export function readStaticUsers(): UserListItem[] {
  assignBasicPlan();
  return readJson<UserListItem[]>(STATIC_USERS_KEY, []);
}

export function writeStaticUsers(users: UserListItem[]): UserListItem[] {
  return writeJson(STATIC_USERS_KEY, users);
}

export function readStaticLocations(): LocationListItem[] {
  seedLocations();
  return readJson<LocationListItem[]>(STATIC_LOCATIONS_KEY, []);
}

export function writeStaticLocations(locations: LocationListItem[]): LocationListItem[] {
  return writeJson(STATIC_LOCATIONS_KEY, locations);
}

export function seedBasicPlan(): Plan {
  const plans = readJson<Plan[]>(STATIC_PLANS_KEY, []);
  const existing = plans.find((plan) => plan.slug === "basic");
  if (existing) return existing;

  const basicPlan: Plan = {
    id: "plan-basic",
    name: "Basic",
    slug: "basic",
    description: "Default starter plan for new Logicorp sellers.",
    sortOrder: 1,
    isDefault: true,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writeStaticPlans([basicPlan, ...plans]);
  return basicPlan;
}

export function seedAdmin(): User {
  const admin: User = {
    id: "demo-admin-user",
    email: "admin@logicorp.in",
    phone: null,
    name: "Demo Admin",
    firstName: "Demo",
    lastName: "Admin",
    role: "superadmin",
    designation: "Operations Lead",
    roleLabel: "Superadmin",
    assignedSellerIds: ["demo-client-user"],
    permissions: [],
    isVerified: true,
    onboardingComplete: true,
  };
  return writeJson(STATIC_ADMIN_ACCOUNT_KEY, admin);
}

export function assignBasicPlan(): UserListItem {
  const plan = seedBasicPlan();
  const users = readJson<UserListItem[]>(STATIC_USERS_KEY, []);
  const existing = users.find((user) => user.id === "demo-client-user");
  const seller: UserListItem = {
    id: "demo-client-user",
    name: "Demo Seller",
    firstName: "Demo",
    lastName: "Seller",
    email: "client@logicorp.in",
    phone: "9876543210",
    businessName: "Logicorp Demo Store",
    pincode: "110001",
    city: "New Delhi",
    state: "Delhi",
    website: "https://logicorp2.onrender.com",
    supportEmail: "support@logicorp.in",
    contactNumber: "9876543210",
    address: "Connaught Place, New Delhi",
    sellsOn: ["Website", "Shopify"],
    monthlyShipmentVolume: "100-500",
    lastLogin: nowIso(),
    isActive: true,
    onboardingComplete: true,
    isVerified: true,
    kycStatus: "approved",
    plan: plan.slug,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  writeStaticUsers([seller, ...users.filter((user) => user.id !== seller.id)]);
  return seller;
}

export function seedLocations(): LocationListItem[] {
  const existing = readJson<LocationListItem[]>(STATIC_LOCATIONS_KEY, []);
  if (existing.length > 0) return existing;

  const createdAt = nowIso();
  const locations: LocationListItem[] = [
    { id: "loc-110001", pincode: "110001", city: "New Delhi", state: "Delhi", tags: ["north", "metro"], isActive: true, createdAt, updatedAt: createdAt },
    { id: "loc-400001", pincode: "400001", city: "Mumbai", state: "Maharashtra", tags: ["west", "metro"], isActive: true, createdAt, updatedAt: createdAt },
    { id: "loc-560102", pincode: "560102", city: "Bengaluru", state: "Karnataka", tags: ["south", "metro"], isActive: true, createdAt, updatedAt: createdAt },
    { id: "loc-700001", pincode: "700001", city: "Kolkata", state: "West Bengal", tags: ["east", "metro"], isActive: true, createdAt, updatedAt: createdAt },
    { id: "loc-800001", pincode: "800001", city: "Patna", state: "Bihar", tags: ["east"], isActive: true, createdAt, updatedAt: createdAt },
    { id: "loc-395001", pincode: "395001", city: "Surat", state: "Gujarat", tags: ["west"], isActive: true, createdAt, updatedAt: createdAt },
  ];
  return writeStaticLocations(locations);
}

export function ensureStaticSeeds(): void {
  seedBasicPlan();
  assignBasicPlan();
  seedAdmin();
  seedLocations();
}
