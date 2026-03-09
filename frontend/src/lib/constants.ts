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
 *
 * Additional types in current schema:
 * | Cart Type    | Color  | Reasoning                    |
 * |--------------|--------|------------------------------|
 * | 2-Seater     | Gray   | Standard smaller vehicle     |
 * | Utility      | Orange | Utility/work purpose         |
 * | Ambulance    | Red-700| Emergency vehicle (darker red)|
 */

export const carTypeColors: Record<string, string> = {
    'Cargo': 'bg-red-500 text-white',
    'Accessibility': 'bg-yellow-400 text-black',
    '6-Seater': 'bg-green-500 text-white',
    '4-Seater': 'bg-blue-500 text-white',
    '2-Seater': 'bg-gray-500 text-white',
    'Utility': 'bg-orange-500 text-white',
    'Ambulance': 'bg-red-700 text-white',
};

/**
 * Get color classes for a cart type with fallback
 */
export function getCartTypeColor(carType: string): string {
    return carTypeColors[carType] || 'bg-gray-400 text-white';
}