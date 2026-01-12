import type { Piece } from '../utils/polyomino-generator';

interface PolyominoPreviewProps {
    pieces: Piece[];
}

// Generate distinct colors for pieces
const PIECE_COLORS = [
    '#4ecdc4', '#ff6b6b', '#95e1d3', '#f38181',
    '#aa96da', '#fcbad3', '#a8d8ea', '#ffd3b6',
    '#dcedc1', '#a8e6cf', '#ffaaa5', '#ffc3a0',
    '#d4a5a5', '#9ed2c6', '#ffb347', '#b5ead7',
];

export function PolyominoPreview({ pieces }: PolyominoPreviewProps) {
    const singleCellCount = pieces.filter(p => p.cells.length === 1).length;

    return (
        <div className="polyomino-preview">
            <div className="polyomino-stats">
                <span>Pieces: {pieces.length}</span>
                <span className={singleCellCount > 2 ? 'warning' : ''}>
                    Single-cell: {singleCellCount}
                    {singleCellCount > 2 ? ' ⚠️' : ''}
                </span>
            </div>
            <div className="polyomino-pieces-grid">
                {pieces.map((piece, index) => (
                    <PieceMiniGrid
                        key={piece.id}
                        piece={piece}
                        color={PIECE_COLORS[index % PIECE_COLORS.length] ?? '#4ecdc4'}
                        isSingleton={piece.cells.length === 1}
                    />
                ))}
            </div>
        </div>
    );
}

interface PieceMiniGridProps {
    piece: Piece;
    color: string;
    isSingleton: boolean;
}

function PieceMiniGrid({ piece, color, isSingleton }: PieceMiniGridProps) {
    // Calculate bounding box
    const minX = Math.min(...piece.cells.map(c => c.relX));
    const maxX = Math.max(...piece.cells.map(c => c.relX));
    const minY = Math.min(...piece.cells.map(c => c.relY));
    const maxY = Math.max(...piece.cells.map(c => c.relY));

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    // Create cell lookup
    const cellLookup = new Map<string, typeof piece.cells[0]>();
    for (const cell of piece.cells) {
        cellLookup.set(`${cell.relX - minX},${cell.relY - minY}`, cell);
    }

    return (
        <div className={`piece-mini-container ${isSingleton ? 'singleton-warning' : ''}`}>
            <div className="piece-id">
                {piece.id}
                {isSingleton && ' ⚠️'}
            </div>
            <div
                className="piece-mini-grid"
                style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${width}, 28px)`,
                    gap: '2px',
                }}
            >
                {Array.from({ length: height }).map((_, y) =>
                    Array.from({ length: width }).map((_, x) => {
                        const cell = cellLookup.get(`${x},${y}`);
                        return (
                            <div
                                key={`${x},${y}`}
                                className={`piece-cell ${cell ? 'filled' : 'empty'}`}
                                style={{
                                    backgroundColor: cell ? color : 'transparent',
                                    border: cell ? '1px solid rgba(0,0,0,0.2)' : 'none',
                                }}
                            >
                                {cell?.letter || ''}
                            </div>
                        );
                    })
                )}
            </div>
            <div className="piece-coords">
                ({piece.correctX}, {piece.correctY})
            </div>
        </div>
    );
}
