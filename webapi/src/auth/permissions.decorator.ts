import { SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionResource } from './permission-matrix';

export const PERMISSION_KEY = 'openturn_permission';

export type PermissionSpec = {
  resource: PermissionResource;
  action: PermissionAction;
};

export const RequirePermission = (
  resource: PermissionResource,
  action: PermissionAction,
) => SetMetadata(PERMISSION_KEY, { resource, action } satisfies PermissionSpec);
