export interface AuthenticatedActionModel {
  request(isAuthenticated: boolean, action: () => void): boolean;
  resume(): void;
  cancel(): void;
}

/** Stores one ephemeral continuation while the shared login flow is open. */
export function createAuthenticatedActionModel(): AuthenticatedActionModel {
  let pendingAction: (() => void) | null = null;

  return {
    request(isAuthenticated, action) {
      if (isAuthenticated) {
        action();
        return false;
      }
      pendingAction = action;
      return true;
    },
    resume() {
      const action = pendingAction;
      pendingAction = null;
      action?.();
    },
    cancel() {
      pendingAction = null;
    },
  };
}
