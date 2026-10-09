const ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export function sizeSortKey(size: string): number {
  const i = ORDER.indexOf(size);
  if (i >= 0) return i;
  if (/^\d+$/.test(size)) return 100 + Number(size);
  return 1000;
}
