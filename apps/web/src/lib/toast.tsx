export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: message }));
}
