export type AdminAccessTokenPayload = {
  adminId: string;
  email: string;
  role: 'admin';
  type: 'access';
};

export type AdminRefreshTokenPayload = {
  adminId: string;
  email: string;
  role: 'admin';
  type: 'refresh';
};
