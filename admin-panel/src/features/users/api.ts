import { api } from "@/lib/api";
import { readStaticUsers, writeStaticUsers } from "@/lib/staticSeeds";
import type {
  ListUsersResponse,
  UserListItem,
  ListTeamMembersResponse,
  CreateTeamMemberPayload,
  TeamMember,
  ResetPasswordResponse,
  UserSummary,
} from "./types";

const useStaticData = !import.meta.env.VITE_API_URL || import.meta.env.VITE_STATIC_DATA_ENABLED === "true";
const KYC_STATUSES = ["not_submitted", "pending", "approved", "rejected"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizePlan(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  const plan = asRecord(value);
  return nullableString(plan.slug) ?? nullableString(plan.name)?.toLowerCase() ?? "basic";
}

function normalizeKycStatus(value: unknown): UserListItem["kycStatus"] {
  return typeof value === "string" && KYC_STATUSES.includes(value as UserListItem["kycStatus"])
    ? (value as UserListItem["kycStatus"])
    : "not_submitted";
}

function normalizeUser(raw: unknown): UserListItem {
  const user = asRecord(raw);
  const profile = asRecord(user.companyProfile);
  const now = new Date().toISOString();

  return {
    id: String(user.id ?? user._id ?? ""),
    name: nullableString(user.name),
    firstName: nullableString(user.firstName),
    lastName: nullableString(user.lastName),
    email: nullableString(user.email),
    phone: nullableString(user.phone),
    businessName: nullableString(user.businessName) ?? nullableString(profile.businessName),
    pincode: nullableString(user.pincode) ?? nullableString(profile.pincode),
    city: nullableString(user.city) ?? nullableString(profile.city),
    state: nullableString(user.state) ?? nullableString(profile.state),
    website: nullableString(user.website) ?? nullableString(profile.website),
    supportEmail: nullableString(user.supportEmail) ?? nullableString(profile.supportEmail),
    contactNumber: nullableString(user.contactNumber) ?? nullableString(profile.contactNumber),
    address: nullableString(user.address) ?? nullableString(profile.address),
    sellsOn: stringArray(user.sellsOn ?? profile.sellsOn),
    monthlyShipmentVolume: nullableString(user.monthlyShipmentVolume) ?? nullableString(profile.monthlyShipmentVolume),
    lastLogin: nullableString(user.lastLogin),
    isActive: booleanValue(user.isActive, true),
    onboardingComplete: booleanValue(user.onboardingComplete),
    isVerified: booleanValue(user.isVerified),
    kycStatus: normalizeKycStatus(user.kycStatus),
    plan: normalizePlan(user.plan),
    createdAt: nullableString(user.createdAt) ?? now,
    updatedAt: nullableString(user.updatedAt) ?? nullableString(user.createdAt) ?? now,
  };
}

function normalizeSummary(raw: unknown): UserSummary {
  const summary = asRecord(raw);
  const orders = asRecord(summary.orders);
  const revenue = asRecord(summary.revenue);
  const remittance = asRecord(summary.remittance);
  const wallet = asRecord(summary.wallet);
  const byType = asRecord(orders.byType);
  const byPayment = asRecord(orders.byPayment);

  return {
    orders: {
      total: Number(orders.total) || 0,
      byStatus: asRecord(orders.byStatus) as Record<string, number>,
      byType: { B2B: Number(byType.B2B) || 0, B2C: Number(byType.B2C) || 0 },
      byPayment: { prepaid: Number(byPayment.prepaid) || 0, cod: Number(byPayment.cod) || 0 },
    },
    revenue: {
      total: Number(revenue.total) || 0,
      freight: Number(revenue.freight) || 0,
      cod: Number(revenue.cod) || 0,
    },
    remittance: {
      totalCodCollected: Number(remittance.totalCodCollected) || 0,
      totalRemitted: Number(remittance.totalRemitted) || 0,
      pendingRemittance: Number(remittance.pendingRemittance) || 0,
      pendingCount: Number(remittance.pendingCount) || 0,
      creditedCount: Number(remittance.creditedCount) || 0,
    },
    wallet: {
      balance: Number(wallet.balance) || 0,
      totalCredits: Number(wallet.totalCredits) || 0,
      totalDebits: Number(wallet.totalDebits) || 0,
    },
    topProviders: Array.isArray(summary.topProviders)
      ? summary.topProviders.map((item) => {
        const provider = asRecord(item);
        return {
          provider: String(provider.provider ?? ""),
          count: Number(provider.count) || 0,
          revenue: Number(provider.revenue) || 0,
        };
      })
      : [],
  };
}

function buildStats(users: UserListItem[]): ListUsersResponse["stats"] {
  return {
    total: users.length,
    verified: users.filter((user) => user.isVerified).length,
    onboarded: users.filter((user) => user.onboardingComplete).length,
    active: users.filter((user) => user.isActive).length,
    kycPending: users.filter((user) => user.kycStatus === "pending").length,
    kycVerified: users.filter((user) => user.kycStatus === "approved").length,
    inactive: users.filter((user) => !user.isActive).length,
    notOnboarded: users.filter((user) => !user.onboardingComplete).length,
    kycNotStarted: users.filter((user) => user.kycStatus === "not_submitted").length,
  };
}

function filterUsers(
  users: UserListItem[],
  params?: {
    search?: string;
    onboardingComplete?: string;
    isVerified?: string;
    isActive?: string;
    plan?: string;
    kycStatus?: string;
    page?: number;
    limit?: number;
  },
): ListUsersResponse {
  let filtered = [...users];
  if (params?.search) {
    const query = params.search.toLowerCase();
    filtered = filtered.filter((user) =>
      [user.name, user.email, user.phone, user.businessName, user.city, user.state]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }
  if (params?.onboardingComplete) filtered = filtered.filter((user) => user.onboardingComplete === (params.onboardingComplete === "true"));
  if (params?.isVerified) filtered = filtered.filter((user) => user.isVerified === (params.isVerified === "true"));
  if (params?.isActive) filtered = filtered.filter((user) => user.isActive === (params.isActive === "true"));
  if (params?.plan) filtered = filtered.filter((user) => user.plan === params.plan);
  if (params?.kycStatus) filtered = filtered.filter((user) => user.kycStatus === params.kycStatus);

  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    users: filtered.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
    stats: buildStats(users),
  };
}

export const usersApi = {
  list: async (params?: {
    search?: string;
    onboardingComplete?: string;
    isVerified?: string;
    isActive?: string;
    plan?: string;
    kycStatus?: string;
    page?: number;
    limit?: number;
    sortField?: string;
    sortOrder?: string;
  }): Promise<ListUsersResponse> => {
    if (useStaticData) {
      return filterUsers(readStaticUsers(), params);
    }

    const { data } = await api.get("/users", { params });
    const response = data as ListUsersResponse;
    return {
      ...response,
      users: Array.isArray(response.users) ? response.users.map(normalizeUser) : [],
    };
  },

  getById: async (id: string): Promise<{ user: UserListItem }> => {
    if (useStaticData) {
      const user = readStaticUsers().find((item) => item.id === id);
      if (!user) throw new Error("User not found");
      return { user: normalizeUser(user) };
    }

    const { data } = await api.get(`/users/${id}`);
    const response = data as { user: UserListItem };
    return { ...response, user: normalizeUser(response.user) };
  },

  toggleActive: async (id: string): Promise<{ message: string }> => {
    if (useStaticData) {
      const users = readStaticUsers();
      writeStaticUsers(users.map((user) =>
        user.id === id ? { ...user, isActive: !user.isActive, updatedAt: new Date().toISOString() } : user,
      ));
      return { message: "User updated" };
    }

    const { data } = await api.patch(`/users/${id}/toggle-active`);
    return data as { message: string };
  },

  updatePlan: async (id: string, plan: string): Promise<{ message: string }> => {
    if (useStaticData) {
      const users = readStaticUsers();
      writeStaticUsers(users.map((user) =>
        user.id === id ? { ...user, plan, updatedAt: new Date().toISOString() } : user,
      ));
      return { message: "Plan assigned" };
    }

    const { data } = await api.patch(`/users/${id}/plan`, { plan });
    return data as { message: string };
  },

  // ── Team members ──

  listTeamMembers: async (id: string): Promise<ListTeamMembersResponse> => {
    if (useStaticData) {
      return { members: [] };
    }

    const { data } = await api.get(`/users/${id}/team-members`);
    return data as ListTeamMembersResponse;
  },

  createTeamMember: async (
    id: string,
    payload: CreateTeamMemberPayload,
  ): Promise<{ member: TeamMember }> => {
    if (useStaticData) {
      const member: TeamMember = {
        id: `member-${Date.now()}`,
        name: `${payload.firstName} ${payload.lastName}`,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone ?? null,
        teamRole: "member",
        parentUserId: id,
        isActive: true,
        lastLogin: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { member };
    }

    const { data } = await api.post(`/users/${id}/team-members`, payload);
    return data as { member: TeamMember };
  },

  deleteTeamMember: async (id: string, memberId: string): Promise<void> => {
    if (useStaticData) return;

    await api.delete(`/users/${id}/team-members/${memberId}`);
  },

  resetPassword: async (id: string): Promise<ResetPasswordResponse> => {
    if (useStaticData) {
      return { message: "Temporary password generated", tempPassword: "Logicorp@123", resetBy: "admin" };
    }

    const { data } = await api.post(`/users/${id}/reset-password`);
    return data as ResetPasswordResponse;
  },

  // ── Summary ──

  getSummary: async (id: string): Promise<UserSummary> => {
    if (useStaticData) {
      const user = readStaticUsers().find((item) => item.id === id);
      if (!user) throw new Error("User not found");
      return {
        orders: {
          total: 0,
          byStatus: {},
          byType: { B2B: 0, B2C: 0 },
          byPayment: { prepaid: 0, cod: 0 },
        },
        revenue: { total: 0, freight: 0, cod: 0 },
        remittance: {
          totalCodCollected: 0,
          totalRemitted: 0,
          pendingRemittance: 0,
          pendingCount: 0,
          creditedCount: 0,
        },
        wallet: { balance: 0, totalCredits: 0, totalDebits: 0 },
        topProviders: [],
      };
    }

    const { data } = await api.get(`/users/${id}/summary`);
    return normalizeSummary(data);
  },
};
