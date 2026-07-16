/**
 * 점주 알림톡 수신 번호 결정.
 *
 * notification_phone(알림수신번호)을 우선 사용하고, 비어 있으면
 * phone_number(대표자 휴대폰)로 폴백한다. 빈 문자열 `''`·공백만 `'  '`·null·
 * undefined를 모두 "비어 있음"으로 취급한다.
 *
 * `store.notification_phone ?? store.phone_number` 패턴은 `'' ?? x`가 `''`를
 * 반환해 폴백이 무력화되는 버그가 있었다(설정 저장 시 빈 칸이 `''`로 저장됨).
 * 이 헬퍼는 trim 후 비면 다음 후보로 넘어가 그 버그를 막는다.
 *
 * @returns 유효한 후보가 없으면 빈 문자열 `''`.
 */
export const resolveOwnerPhone = (
  notificationPhone: string | null | undefined,
  phoneNumber: string | null | undefined,
): string => {
  const primary = (notificationPhone ?? '').trim();
  if (primary) {
    return primary;
  }
  return (phoneNumber ?? '').trim();
};
