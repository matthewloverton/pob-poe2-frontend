import { create } from "zustand";

export type ToastKind = "info" | "error" | "success";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface PromptState {
  title: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}

interface ConfirmState {
  title: string;
  message?: string;
  resolve: (value: boolean) => void;
}

interface DialogStore {
  toasts: Toast[];
  prompt: PromptState | null;
  confirm: ConfirmState | null;

  pushToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;

  openPrompt: (title: string, placeholder?: string) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;

  openConfirm: (title: string, message?: string) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
}

let toastIdCounter = 1;

export const useDialogStore = create<DialogStore>((set, get) => ({
  toasts: [],
  prompt: null,
  confirm: null,

  pushToast: (message, kind = "info") =>
    set((state) => {
      const id = toastIdCounter++;
      const toast: Toast = { id, message, kind };
      setTimeout(() => get().dismissToast(id), 4000);
      return { toasts: [...state.toasts, toast] };
    }),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  openPrompt: (title, placeholder) =>
    new Promise<string | null>((resolve) => {
      set({ prompt: { title, placeholder, resolve } });
    }),
  resolvePrompt: (value) => {
    const p = get().prompt;
    if (p) {
      p.resolve(value);
      set({ prompt: null });
    }
  },

  openConfirm: (title, message) =>
    new Promise<boolean>((resolve) => {
      set({ confirm: { title, message, resolve } });
    }),
  resolveConfirm: (value) => {
    const c = get().confirm;
    if (c) {
      c.resolve(value);
      set({ confirm: null });
    }
  },
}));
