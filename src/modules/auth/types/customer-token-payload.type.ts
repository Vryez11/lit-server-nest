export type CustomerAccessTokenPayload = {
  customerId: string;
  role: 'customer';
  provider?: string;
  type: 'access';
};

export type CustomerRefreshTokenPayload = {
  customerId: string;
  role: 'customer';
  provider?: string;
  type: 'refresh';
};
