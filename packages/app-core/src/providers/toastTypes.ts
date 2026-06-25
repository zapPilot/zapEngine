/**
 * Toast shape shared by the toast provider/context (this package) and the
 * `ToastNotification` UI component (frontend). Lives here so the provider has
 * no dependency on a UI component.
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  link?:
    | {
        text: string;
        url: string;
      }
    | undefined;
  action?:
    | {
        label: string;
        onClick: () => void;
      }
    | undefined;
  duration?: number;
}
