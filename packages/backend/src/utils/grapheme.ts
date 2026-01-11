/**
 * Grapheme-safe string utilities using Intl.Segmenter.
 * These utilities ensure proper handling of complex scripts like Hindi.
 */

import type { GraphemeToken } from '../types/models.js';

/**
 * Normalize a string to NFC (Canonical Decomposition followed by Canonical Composition).
 * This ensures consistent representation of Unicode characters.
 * 
 * @param text - Input text to normalize
 * @returns NFC-normalized text
 */
export function normalizeNFC(text: string): string {
    return text.normalize('NFC');
}

/**
 * Segment a string into an array of grapheme clusters using Intl.Segmenter.
 * This correctly handles complex scripts where one visual character may consist
 * of multiple Unicode code points.
 * 
 * @param text - Input text to segment
 * @param locale - BCP-47 locale code for proper segmentation rules
 * @returns Array of grapheme tokens
 * 
 * @example
 * toGraphemes("नमस्ते", "hi-IN") // Returns individual Hindi grapheme clusters
 * toGraphemes("café", "en-US")   // Returns ["c", "a", "f", "é"]
 */
export function toGraphemes(text: string, locale: string): GraphemeToken[] {
    const normalized = normalizeNFC(text);
    const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    const segments = segmenter.segment(normalized);

    const graphemes: GraphemeToken[] = [];
    for (const segment of segments) {
        graphemes.push(segment.segment);
    }

    return graphemes;
}

/**
 * Count the number of grapheme clusters in a string.
 * Unlike string.length, this correctly counts visual characters.
 * 
 * @param text - Input text
 * @param locale - BCP-47 locale code
 * @returns Number of grapheme clusters
 */
export function graphemeLength(text: string, locale: string): number {
    return toGraphemes(text, locale).length;
}

/**
 * Get a grapheme at a specific index.
 * Unlike string[i], this correctly handles multi-codepoint characters.
 * 
 * @param text - Input text
 * @param index - Grapheme index (0-based)
 * @param locale - BCP-47 locale code
 * @returns The grapheme at the index, or undefined if out of bounds
 */
export function graphemeAt(text: string, index: number, locale: string): GraphemeToken | undefined {
    const graphemes = toGraphemes(text, locale);
    return graphemes[index];
}

/**
 * Count the number of Unicode code points in a grapheme.
 * 
 * @param grapheme - Single grapheme token
 * @returns Number of code points
 */
export function codepointCount(grapheme: GraphemeToken): number {
    // Use spread operator to correctly count code points (not UTF-16 code units)
    return [...grapheme].length;
}

/**
 * Check if a grapheme consists of multiple code points.
 * Multi-codepoint graphemes need special handling in crossword encoding.
 * 
 * @param grapheme - Single grapheme token
 * @returns true if the grapheme has more than one code point
 */
export function isMultiCodepoint(grapheme: GraphemeToken): boolean {
    return codepointCount(grapheme) > 1;
}

/**
 * Encode a grapheme for crossword editor compatibility.
 * Multi-codepoint graphemes are wrapped in curly braces {}.
 * 
 * @param grapheme - Single grapheme token
 * @returns Encoded grapheme string
 * 
 * @example
 * encodeGrapheme("a")   // Returns "a"
 * encodeGrapheme("ड़ा") // Returns "{ड़ा}" (multi-codepoint)
 */
export function encodeGrapheme(grapheme: GraphemeToken): string {
    if (isMultiCodepoint(grapheme)) {
        return `{${grapheme}}`;
    }
    return grapheme;
}

/**
 * Encode an entire answer string with proper grapheme encoding.
 * Each grapheme is checked, and multi-codepoint graphemes are wrapped in {}.
 * 
 * @param text - Answer text
 * @param locale - BCP-47 locale code
 * @returns Encoded answer string for crossword editor
 * 
 * @example
 * encodeAnswer("वड़ा", "hi-IN") // Returns "व{ड़ा}" if ड़ा is multi-codepoint
 */
export function encodeAnswer(text: string, locale: string): string {
    const graphemes = toGraphemes(text, locale);
    return graphemes.map(encodeGrapheme).join('');
}

/**
 * Compare two graphemes for equality.
 * Both graphemes are normalized to NFC before comparison.
 * 
 * @param a - First grapheme
 * @param b - Second grapheme
 * @returns true if graphemes are equal after normalization
 */
export function compareGraphemes(a: GraphemeToken, b: GraphemeToken): boolean {
    return normalizeNFC(a) === normalizeNFC(b);
}

/**
 * Find common graphemes between two grapheme arrays.
 * Returns indices of matching graphemes in both arrays.
 * 
 * @param graphemesA - First array of graphemes
 * @param graphemesB - Second array of graphemes
 * @returns Array of [indexA, indexB] pairs where graphemes match
 */
export function findCommonGraphemes(
    graphemesA: GraphemeToken[],
    graphemesB: GraphemeToken[]
): [number, number][] {
    const commonPairs: [number, number][] = [];

    for (let i = 0; i < graphemesA.length; i++) {
        const graphemeA = graphemesA[i];
        if (graphemeA === undefined) continue;

        for (let j = 0; j < graphemesB.length; j++) {
            const graphemeB = graphemesB[j];
            if (graphemeB === undefined) continue;

            if (compareGraphemes(graphemeA, graphemeB)) {
                commonPairs.push([i, j]);
            }
        }
    }

    return commonPairs;
}

/**
 * Remove spaces and normalize text for crossword answer processing.
 * Also removes common punctuation.
 * 
 * @param text - Input text
 * @returns Cleaned text
 */
export function cleanAnswerText(text: string): string {
    // Remove spaces, punctuation, and normalize
    const cleaned = text
        .replace(/[\s\u200B-\u200D\uFEFF]/g, '') // Remove spaces and zero-width chars
        .replace(/[.,!?;:'"()\[\]{}\-–—]/g, '')   // Remove common punctuation
        .trim();

    return normalizeNFC(cleaned);
}
