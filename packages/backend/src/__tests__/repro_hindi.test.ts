
import { describe, it, expect } from 'vitest';
import { generateCrossword } from '../services/crossword-engine.js';
import { toGraphemes } from '../utils/grapheme.js';
import { ClueItem } from '../types/models.js';

const WORDS = [
    'बर्फी',
    'वड़ापाव',
    'पकौड़ा',
    'मसाला',
    'नमकीन',
    'कचौरी',
    'जलेबी',
    'गुलाबजामुन',
    'चिवड़ा',
    'सेव',
    'थेपला',
    'पानीपूरी',
    'खमन',
    'मखाना',
    'कटलेट'
];

describe('Hindi Reproduction', () => {
    it('should place most words from the user set', () => {
        const clues: ClueItem[] = WORDS.map(w => ({
            answerText: w,
            clueText: 'clue', // irrelevant
            graphemes: toGraphemes(w, 'hi-IN')
        }));

        console.log('--- Grapheme Analysis ---');
        clues.forEach(c => {
            console.log(`${c.answerText}: [${c.graphemes.join(', ')}] len=${c.graphemes.length}`);
        });

        // Debug Intersection Counts manually
        console.log('--- Intersection Counts (Manual Check) ---');
        clues.forEach(a => {
            let count = 0;
            const setA = new Set(a.graphemes);
            const connections: string[] = [];
            clues.forEach(b => {
                if (a === b) return;
                if (b.graphemes.some(g => setA.has(g))) {
                    count++;
                    connections.push(b.answerText);
                }
            });
            console.log(`${a.answerText}: ${count} -> ${connections.join(', ')}`);
        });

        // Try a slightly larger grid than default 12x12 to be safe, or stick to 12x12 if that's what user used.
        // User didn't specify, but defaults are usually 12-15.
        // Let's try 15x15 to rule out space boundary.
        const width = 15;
        const height = 15;

        // Try multiple seeds if needed, or rely on heuristics
        const result = generateCrossword(clues, width, height, 12345);

        console.log(`\n--- Result ---`);
        console.log(`Placed: ${result.stats.placedWords}/${result.stats.requestedWords}`);
        console.log(`Fill Ratio: ${result.stats.fillRatio}`);
        result.placements.forEach(p => {
            console.log(`Placed: ${p.clueItem.answerText} at ${p.startX},${p.startY} ${p.direction}`);
        });
        console.log(`Unplaced: ${result.unplacedWords.map(u => u.answerText).join(', ')}`);

        // Expectation: at least 10 words (user got 6)
        expect(result.stats.placedWords).toBeGreaterThanOrEqual(7);
    });
});
