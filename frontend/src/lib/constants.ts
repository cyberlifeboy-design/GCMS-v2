/**
 * Cart type color coding per PRD Section 3
 *
 * PRD Color Codes:
 * | Cart Type    | Color  | Hex Code |
 * |--------------|--------|----------|
 * | Cargo        | Red    | #E53935  |
 * | Accessibility| Yellow | #FDD835  |
 * | 6-Seater     | Green  | #43A047  |
 * | 4-Seater     | Blue   | #1E88E5  |
 */

export const carTypeColors: Record<string, string> = {
    'Cargo': 'bg-red-600 text-white',
    'Accessibility': 'bg-yellow-400 text-black',
    '6-Seater': 'bg-green-600 text-white',
    '4-Seater': 'bg-blue-600 text-white',
};

/**
 * Get color classes for a cart type with fallback
 */
export function getCartTypeColor(carType: string): string {
    return carTypeColors[carType] || 'bg-gray-400 text-white';
}