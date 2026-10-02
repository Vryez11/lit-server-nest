import { admins } from '@prisma/client';
import { toAdminInfo, toAdminSummary } from './admin.mapper';

const createAdmin = (): admins => ({
  id: 'adm_1',
  email: 'ops@example.com',
  password_hash: 'hashed-password',
  name: '운영팀',
  is_active: true,
  login_count: 0,
  login_locked_until: null,
  last_login_at: new Date('2026-09-30T00:00:00.000Z'),
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  updated_at: new Date('2026-09-01T00:00:00.000Z'),
});

describe('admin.mapper', () => {
  it('maps the login summary without exposing the password hash', () => {
    const summary = toAdminSummary(createAdmin());

    expect(summary).toEqual({
      id: 'adm_1',
      email: 'ops@example.com',
      name: '운영팀',
      lastLoginAt: new Date('2026-09-30T00:00:00.000Z'),
    });
    expect(summary).not.toHaveProperty('password_hash');
    expect(summary).not.toHaveProperty('passwordHash');
  });

  it('maps the me response in camelCase', () => {
    expect(toAdminInfo(createAdmin())).toEqual({
      id: 'adm_1',
      email: 'ops@example.com',
      name: '운영팀',
      isActive: true,
      lastLoginAt: new Date('2026-09-30T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });
  });
});
