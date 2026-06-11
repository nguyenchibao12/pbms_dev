import { toast as sonnerToast } from 'sonner';

// Bọc sonner để toàn app gọi toast.success/error/... thống nhất.
export const toast = {
  success: (message) => sonnerToast.success(message),
  error: (message) => sonnerToast.error(message),
  info: (message) => sonnerToast.info(message),
  warning: (message) => sonnerToast.warning(message),
};

export { Toaster } from 'sonner';
