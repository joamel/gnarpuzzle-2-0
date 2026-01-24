export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  durationMs?: number;
  dismissible?: boolean;
}

const DEFAULT_DURATION_MS: Record<ToastType, number> = {
  info: 3000,
  success: 2500,
  warning: 3500,
  error: 5000,
};

function getOrCreateContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const existing = document.getElementById('gp-toast-container');
  if (existing) return existing;

  const container = document.createElement('div');
  container.id = 'gp-toast-container';
  container.className = 'gp-toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(container);
  return container;
}

export function showToast(message: string, type: ToastType = 'info', options: ToastOptions = {}) {
  const container = getOrCreateContainer();
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `gp-toast gp-toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const text = document.createElement('div');
  text.className = 'gp-toast__text';
  text.textContent = message;

  toast.appendChild(text);

  const dismissible = options.dismissible ?? true;
  if (dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gp-toast__close';
    closeBtn.setAttribute('aria-label', 'Stäng');
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => dismissToast(toast));
    toast.appendChild(closeBtn);
  }

  // Newest on top
  container.prepend(toast);

  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS[type];
  window.setTimeout(() => dismissToast(toast), durationMs);
}

function dismissToast(toast: HTMLElement) {
  if (!toast.isConnected) return;

  toast.classList.add('gp-toast--leaving');
  const remove = () => toast.remove();

  // Match CSS animation duration with a small buffer
  window.setTimeout(remove, 220);
}
