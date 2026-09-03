import { api } from "@/lib/api";
import { readStaticUsers } from "@/lib/staticSeeds";
import type {
  ListWalletsResponse,
  ListWalletsParams,
  ListTransactionsResponse,
  ListTransactionsParams,
  AdjustWalletPayload,
  WalletListItem,
  WalletTransaction,
} from "./types";

const useStaticData = !import.meta.env.VITE_API_URL || import.meta.env.VITE_STATIC_DATA_ENABLED === "true";
const STATIC_WALLET_TRANSACTIONS_KEY = "logicorp-static-wallet-transactions";

function nowIso(): string {
  return new Date().toISOString();
}

function readStaticTransactions(): WalletTransaction[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STATIC_WALLET_TRANSACTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WalletTransaction[]) : [];
  } catch {
    return [];
  }
}

function writeStaticTransactions(transactions: WalletTransaction[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STATIC_WALLET_TRANSACTIONS_KEY, JSON.stringify(transactions));
  }
}

function balanceFor(userId: string, transactions = readStaticTransactions()): number {
  return transactions
    .filter((transaction) => transaction.walletId === `wallet-${userId}`)
    .reduce((sum, transaction) => (
      transaction.type === "credit" ? sum + transaction.amount : sum - transaction.amount
    ), 0);
}

function walletForUser(userId: string): WalletListItem {
  const user = readStaticUsers().find((item) => item.id === userId);
  const createdAt = user?.createdAt ?? nowIso();
  return {
    id: `wallet-${userId}`,
    userId,
    userName: user?.name ?? ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || null),
    userEmail: user?.email ?? null,
    userPhone: user?.phone ?? null,
    businessName: user?.businessName ?? null,
    balance: balanceFor(userId),
    currency: "INR",
    plan: user?.plan ?? "basic",
    isActive: user?.isActive ?? true,
    createdAt,
    updatedAt: nowIso(),
  };
}

function paginate<T>(items: T[], page = 1, limit = 20) {
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export const walletsApi = {
  list: async (params?: ListWalletsParams) => {
    if (useStaticData) {
      let wallets = readStaticUsers().map((user) => walletForUser(user.id));
      if (params?.search) {
        const query = params.search.toLowerCase();
        wallets = wallets.filter((wallet) =>
          [wallet.userName, wallet.userEmail, wallet.userPhone, wallet.businessName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        );
      }
      wallets.sort((a, b) => {
        const dir = params?.sortOrder === "asc" ? 1 : -1;
        const field = params?.sortField ?? params?.sortBy ?? "createdAt";
        if (field === "balance") return (a.balance - b.balance) * dir;
        if (field === "userName") return String(a.userName ?? "").localeCompare(String(b.userName ?? "")) * dir;
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      });
      const { items, pagination } = paginate(wallets, params?.page ?? 1, params?.limit ?? 20);
      return {
        wallets: items,
        pagination,
        stats: {
          totalWallets: wallets.length,
          totalBalance: wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
          walletsWithBalance: wallets.filter((wallet) => wallet.balance !== 0).length,
          walletsEmpty: wallets.filter((wallet) => wallet.balance === 0).length,
        },
      } as ListWalletsResponse;
    }

    const { data } = await api.get<ListWalletsResponse>("/wallets", { params });
    return data;
  },

  getByUserId: async (userId: string) => {
    if (useStaticData) {
      return { wallet: walletForUser(userId) };
    }

    const { data } = await api.get<{ wallet: WalletListItem }>(`/wallets/${userId}`);
    return data;
  },

  transactions: async ({ userId, ...params }: ListTransactionsParams) => {
    if (useStaticData) {
      let transactions = readStaticTransactions().filter(
        (transaction) => transaction.walletId === `wallet-${userId}`,
      );
      if (params.type) {
        transactions = transactions.filter((transaction) => transaction.type === params.type);
      }
      if (params.dateFrom) {
        const from = new Date(params.dateFrom).getTime();
        transactions = transactions.filter((transaction) => new Date(transaction.createdAt).getTime() >= from);
      }
      if (params.dateTo) {
        const to = new Date(params.dateTo).getTime();
        transactions = transactions.filter((transaction) => new Date(transaction.createdAt).getTime() <= to);
      }
      transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const { items, pagination } = paginate(transactions, params.page ?? 1, params.limit ?? 15);
      return { transactions: items, pagination } as ListTransactionsResponse;
    }

    const { data } = await api.get<ListTransactionsResponse>(
      `/wallets/${userId}/transactions`,
      { params },
    );
    return data;
  },

  adjust: async (userId: string, payload: AdjustWalletPayload) => {
    if (useStaticData) {
      const transaction: WalletTransaction = {
        id: `admin-wallet-txn-${Date.now()}`,
        walletId: `wallet-${userId}`,
        amount: payload.amount,
        currency: "INR",
        type: payload.type,
        reason: payload.reason,
        ref: `ADM-${Date.now().toString().slice(-8)}`,
        meta: { notes: payload.notes ?? "", source: "admin_adjustment" },
        createdAt: nowIso(),
      };
      const next = [transaction, ...readStaticTransactions()];
      writeStaticTransactions(next);
      return {
        message: "Wallet adjusted",
        wallet: walletForUser(userId),
        transaction,
      };
    }

    const { data } = await api.post<{
      message: string;
      wallet: WalletListItem;
      transaction: WalletTransaction;
    }>(`/wallets/${userId}/adjust`, payload);
    return data;
  },
};
