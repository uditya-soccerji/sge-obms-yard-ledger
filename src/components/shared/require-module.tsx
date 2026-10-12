"use client";

import { EmptyState } from "@/components/shared/ui-bits";
import { effectivePermission } from "@/lib/permissions";
import { ROLES } from "@/lib/roles";
import { useStore } from "@/lib/store";
import type { ModuleId, PermissionAction, RoleId } from "@/lib/types";
import { ROLE_MATRIX } from "@/lib/permissions";

/** Roles whose default rights include this module + action, for the "who it's for" line. */
function rolesWith(module: ModuleId, action: PermissionAction): string[] {
  return (Object.keys(ROLE_MATRIX) as RoleId[])
    .filter((r) => ROLE_MATRIX[r][module]?.includes(action))
    .map((r) => ROLES.find((x) => x.id === r)?.label ?? r);
}

/**
 * Page guard: shows the page only when the active role may view the module
 * (lib/permissions.ts). Every signed-in page goes through it, so typing a URL
 * doesn't get around the role model.
 */
export function RequireModule({
  module,
  action = "view",
  children,
}: {
  module: ModuleId;
  action?: PermissionAction;
  children: React.ReactNode;
}) {
  const { state, currentAccount } = useStore();
  if (effectivePermission(currentAccount, state.currentRole, module, action)) return <>{children}</>;
  const who = rolesWith(module, action);
  return (
    <EmptyState
      title="This page isn't for your seat"
      detail={who.length ? `It's for: ${who.join(", ")}. Switch to one of those seats to open it.` : "Ask the Super Admin for access."}
    />
  );
}

/** Wrap a page component in RequireModule. */
export function guarded<P extends object>(module: ModuleId, Page: React.ComponentType<P>, action: PermissionAction = "view") {
  function GuardedPage(props: P) {
    return (
      <RequireModule module={module} action={action}>
        <Page {...props} />
      </RequireModule>
    );
  }
  GuardedPage.displayName = `Guarded(${Page.displayName ?? Page.name ?? "Page"})`;
  return GuardedPage;
}
