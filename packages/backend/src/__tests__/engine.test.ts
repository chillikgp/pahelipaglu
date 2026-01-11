/**
 * Tests for crossword placement engine.
 */

import { describe, it, expect } from 'vitest';
import { CrosswordEngine, generateCrossword } from '../services/crossword-engine.js';
import type { ClueItem } from '../types/models.js';

const createClue = (answer: string, clue: string, locale = 'en-US'): ClueItem => {
    // Simple grapheme segmentation for testing
    const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    const graphemes = [...segmenter.segment(answer)].map((s) => s.segment);

    return {
        graphemes,
        answerText: answer,
        clueText: clue,
    };
};

describe('CrosswordEngine', () => {
    it('should place first word at center horizontally', () => {
        const engine = new CrosswordEngine({ width: 15, height: 15, seed: 42 });

        const clues: ClueItem[] = [
            createClue('HELLO', 'A greeting'),
        ];

        const puzzle = engine.generatePuzzle(clues);

        expect(puzzle.placements.length).toBe(1);
        expect(puzzle.placements[0]?.placed).toBe(true);
        expect(puzzle.placements[0]?.direction).toBe('ACROSS');
        expect(puzzle.placements[0]?.startY).toBe(7); // Center row
    });

    it('should place second word perpendicular to first', () => {
        const engine = new CrosswordEngine({ width: 15, height: 15, seed: 42 });

        const clues: ClueItem[] = [
            createClue('HELLO', 'A greeting'),
            createClue('HELP', 'Assistance'),
        ];

        const puzzle = engine.generatePuzzle(clues);

        // Both words share 'H', 'E', 'L'
        const placed = puzzle.placements.filter((p) => p.placed);
        expect(placed.length).toBe(2);

        // Should have one ACROSS and one DOWN
        const directions = placed.map((p) => p.direction);
        expect(directions).toContain('ACROSS');
        expect(directions).toContain('DOWN');
    });

    it('should not place words that cannot intersect', () => {
        const engine = new CrosswordEngine({ width: 15, height: 15, seed: 42 });

        const clues: ClueItem[] = [
            createClue('HELLO', 'A greeting'),
            createClue('XYZ', 'No common letters'),
        ];

        const puzzle = engine.generatePuzzle(clues);

        expect(puzzle.placements.filter((p) => p.placed).length).toBe(1);
        expect(puzzle.unplacedWords.length).toBe(1);
        expect(puzzle.unplacedWords[0]?.answerText).toBe('XYZ');
    });

    it('should produce deterministic results with same seed', () => {
        const clues: ClueItem[] = [
            createClue('CROSSWORD', 'This puzzle type'),
            createClue('COMPUTER', 'Electronic device'),
            createClue('WORD', 'Unit of text'),
        ];

        const puzzle1 = generateCrossword(clues, 20, 20, 12345);
        const puzzle2 = generateCrossword(clues, 20, 20, 12345);

        expect(puzzle1.placements.length).toBe(puzzle2.placements.length);

        for (let i = 0; i < puzzle1.placements.length; i++) {
            expect(puzzle1.placements[i]?.startX).toBe(puzzle2.placements[i]?.startX);
            expect(puzzle1.placements[i]?.startY).toBe(puzzle2.placements[i]?.startY);
            expect(puzzle1.placements[i]?.direction).toBe(puzzle2.placements[i]?.direction);
        }
    });

    it('should sort words by length for better placement', () => {
        const clues: ClueItem[] = [
            createClue('CAT', 'Feline'),
            createClue('ELEPHANT', 'Large mammal'),
            createClue('DOG', 'Canine'),
        ];

        const puzzle = generateCrossword(clues, 20, 20, 42);

        // The longest word (ELEPHANT) should typically be placed first
        // and thus have wordId 1
        const elephantPlacement = puzzle.placements.find(
            (p) => p.clueItem.answerText === 'ELEPHANT'
        );
        expect(elephantPlacement?.wordId).toBe(1);
    });

    it('should handle Hindi graphemes correctly', () => {
        const clues: ClueItem[] = [
            createClue('नमस्ते', 'Hindi greeting', 'hi-IN'),
        ];

        const puzzle = generateCrossword(clues, 20, 20, 42);

        expect(puzzle.placements.length).toBe(1);
        expect(puzzle.placements[0]?.placed).toBe(true);
    });

    it('should not exceed grid bounds', () => {
        const clues: ClueItem[] = [
            createClue('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 'Mary Poppins word'),
        ];

        // Grid is too small for this word
        const puzzle = generateCrossword(clues, 10, 10, 42);

        // Word should not be placed
        expect(puzzle.placements.filter((p) => p.placed).length).toBe(0);
        expect(puzzle.unplacedWords.length).toBe(1);
    });

    it('should not create conflicting cell values', () => {
        const clues: ClueItem[] = [
            createClue('HELLO', 'Greeting'),
            createClue('WORLD', 'The earth'),
            createClue('HELP', 'Aid'),
            createClue('WORK', 'Labor'),
        ];

        const puzzle = generateCrossword(clues, 20, 20, 42);

        // Check that no cell has conflicting graphemes
        for (let y = 0; y < puzzle.gridHeight; y++) {
            for (let x = 0; x < puzzle.gridWidth; x++) {
                const cell = puzzle.grid[y]?.[x];
                if (cell?.grapheme && cell.wordIds.length > 1) {
                    // Cell is an intersection, all words should have the same grapheme here
                    for (const wordId of cell.wordIds) {
                        const placement = puzzle.placements.find((p) => p.wordId === wordId);
                        if (placement?.placed) {
                            const { startX, startY, direction, clueItem } = placement;

                            let graphemeIndex: number;
                            if (direction === 'ACROSS') {
                                graphemeIndex = x - startX;
                            } else {
                                graphemeIndex = y - startY;
                            }

                            expect(clueItem.graphemes[graphemeIndex]).toBe(cell.grapheme);
                        }
                    }
                }
            }
        }
    });
});
