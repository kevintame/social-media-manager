"use client";

import { useEffect } from "react";

export function VaultReconciler() {
  useEffect(() => {
    const reconcile = () => fetch("/api/sync", { method: "POST", headers: { "x-social-sync": "poll" } }).catch(() => undefined);
    const timer = window.setInterval(reconcile, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
