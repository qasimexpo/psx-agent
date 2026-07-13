export const TOP_PICK_SECTOR_ALL = "All";

export const TOP_PICK_SECTOR_OPTIONS = [
  { value: "All", label: "All Sectors" },
  { value: "Banking (Islamic)", label: "Banking (Islamic)" },
  { value: "Cement", label: "Cement" },
  { value: "Energy (E&P)", label: "Energy (E&P)" },
  { value: "Power Generation", label: "Power Generation" },
  { value: "Technology", label: "Technology" },
  { value: "Fertilizer", label: "Fertilizer" },
  { value: "Pharmaceuticals", label: "Pharmaceuticals" },
  { value: "Automobile", label: "Automobile" },
  { value: "Textile", label: "Textile" },
  { value: "Food & Personal Care", label: "Food & Personal Care" },
] as const;

export type TopPickSector = (typeof TOP_PICK_SECTOR_OPTIONS)[number]["value"];

export function getSectorLabel(sector: TopPickSector): string {
  const match = TOP_PICK_SECTOR_OPTIONS.find((option) => option.value === sector);
  return match?.label ?? sector;
}
