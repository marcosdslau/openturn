import { SetMetadata } from '@nestjs/common';
import { GrupoAcesso } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: GrupoAcesso[]) => SetMetadata(ROLES_KEY, roles);
