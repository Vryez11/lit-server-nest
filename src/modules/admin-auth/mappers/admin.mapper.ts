import { admins } from '@prisma/client';
import { AdminInfoDto, AdminSummaryDto } from '../dto/admin-auth.dto';

type AdminSummarySource = Pick<
  admins,
  'id' | 'email' | 'name' | 'last_login_at'
>;

type AdminInfoSource = AdminSummarySource &
  Pick<admins, 'is_active' | 'created_at'>;

export const toAdminSummary = (admin: AdminSummarySource): AdminSummaryDto => ({
  id: admin.id,
  email: admin.email,
  name: admin.name,
  lastLoginAt: admin.last_login_at,
});

export const toAdminInfo = (admin: AdminInfoSource): AdminInfoDto => ({
  ...toAdminSummary(admin),
  isActive: admin.is_active,
  createdAt: admin.created_at,
});
