import { resolveOwnerPhone } from './resolve-owner-phone.util';

describe('resolveOwnerPhone', () => {
  it('uses notification_phone when it is a valid number', () => {
    expect(resolveOwnerPhone('01011112222', '01099998888')).toBe('01011112222');
  });

  it('falls back to phone_number when notification_phone is an empty string', () => {
    // 프로덕션 버그 재현: '' ?? x → '' 였던 케이스
    expect(resolveOwnerPhone('', '01099998888')).toBe('01099998888');
  });

  it('falls back to phone_number when notification_phone is whitespace only', () => {
    expect(resolveOwnerPhone('   ', '01099998888')).toBe('01099998888');
  });

  it('falls back to phone_number when notification_phone is null', () => {
    expect(resolveOwnerPhone(null, '01099998888')).toBe('01099998888');
  });

  it('falls back to phone_number when notification_phone is undefined', () => {
    expect(resolveOwnerPhone(undefined, '01099998888')).toBe('01099998888');
  });

  it('trims surrounding whitespace from the chosen candidate', () => {
    expect(resolveOwnerPhone('  01011112222  ', '01099998888')).toBe(
      '01011112222',
    );
    expect(resolveOwnerPhone('', '  01099998888 ')).toBe('01099998888');
  });

  it('returns an empty string when both candidates are empty/blank/nullish', () => {
    expect(resolveOwnerPhone('', '')).toBe('');
    expect(resolveOwnerPhone('  ', null)).toBe('');
    expect(resolveOwnerPhone(null, undefined)).toBe('');
    expect(resolveOwnerPhone(undefined, '   ')).toBe('');
  });
});
