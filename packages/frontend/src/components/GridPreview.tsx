import { useMemo } from 'react';
import type { GenerateResponse } from '../types/api';

interface GridPreviewProps {
    response: GenerateResponse;
}

export function GridPreview({ response }: GridPreviewProps) {
    const { puzzle, metadata } = response;

    if (!puzzle) {
        return null;
    }

    // Build a map of starting positions to word numbers
    const wordNumbers = useMemo(() => {
        const map = new Map<string, number>();
        const placedWords = puzzle.placements
            .filter((p) => p.placed)
            .sort((a, b) => {
                // Sort by position: top-to-bottom, left-to-right
                if (a.startY !== b.startY) return a.startY - b.startY;
                return a.startX - b.startX;
            });

        placedWords.forEach((placement, index) => {
            const key = `${placement.startX},${placement.startY}`;
            if (!map.has(key)) {
                map.set(key, index + 1);
            }
        });

        return map;
    }, [puzzle.placements]);

    const gridStyle = {
        gridTemplateColumns: `repeat(${puzzle.gridWidth}, 32px)`,
    };

    return (
        <div className="card">
            <h2 className="card-title">Puzzle Preview</h2>

            {metadata && (
                <div className="stats">
                    <div className="stat">
                        <div className="stat-value">{metadata.requestedWords ?? '-'}</div>
                        <div className="stat-label">Generated</div>
                    </div>
                    <div className="stat">
                        <div className="stat-value">{metadata.filteredWords ?? '-'}</div>
                        <div className="stat-label">Filtered</div>
                    </div>
                    <div className="stat">
                        <div className="stat-value">{metadata.placedWords}</div>
                        <div className="stat-label">Placed</div>
                    </div>
                    <div className="stat">
                        <div className="stat-value">{metadata.language}</div>
                        <div className="stat-label">Language</div>
                    </div>
                </div>
            )}

            <div className="grid-container">
                <div className="crossword-grid" style={gridStyle}>
                    {puzzle.grid.map((row, y) =>
                        row.map((cell, x) => {
                            const key = `${x},${y}`;
                            const wordNumber = wordNumbers.get(key);
                            // Cell is an object with { grapheme?, wordIds[] }
                            const grapheme = cell?.grapheme;
                            const isFilled = !!grapheme;

                            return (
                                <div
                                    key={key}
                                    className={`grid-cell ${isFilled ? 'filled' : 'empty'}`}
                                >
                                    {wordNumber && <span className="cell-number">{wordNumber}</span>}
                                    {grapheme || ''}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="word-list">
                <h3 className="word-list-title">Word List</h3>

                <div className="word-list-section">
                    <div className="word-list-section-title">Across</div>
                    {puzzle.placements
                        .filter((p) => p.placed && p.direction === 'ACROSS')
                        .map((placement, index) => {
                            const posKey = `${placement.startX},${placement.startY}`;
                            const number = wordNumbers.get(posKey) ?? index + 1;

                            return (
                                <div key={placement.wordId} className="word-item">
                                    <span className="word-number">{number}</span>
                                    <div className="word-content">
                                        <div className="word-answer">{placement.clueItem.answerText}</div>
                                        <div className="word-clue">{placement.clueItem.clueText}</div>
                                    </div>
                                    <span className="word-direction">→</span>
                                </div>
                            );
                        })}
                </div>

                <div className="word-list-section">
                    <div className="word-list-section-title">Down</div>
                    {puzzle.placements
                        .filter((p) => p.placed && p.direction === 'DOWN')
                        .map((placement, index) => {
                            const posKey = `${placement.startX},${placement.startY}`;
                            const number = wordNumbers.get(posKey) ?? index + 1;

                            return (
                                <div key={placement.wordId} className="word-item">
                                    <span className="word-number">{number}</span>
                                    <div className="word-content">
                                        <div className="word-answer">{placement.clueItem.answerText}</div>
                                        <div className="word-clue">{placement.clueItem.clueText}</div>
                                    </div>
                                    <span className="word-direction">↓</span>
                                </div>
                            );
                        })}
                </div>

                {puzzle.unplacedWords.length > 0 && (
                    <div className="word-list-section">
                        <div className="word-list-section-title">Unplaced Words</div>
                        {puzzle.unplacedWords.map((word, index) => (
                            <div key={index} className="word-item" style={{ opacity: 0.6 }}>
                                <span className="word-number">—</span>
                                <div className="word-content">
                                    <div className="word-answer">{word.answerText}</div>
                                    <div className="word-clue">{word.clueText}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
