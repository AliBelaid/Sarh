import { SetMetadata } from '@nestjs/common';
import { SijilliRole } from '../types';

export const ROLES_KEY = 'sijilli.roles';

// Restrict a controller method to one or more officer roles.
// Use together with DigitalIdAuthGuard + RolesGuard.
//
// Example:
//   @OfficerOnly('registry_officer', 'super_admin')
//   @Post()  create() { ... }
export const OfficerOnly = (...roles: Exclude<SijilliRole, 'citizen'>[]) =>
  SetMetadata(ROLES_KEY, roles);

export const Roles = (...roles: SijilliRole[]) => SetMetadata(ROLES_KEY, roles);
