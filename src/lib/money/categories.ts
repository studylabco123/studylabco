/** Expense categories (spec 2.10). The value is stored; the label is shown. */
export const EXPENSE_CATEGORIES = [
  { value: "room_hire", label: "Room or venue hire" },
  { value: "insurance", label: "Insurance" },
  { value: "dbs", label: "DBS" },
  { value: "website_domain", label: "Website and domain" },
  { value: "books_resources", label: "Books and resources" },
  { value: "ico_fee", label: "ICO fee" },
  { value: "stationery", label: "Stationery" },
  { value: "phone_internet", label: "Phone and internet" },
  { value: "virtual_office", label: "Virtual office" },
  { value: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const isExpenseCategory = (v: unknown): v is ExpenseCategory => EXPENSE_CATEGORIES.some((c) => c.value === v);

export function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
