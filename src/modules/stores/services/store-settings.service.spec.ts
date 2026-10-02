import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StoreOperationSettingsDto } from '../dto/store-settings.dto';
import { StoreSettingsService } from './store-settings.service';

describe('StoreSettingsService.upsertOperatingHours (break/public holiday)', () => {
  const makeService = () => new StoreSettingsService({} as never, {} as never);

  const run = async (
    operation: StoreOperationSettingsDto,
    existing: Record<string, unknown> | null = null,
  ) => {
    const upsert = jest.fn();
    const tx = {
      store_operating_hours: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert,
      },
    };

    await (
      makeService() as unknown as {
        upsertOperatingHours: (
          tx: unknown,
          storeId: string,
          operation: StoreOperationSettingsDto,
        ) => Promise<void>;
      }
    ).upsertOperatingHours(tx, 'store-1', operation);

    const [args] = upsert.mock.calls[0] as [
      { update: Record<string, unknown> },
    ];
    return args.update;
  };

  it('stores only days with a valid break and drops null days', async () => {
    const data = await run({
      breakTimes: { 월: { start: '15:00', end: '17:00' }, 화: null },
    });

    expect(data.break_times).toEqual({ 월: { start: '15:00', end: '17:00' } });
  });

  it('clears break_times when no day has a break', async () => {
    const data = await run({
      breakTimes: { 월: null },
    });

    expect(data.break_times).toBe(Prisma.DbNull);
  });

  it('keeps the existing break_times when the field is omitted', async () => {
    const existing = { break_times: { 수: { start: '14:00', end: '15:00' } } };
    const data = await run({}, existing);

    expect(data.break_times).toEqual(existing.break_times);
  });

  it('rejects a break whose end is not after its start', async () => {
    await expect(
      run({
        breakTimes: { 목: { start: '17:00', end: '15:00' } },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores public holiday hours and closure', async () => {
    const open = await run({
      publicHoliday: {
        isOperating: true,
        openTime: '10:00',
        closeTime: '18:00',
      },
    });
    const closed = await run({
      publicHoliday: { isOperating: false },
    });

    expect(open.public_holiday_hours).toEqual({
      isOperating: true,
      openTime: '10:00',
      closeTime: '18:00',
    });
    expect(closed.public_holiday_hours).toEqual({
      isOperating: false,
      openTime: null,
      closeTime: null,
    });
  });

  it('rejects public holiday close time before open time', async () => {
    await expect(
      run({
        publicHoliday: {
          isOperating: true,
          openTime: '18:00',
          closeTime: '10:00',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
