export function formatCurrency(
    amount: number | null | undefined,
    currency: string = 'USD',
    locale: string = 'en-US'
): string {
  if (amount === null || amount === undefined) {
    return 'N/A'; // Or return $0.00 or an empty string based on preference
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0, // Adjust if cents are important
    maximumFractionDigits: 0,
  }).format(amount);
}