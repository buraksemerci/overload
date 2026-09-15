/**
 * Vitest kurulumu.
 *
 * `@testing-library/jest-dom` paket bağımlılıklarında vardı ama hiçbir yere
 * bağlanmamıştı: `toHaveAttribute` gibi eşleştiriciler "Invalid Chai
 * property" hatası veriyordu. Bileşen testleri için gereken tek şey bu içe
 * aktarma.
 */

import "@testing-library/jest-dom/vitest";
