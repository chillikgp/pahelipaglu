/**
 * Tests for grapheme utilities.
 */

import { describe, it, expect } from 'vitest';
import {
    normalizeNFC,
    toGraphemes,
    graphemeLength,
    graphemeAt,
    codepointCount,
    isMultiCodepoint,
    encodeGrapheme,
    encodeAnswer,
    compareGraphemes,
    findCommonGraphemes,
    cleanAnswerText,
} from '../utils/grapheme.js';

describe('normalizeNFC', () => {
    it('should normalize text to NFC form', () => {
        // Pre-composed vs decomposed
        const decomposed = 'café'; // e + combining accent
        const composed = 'café'; // pre-composed é

        expect(normalizeNFC(decomposed)).toBe(normalizeNFC(composed));
    });

    it('should handle Hindi text', () => {
        const hindi = 'नमस्ते';
        expect(normalizeNFC(hindi)).toBe('नमस्ते');
    });
});

describe('toGraphemes', () => {
    it('should segment English text into graphemes', () => {
        const result = toGraphemes('hello', 'en-US');
        expect(result).toEqual(['h', 'e', 'l', 'l', 'o']);
    });

    it('should segment Hindi text into graphemes correctly', () => {
        // "नमस्ते" (namaste) should be segmented into grapheme clusters
        const result = toGraphemes('नमस्ते', 'hi-IN');
        // Each Hindi grapheme cluster is kept together
        expect(result.length).toBeGreaterThan(0);
        expect(result.join('')).toBe('नमस्ते');
    });

    it('should handle Hindi conjuncts as single graphemes', () => {
        // "क्र" is a conjunct (ka + virama + ra) - should be one grapheme
        const result = toGraphemes('क्र', 'hi-IN');
        expect(result.length).toBe(1);
        expect(result[0]).toBe('क्र');
    });

    it('should handle Hindi matras correctly', () => {
        // "की" (kii) - consonant + vowel sign
        const result = toGraphemes('की', 'hi-IN');
        expect(result.length).toBe(1);
    });

    it('should handle nukta characters', () => {
        // "ड़" (dda with nukta) - base + nukta
        const result = toGraphemes('ड़', 'hi-IN');
        expect(result.length).toBe(1);
    });

    it('should segment "वड़ा" correctly', () => {
        // This is the example from the spec: "वड़ा" → ["व", "ड़ा"]
        const result = toGraphemes('वड़ा', 'hi-IN');
        // "व" is one grapheme, "ड़ा" (dda + nukta + aa matra) is another
        expect(result.length).toBe(2);
        expect(result[0]).toBe('व');
    });
});

describe('graphemeLength', () => {
    it('should count graphemes correctly for ASCII', () => {
        expect(graphemeLength('hello', 'en-US')).toBe(5);
    });

    it('should count graphemes correctly for Hindi', () => {
        // "वड़ा" has 2 grapheme clusters
        expect(graphemeLength('वड़ा', 'hi-IN')).toBe(2);
    });

    it('should count emoji as single graphemes', () => {
        // Family emoji (multiple codepoints)
        expect(graphemeLength('👨‍👩‍👧', 'en-US')).toBe(1);
    });
});

describe('graphemeAt', () => {
    it('should get grapheme at index', () => {
        expect(graphemeAt('hello', 0, 'en-US')).toBe('h');
        expect(graphemeAt('hello', 4, 'en-US')).toBe('o');
    });

    it('should return undefined for out of bounds', () => {
        expect(graphemeAt('hello', 10, 'en-US')).toBeUndefined();
    });
});

describe('codepointCount', () => {
    it('should count single codepoint correctly', () => {
        expect(codepointCount('a')).toBe(1);
        expect(codepointCount('क')).toBe(1);
    });

    it('should count multiple codepoints in grapheme', () => {
        // "क्र" has 3 codepoints: क + ् + र
        expect(codepointCount('क्र')).toBe(3);
    });
});

describe('isMultiCodepoint', () => {
    it('should return false for single codepoint', () => {
        expect(isMultiCodepoint('a')).toBe(false);
        expect(isMultiCodepoint('क')).toBe(false);
    });

    it('should return true for multi-codepoint graphemes', () => {
        expect(isMultiCodepoint('क्र')).toBe(true);
        expect(isMultiCodepoint('ड़')).toBe(true);
    });
});

describe('encodeGrapheme', () => {
    it('should not wrap single codepoint graphemes', () => {
        expect(encodeGrapheme('a')).toBe('a');
        expect(encodeGrapheme('व')).toBe('व');
    });

    it('should wrap multi-codepoint graphemes in braces', () => {
        expect(encodeGrapheme('क्र')).toBe('{क्र}');
        expect(encodeGrapheme('ड़ा')).toBe('{ड़ा}');
    });
});

describe('encodeAnswer', () => {
    it('should encode simple ASCII', () => {
        expect(encodeAnswer('hello', 'en-US')).toBe('hello');
    });

    it('should encode Hindi with multi-codepoint graphemes', () => {
        // "वड़ा" → "व{ड़ा}" (first grapheme is single codepoint, second is multi)
        const encoded = encodeAnswer('वड़ा', 'hi-IN');
        expect(encoded).toContain('{');
        expect(encoded).toContain('}');
    });
});

describe('compareGraphemes', () => {
    it('should compare identical graphemes as equal', () => {
        expect(compareGraphemes('a', 'a')).toBe(true);
        expect(compareGraphemes('क', 'क')).toBe(true);
    });

    it('should compare different graphemes as not equal', () => {
        expect(compareGraphemes('a', 'b')).toBe(false);
        expect(compareGraphemes('क', 'ख')).toBe(false);
    });

    it('should normalize before comparing', () => {
        // Same character, different normalization forms
        const nfc = 'é';
        const nfd = 'é';
        // After normalization they should match
        expect(compareGraphemes(normalizeNFC(nfc), normalizeNFC(nfd))).toBe(true);
    });
});

describe('findCommonGraphemes', () => {
    it('should find common graphemes between arrays', () => {
        const a = ['h', 'e', 'l', 'l', 'o'];
        const b = ['w', 'o', 'r', 'l', 'd'];

        const common = findCommonGraphemes(a, b);

        // 'l' appears at indices (2, 3) in 'a' and (3) in 'b'
        // 'o' appears at index 4 in 'a' and index 1 in 'b'
        expect(common.length).toBeGreaterThan(0);

        // Verify 'o' is found
        const oMatches = common.filter(([ai, bi]) => a[ai] === 'o' && b[bi] === 'o');
        expect(oMatches.length).toBe(1);
    });

    it('should return empty array for no common graphemes', () => {
        const a = ['a', 'b', 'c'];
        const b = ['x', 'y', 'z'];

        expect(findCommonGraphemes(a, b)).toEqual([]);
    });
});

describe('cleanAnswerText', () => {
    it('should remove spaces', () => {
        expect(cleanAnswerText('hello world')).toBe('helloworld');
    });

    it('should remove punctuation', () => {
        expect(cleanAnswerText('hello!')).toBe('hello');
        expect(cleanAnswerText("it's")).toBe('its');
    });

    it('should normalize text', () => {
        const result = cleanAnswerText('café');
        expect(result).toBe(normalizeNFC('café'));
    });
});
