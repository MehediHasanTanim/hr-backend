import { SetMetadata } from '@nestjs/common';

export interface PermissionRequirement {
  resource: string;
  action: string;
}

export const PERMISSIONS_KEY = 'requiredPermissions';

export const Permissions = (...perms: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

export const Require = {
  read: (resource: string) => Permissions({ resource, action: 'read' }),
  write: (resource: string) => Permissions({ resource, action: 'write' }),
  delete: (resource: string) => Permissions({ resource, action: 'delete' }),
  approve: (resource: string) => Permissions({ resource, action: 'approve' }),
  export: (resource: string) => Permissions({ resource, action: 'export' }),
};
