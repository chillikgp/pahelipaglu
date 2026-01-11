/**
 * Seeded random number generator for deterministic crossword placement.
 * Uses the seedrandom library for reproducible randomness.
 */

import seedrandom from 'seedrandom';

export class SeededRandom {
    private rng: seedrandom.PRNG;

    constructor(seed?: number | string) {
        this.rng = seedrandom(seed?.toString() ?? Date.now().toString());
    }

    /**
     * Get a random number between 0 (inclusive) and 1 (exclusive).
     */
    next(): number {
        return this.rng();
    }

    /**
     * Get a random integer between min (inclusive) and max (exclusive).
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }

    /**
     * Shuffle an array in place using Fisher-Yates algorithm.
     */
    shuffle<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i + 1);
            const temp = result[i];
            const swapVal = result[j];
            if (temp !== undefined && swapVal !== undefined) {
                result[i] = swapVal;
                result[j] = temp;
            }
        }
        return result;
    }

    /**
     * Pick a random element from an array.
     */
    pick<T>(array: T[]): T | undefined {
        if (array.length === 0) return undefined;
        return array[this.nextInt(0, array.length)];
    }
}
