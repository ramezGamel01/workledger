import { useEffect, useState } from "react";

import type { LedgerSnapshot } from "@/domain/models";
import { subscribeCloudStatus, type CloudSyncStatus } from "@/services/cloud";
import { observeLedgerSnapshot } from "@/services/workledger";

export interface LedgerState {
  snapshot: LedgerSnapshot | null;
  loading: boolean;
  error: string | null;
}

export function useLedger(): LedgerState {
  const [state, setState] = useState<LedgerState>({
    snapshot: null,
    loading: true,
    error: null,
  });

  useEffect(
    () =>
      observeLedgerSnapshot(
        (snapshot) => setState({ snapshot, loading: false, error: null }),
        () =>
          setState({
            snapshot: null,
            loading: false,
            error:
              "Local data could not be opened. Reload before making changes.",
          }),
      ),
    [],
  );

  return state;
}

export function useNow(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

export function useCloudStatus(): CloudSyncStatus {
  const [status, setStatus] = useState<CloudSyncStatus>({
    state: "connecting",
    message: "Connecting to private cloud storage…",
    version: 0,
  });
  useEffect(() => subscribeCloudStatus(setStatus), []);
  return status;
}
