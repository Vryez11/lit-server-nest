/** 고객명 마스킹: 홍길동→홍*동, 김철→김*, A→A, Alexander→A*******r */
export const maskCustomerName = (name: string): string => {
  const t = String(name ?? '').trim();
  if (t.length <= 1) return t;
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}${'*'.repeat(t.length - 2)}${t[t.length - 1]}`;
};
