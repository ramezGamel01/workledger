import { create } from "zustand";

export type DialogName =
  "previous-work" | "edit-session" | "add-evidence" | null;

export interface ToastMessage {
  id: string;
  tone: "success" | "error" | "info";
  message: string;
}

interface UiState {
  sidebarOpen: boolean;
  dialog: DialogName;
  dialogEntityId: string | null;
  toasts: ToastMessage[];
  setSidebarOpen: (open: boolean) => void;
  openDialog: (dialog: Exclude<DialogName, null>, entityId?: string) => void;
  closeDialog: () => void;
  pushToast: (tone: ToastMessage["tone"], message: string) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: false,
  dialog: null,
  dialogEntityId: null,
  toasts: [],
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  openDialog: (dialog, entityId) =>
    set({ dialog, dialogEntityId: entityId ?? null, sidebarOpen: false }),
  closeDialog: () => set({ dialog: null, dialogEntityId: null }),
  pushToast: (tone, message) => {
    const toast: ToastMessage = { id: crypto.randomUUID(), tone, message };
    set({ toasts: [...get().toasts, toast] });
    window.setTimeout(() => get().dismissToast(toast.id), 4500);
  },
  dismissToast: (id) =>
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));
