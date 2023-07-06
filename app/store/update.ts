import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FETCH_COMMIT_URL, StoreKey } from "../constant";
import { api } from "../client/api";
import { getClientConfig } from "../config/client";

export interface UpdateStore {
  lastUpdate: number;
  remoteVersion: string;

  used: number;
  subscription: number;
  balance: number;
  lastUpdateUsage: number;

  version: string;
  getLatestVersion: (force?: boolean) => Promise<void>;
  updateUsage: (force?: boolean) => Promise<void>;
}

const ONE_MINUTE = 60 * 1000;

export const useUpdateStore = create<UpdateStore>()(
  persist(
    (set, get) => ({
      lastUpdate: 0,
      remoteVersion: "",

      lastUpdateUsage: 0,

      version: "unknown",

      used: 0,
      subscription: 0,
      balance: 0,

      async getLatestVersion(force = false) {
        set(() => ({ version: getClientConfig()?.commitId ?? "unknown" }));

        const overTenMins = Date.now() - get().lastUpdate > 10 * ONE_MINUTE;
        if (!force && !overTenMins) return;

        set(() => ({
          lastUpdate: Date.now(),
        }));

        try {
          const data = await (await fetch(FETCH_COMMIT_URL)).json();
          const remoteCommitTime = data[0].commit.committer.date;
          const remoteId = new Date(remoteCommitTime).getTime().toString();
          set(() => ({
            remoteVersion: remoteId,
          }));
          console.log("[Got Upstream] ", remoteId);
        } catch (error) {
          console.error("[Fetch Upstream Commit Id]", error);
        }
      },

      async updateUsage(force = false) {
        const overOneMinute = Date.now() - get().lastUpdateUsage >= ONE_MINUTE;
        if (!overOneMinute && !force) return;

        set(() => ({
          lastUpdateUsage: Date.now(),
        }));

        try {
          const usage = await api.llm.usage();
          console.log("[Got Usage] ", usage);

          if (usage) {
            set(() => ({
              balance: usage.balance,
            }));
          }
        } catch (e) {
          console.error((e as Error).message);
        }
      },
    }),
    {
      name: StoreKey.Update,
      version: 1,
    },
  ),
);
