import { api } from "./api";
import { shouldUseStaticClientData } from "./staticMode";

export interface QuickStats {
  ordersToday: number;
  inTransit: number;
  ndrPending: number;
  rtoPending: number;
}

export interface RecentHomeOrder {
  id: string;
  orderId: string;
  awb: string;
  status: string;
  serviceProvider: string;
  city: string;
  contactName: string;
  createdAt: string;
}

export interface StatusBucket {
  status: string;
  count: number;
}

export interface SellerHomeData {
  quickStats: QuickStats;
  wallet: { balance: number };
  codPending: { amount: number; count: number };
  statusDistribution: StatusBucket[];
  recentOrders: RecentHomeOrder[];
}

export const homeApi = {
  get: async (): Promise<SellerHomeData> => {
    const emptyHome: SellerHomeData = {
      quickStats: {
        ordersToday: 0,
        inTransit: 0,
        ndrPending: 0,
        rtoPending: 0,
      },
      wallet: { balance: 0 },
      codPending: { amount: 0, count: 0 },
      statusDistribution: [],
      recentOrders: [],
    };

    if (shouldUseStaticClientData()) return emptyHome;

    try {
      const { data } = await api.get("/dashboard/home");
      return data as SellerHomeData;
    } catch {
      return emptyHome;
    }
  },
};
