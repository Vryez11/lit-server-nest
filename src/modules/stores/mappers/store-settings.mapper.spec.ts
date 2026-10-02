import { Prisma } from '@prisma/client';
import { toStoreSettingsResponse } from './store-settings.mapper';

describe('toStoreSettingsResponse', () => {
  it('returns category objects for Flutter StoreSettings parsing', () => {
    const category = { id: 'wine-bar', name: '와인바', items: [] };

    const response = toStoreSettingsResponse({
      storeId: 'store_1',
      settings: {
        categories: [[], [category]] as Prisma.JsonArray,
      } as never,
    });

    expect(response.categories).toEqual([category]);
  });

  it('maps reservationWaitMenuItemIds from store_settings JSON column', () => {
    const response = toStoreSettingsResponse({
      storeId: 'store_1',
      settings: {
        store_photos: ['https://example.com/store.jpg'],
        reservation_wait_menu_item_ids: ['latte', 'banana-bread'],
      } as never,
    });

    expect(response.reservationWaitMenuItemIds).toEqual(['latte', 'banana-bread']);
    expect(response.basicInfo.storePhotos).toEqual(['https://example.com/store.jpg']);
  });

  it('maps break_times to every weekday and public_holiday_hours', () => {
    const response = toStoreSettingsResponse({
      storeId: 'store_1',
      hours: {
        break_times: { 월: { start: '15:00', end: '17:00' } },
        public_holiday_hours: {
          isOperating: true,
          openTime: '10:00',
          closeTime: '18:00',
        },
      } as never,
    });

    expect(response.operationSettings?.breakTimes).toEqual({
      월: { start: '15:00', end: '17:00' },
      화: null,
      수: null,
      목: null,
      금: null,
      토: null,
      일: null,
    });
    expect(response.operationSettings?.publicHoliday).toEqual({
      isOperating: true,
      openTime: '10:00',
      closeTime: '18:00',
    });
  });

  it('returns null publicHoliday and empty breaks when columns are unset', () => {
    const response = toStoreSettingsResponse({
      storeId: 'store_1',
      hours: { break_times: null, public_holiday_hours: null } as never,
    });

    expect(response.operationSettings?.publicHoliday).toBeNull();
    expect(Object.values(response.operationSettings?.breakTimes ?? {})).toEqual(
      [null, null, null, null, null, null, null],
    );
  });
});
