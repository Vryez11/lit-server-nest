import { toCustomerStoreResponse } from './customer-store.mapper';
import { CustomerStoreDetailRecord } from '../services/customer-stores.select';

const baseRecord = {
  id: 'store-1',
  slug: 'test-store',
  business_name: '테스트 미용실',
  description: null,
  phone_number: '010-0000-0000',
  store_phone_number: null,
  notification_phone: null,
  address: '서울시 어딘가',
  latitude: null,
  longitude: null,
  business_type: 'BEAUTY_SALON',
  store_operating_hours: null,
  store_settings: null,
  reviews: [],
  _count: { reservations: 0 },
} as unknown as CustomerStoreDetailRecord;

describe('toCustomerStoreResponse', () => {
  it('businessType을 응답에 포함한다', () => {
    const result = toCustomerStoreResponse(baseRecord);
    expect(result.businessType).toBe('BEAUTY_SALON');
  });

  it('business_type이 null이면 businessType도 null이다', () => {
    const record = {
      ...baseRecord,
      business_type: null,
    } as unknown as CustomerStoreDetailRecord;
    expect(toCustomerStoreResponse(record).businessType).toBeNull();
  });
});
