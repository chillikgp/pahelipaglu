/**
 * Polyomino Generator for Bonza-style puzzle decomposition.
 *
 * Converts a crossword grid into polyomino pieces for gameplay.
 */

// === Types ===

export interface GridCell {
    x: number;
    y: number;
    letter: string;
    blockId: number;
    wordCount: number; // How many words this cell belongs to (intersection = 2+)
}

export interface PieceCell {
    relX: number;
    relY: number;
    letter: string;
    blockId: number;
    node: [number, number, number, number]; // [up, right, down, left] blockIds or -1
}

export interface Piece {
    id: string;
    correctX: number;
    correctY: number;
    cells: PieceCell[];
}

export interface PolyominoPuzzle {
    theme: string;
    gridWidth: number;
    gridHeight: number;
    pieces: Piece[];
}

export interface Placement {
    startX: number;
    startY: number;
    direction: 'ACROSS' | 'DOWN';
    clueItem: {
        graphemes: string[];
        answerText: string;
    };
}

/**
 * Configuration for polyomino generation.
 */
export interface PolyominoConfig {
    minPieceSize: number;
    maxPieceSize: number;
    allowSingleCrossPentomino: boolean;
}

/**
 * Default configuration for polyomino generation.
 */
export const DEFAULT_POLYOMINO_CONFIG: PolyominoConfig = {
    minPieceSize: 2,
    maxPieceSize: 4,
    allowSingleCrossPentomino: false,
};

// === Utility Functions ===

function cellKey(x: number, y: number): string {
    return `${x},${y}`;
}

function parseKey(key: string): [number, number] {
    const parts = key.split(',');
    return [Number(parts[0]) || 0, Number(parts[1]) || 0];
}

// === Main Generator ===

export function generatePolyomino(
    placements: Placement[],
    gridWidth: number,
    gridHeight: number,
    theme: string,
    config: PolyominoConfig = DEFAULT_POLYOMINO_CONFIG
): PolyominoPuzzle {
    // Step 1: Build global cell registry
    const cellMap = new Map<string, GridCell>();
    let blockIdCounter = 0;

    for (const p of placements) {
        const graphemes = p.clueItem.graphemes;
        for (let i = 0; i < graphemes.length; i++) {
            const x: number = p.direction === 'ACROSS' ? p.startX + i : p.startX;
            const y: number = p.direction === 'DOWN' ? p.startY + i : p.startY;
            const key = cellKey(x, y);

            if (cellMap.has(key)) {
                // Intersection: increment word count
                const cell = cellMap.get(key)!;
                cell.wordCount++;
            } else {
                const letter = graphemes[i] ?? '';
                cellMap.set(key, {
                    x,
                    y,
                    letter,
                    blockId: blockIdCounter++,
                    wordCount: 1,
                });
            }
        }
    }

    // Step 2: Build adjacency lookup (for node computation later)
    const getBlockId = (x: number, y: number): number => {
        const cell = cellMap.get(cellKey(x, y));
        return cell ? cell.blockId : -1;
    };

    // Track which cells have been assigned to pieces
    const unassigned = new Set<string>(cellMap.keys());
    const pieces: Piece[] = [];
    let pieceCounter = 0;

    // Step 3: If enabled, find and create the cross pentomino first
    let crossPentominoCreated = false;
    if (config.allowSingleCrossPentomino) {
        const crossResult = findAndCreateCrossPentomino(cellMap, unassigned, getBlockId, pieceCounter);
        if (crossResult) {
            pieces.push(crossResult.piece);
            pieceCounter++;
            crossPentominoCreated = true;
            console.log(`[Polyomino] Created cross pentomino at (${crossResult.piece.correctX}, ${crossResult.piece.correctY})`);
        } else {
            console.log(`[Polyomino] No valid cross pentomino found`);
        }
    }

    // Step 4: Partition remaining cells using greedy BFS
    // Priority: Start from intersection cells first
    const sortedKeys = Array.from(cellMap.keys()).sort((a, b) => {
        const cellA = cellMap.get(a)!;
        const cellB = cellMap.get(b)!;
        // Higher wordCount (intersections) first
        if (cellA.wordCount !== cellB.wordCount) {
            return cellB.wordCount - cellA.wordCount;
        }
        // Then top-to-bottom, left-to-right
        if (cellA.y !== cellB.y) return cellA.y - cellB.y;
        return cellA.x - cellB.x;
    });

    // Determine actual max size for remaining pieces
    const effectiveMaxSize = config.maxPieceSize;

    while (unassigned.size > 0) {
        // Find a seed cell (prioritize intersections)
        let seedKey: string | null = null;
        for (const key of sortedKeys) {
            if (unassigned.has(key)) {
                seedKey = key;
                break;
            }
        }
        if (!seedKey) break;

        // BFS to grow piece
        const pieceCells: GridCell[] = [];
        const queue: string[] = [seedKey];
        unassigned.delete(seedKey);
        pieceCells.push(cellMap.get(seedKey)!);

        while (queue.length > 0 && pieceCells.length < effectiveMaxSize) {
            const currentKey = queue.shift()!;
            const [cx, cy] = parseKey(currentKey);

            // Check 4 neighbors
            const neighbors = [
                [cx, cy - 1], // up
                [cx + 1, cy], // right
                [cx, cy + 1], // down
                [cx - 1, cy], // left
            ];

            for (const neighbor of neighbors) {
                const nx = neighbor[0];
                const ny = neighbor[1];
                if (nx === undefined || ny === undefined) continue;
                const nKey = cellKey(nx, ny);
                if (unassigned.has(nKey) && pieceCells.length < effectiveMaxSize) {
                    unassigned.delete(nKey);
                    const neighborCell = cellMap.get(nKey)!;
                    pieceCells.push(neighborCell);
                    queue.push(nKey);
                }
            }
        }

        // Create piece
        const piece = createPiece(pieceCells, pieceCounter++, getBlockId);
        pieces.push(piece);
    }

    // Step 5: Merge undersized pieces to enforce minPieceSize
    const mergedPieces = mergeUndersizedPieces(pieces, cellMap, getBlockId, config);

    // Step 6: Final validation
    const validationResult = validatePolyominoOutput(mergedPieces, config, crossPentominoCreated);
    if (!validationResult.valid) {
        console.error(`[Polyomino] Validation failed:`, validationResult.errors);
    }

    return {
        theme,
        gridWidth,
        gridHeight,
        pieces: mergedPieces,
    };
}

/**
 * Find and create a cross-shaped pentomino centered on an intersection cell.
 * Returns null if no valid cross can be formed.
 */
function findAndCreateCrossPentomino(
    cellMap: Map<string, GridCell>,
    unassigned: Set<string>,
    getBlockId: (x: number, y: number) => number,
    pieceIndex: number
): { piece: Piece } | null {
    // Find all intersection cells that could be cross centers
    const intersectionCells: GridCell[] = [];
    for (const cell of cellMap.values()) {
        if (cell.wordCount >= 2 && unassigned.has(cellKey(cell.x, cell.y))) {
            intersectionCells.push(cell);
        }
    }

    // Sort by WordCount (prefer higher degree intersections)
    intersectionCells.sort((a, b) => b.wordCount - a.wordCount);

    for (const center of intersectionCells) {
        // Check if all 4 neighbors exist in the grid and are unassigned
        const up = cellMap.get(cellKey(center.x, center.y - 1));
        const right = cellMap.get(cellKey(center.x + 1, center.y));
        const down = cellMap.get(cellKey(center.x, center.y + 1));
        const left = cellMap.get(cellKey(center.x - 1, center.y));

        const upAvail = up && unassigned.has(cellKey(up.x, up.y));
        const rightAvail = right && unassigned.has(cellKey(right.x, right.y));
        const downAvail = down && unassigned.has(cellKey(down.x, down.y));
        const leftAvail = left && unassigned.has(cellKey(left.x, left.y));

        if (upAvail && rightAvail && downAvail && leftAvail && up && right && down && left) {
            // Valid cross found - reserve cells
            const crossCells = [center, up, right, down, left];

            for (const cell of crossCells) {
                unassigned.delete(cellKey(cell.x, cell.y));
            }

            const piece = createPiece(crossCells, pieceIndex, getBlockId);
            return { piece };
        }
    }

    return null;
}

/**
 * Merge undersized pieces to enforce minPieceSize.
 * Uses relaxed constraints to eliminate pieces below minimum.
 */
function mergeUndersizedPieces(
    pieces: Piece[],
    cellMap: Map<string, GridCell>,
    getBlockId: (x: number, y: number) => number,
    config: PolyominoConfig
): Piece[] {
    console.log(`[Polyomino Merge] Starting with ${pieces.length} pieces, minSize=${config.minPieceSize}`);

    // Build a map of blockId -> GridCell for original cell data
    const blockIdToGridCell = new Map<number, GridCell>();
    for (const cell of cellMap.values()) {
        blockIdToGridCell.set(cell.blockId, cell);
    }

    // Work with GridCell arrays instead of Piece objects
    let pieceCellGroups: GridCell[][] = pieces.map(piece =>
        piece.cells.map(c => blockIdToGridCell.get(c.blockId)!).filter(Boolean)
    );

    let mergeCount = 0;
    let pass = 0;
    const maxPasses = 10;

    while (pass < maxPasses) {
        pass++;
        const undersizedCount = pieceCellGroups.filter(g => g.length < config.minPieceSize).length;

        if (undersizedCount === 0) {
            console.log(`[Polyomino Merge] Pass ${pass}: No undersized pieces, stopping`);
            break;
        }

        console.log(`[Polyomino Merge] Pass ${pass}: ${undersizedCount} undersized pieces to process`);

        // Build blockId -> group index map
        const blockToGroupIdx = new Map<number, number>();
        pieceCellGroups.forEach((group, idx) => {
            group.forEach(cell => {
                blockToGroupIdx.set(cell.blockId, idx);
            });
        });

        // Track group sizes
        const groupSizes = pieceCellGroups.map(g => g.length);

        // Track which groups have been absorbed
        const absorbedInto = new Map<number, number>();

        // Find undersized groups, sort by size (smallest first)
        const undersizedIndices = pieceCellGroups
            .map((g, idx) => ({ idx, g }))
            .filter(({ g }) => g.length < config.minPieceSize)
            .sort((a, b) => a.g.length - b.g.length)
            .map(({ idx }) => idx);

        let passMerges = 0;

        for (const smallIdx of undersizedIndices) {
            // Follow absorption chain
            let currentIdx = smallIdx;
            while (absorbedInto.has(currentIdx)) {
                currentIdx = absorbedInto.get(currentIdx)!;
            }
            if (currentIdx !== smallIdx) continue;

            const smallGroup = pieceCellGroups[smallIdx];
            if (!smallGroup || smallGroup.length >= config.minPieceSize) continue;

            // Collect all neighbors of all cells in this group
            const neighborBlockIds = new Set<number>();
            for (const cell of smallGroup) {
                const neighbors = [
                    cellMap.get(cellKey(cell.x, cell.y - 1)),
                    cellMap.get(cellKey(cell.x + 1, cell.y)),
                    cellMap.get(cellKey(cell.x, cell.y + 1)),
                    cellMap.get(cellKey(cell.x - 1, cell.y)),
                ].filter((c): c is GridCell => c !== undefined);

                for (const neighbor of neighbors) {
                    neighborBlockIds.add(neighbor.blockId);
                }
            }

            // Find candidate groups
            const candidates: Array<{
                groupIdx: number;
                currentSize: number;
            }> = [];

            for (const blockId of neighborBlockIds) {
                let targetIdx = blockToGroupIdx.get(blockId);
                if (targetIdx === undefined) continue;

                while (absorbedInto.has(targetIdx)) {
                    targetIdx = absorbedInto.get(targetIdx)!;
                }

                if (targetIdx === smallIdx) continue;
                if (candidates.some(c => c.groupIdx === targetIdx)) continue;

                const currentSize = groupSizes[targetIdx] ?? 0;
                const newSize = currentSize + smallGroup.length;

                // Allow merge up to maxPieceSize (or 5 for cross pentomino case)
                if (newSize <= Math.max(config.maxPieceSize, 5)) {
                    candidates.push({ groupIdx: targetIdx, currentSize });
                }
            }

            if (candidates.length === 0) continue;

            // Prefer smallest target
            candidates.sort((a, b) => a.currentSize - b.currentSize);

            const targetIdx = candidates[0]!.groupIdx;

            // Merge
            absorbedInto.set(smallIdx, targetIdx);
            groupSizes[targetIdx] = (groupSizes[targetIdx] ?? 0) + smallGroup.length;
            passMerges++;
            mergeCount++;
        }

        console.log(`[Polyomino Merge] Pass ${pass}: ${passMerges} merges performed`);

        if (passMerges === 0) break;

        // Rebuild groups
        const newGroups: GridCell[][] = pieceCellGroups.map(() => []);
        for (let i = 0; i < pieceCellGroups.length; i++) {
            let targetIdx = i;
            while (absorbedInto.has(targetIdx)) {
                targetIdx = absorbedInto.get(targetIdx)!;
            }
            for (const cell of pieceCellGroups[i]!) {
                newGroups[targetIdx]!.push(cell);
            }
        }
        pieceCellGroups = newGroups.filter(g => g.length > 0);
    }

    console.log(`[Polyomino Merge] Completed: ${mergeCount} total merges, ${pieceCellGroups.length} final pieces`);

    // Rebuild Piece objects
    const result: Piece[] = [];
    let pieceCounter = 0;

    for (const cells of pieceCellGroups) {
        if (cells.length > 0) {
            result.push(createPiece(cells, pieceCounter++, getBlockId));
        }
    }

    return result;
}

/**
 * Validate polyomino output against config constraints.
 */
function validatePolyominoOutput(
    pieces: Piece[],
    config: PolyominoConfig,
    crossPentominoCreated: boolean
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const pieceSizes = pieces.map(p => p.cells.length);
    const undersized = pieceSizes.filter(s => s < config.minPieceSize);
    const oversized = pieceSizes.filter(s => s > config.maxPieceSize && s !== 5);
    const size5Pieces = pieceSizes.filter(s => s === 5);

    if (undersized.length > 0) {
        errors.push(`${undersized.length} pieces below minPieceSize (${config.minPieceSize})`);
    }

    if (oversized.length > 0) {
        errors.push(`${oversized.length} pieces above maxPieceSize (${config.maxPieceSize})`);
    }

    if (size5Pieces.length > 1) {
        errors.push(`${size5Pieces.length} 5-cell pieces found, max allowed is 1`);
    }

    if (size5Pieces.length === 1 && !crossPentominoCreated) {
        errors.push(`5-cell piece exists but was not created as cross pentomino`);
    }

    return { valid: errors.length === 0, errors };
}


function createPiece(
    cells: GridCell[],
    pieceIndex: number,
    getBlockId: (x: number, y: number) => number
): Piece {
    if (cells.length === 0) {
        throw new Error('Cannot create piece from empty cells');
    }

    // Find anchor (top-left-most cell)
    let anchor = cells[0]!;
    for (const cell of cells) {
        if (cell.y < anchor.y || (cell.y === anchor.y && cell.x < anchor.x)) {
            anchor = cell;
        }
    }

    const correctX = anchor.x;
    const correctY = anchor.y;

    // Build piece cells with relative coordinates and adjacency
    const pieceCells: PieceCell[] = cells.map(cell => {
        const node: [number, number, number, number] = [
            getBlockId(cell.x, cell.y - 1), // up
            getBlockId(cell.x + 1, cell.y), // right
            getBlockId(cell.x, cell.y + 1), // down
            getBlockId(cell.x - 1, cell.y), // left
        ];

        return {
            relX: cell.x - correctX,
            relY: cell.y - correctY,
            letter: cell.letter,
            blockId: cell.blockId,
            node,
        };
    });

    // Sort cells by relY, then relX for consistent ordering
    pieceCells.sort((a, b) => {
        if (a.relY !== b.relY) return a.relY - b.relY;
        return a.relX - b.relX;
    });

    return {
        id: `piece_${pieceIndex}`,
        correctX,
        correctY,
        cells: pieceCells,
    };
}

// === Validation ===

export function validatePolyominoPuzzle(json: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof json !== 'object' || json === null) {
        return { valid: false, errors: ['JSON must be an object'] };
    }

    const obj = json as Record<string, unknown>;

    if (typeof obj.theme !== 'string') errors.push('Missing or invalid "theme"');
    if (typeof obj.gridWidth !== 'number') errors.push('Missing or invalid "gridWidth"');
    if (typeof obj.gridHeight !== 'number') errors.push('Missing or invalid "gridHeight"');
    if (!Array.isArray(obj.pieces)) errors.push('Missing or invalid "pieces" array');

    if (Array.isArray(obj.pieces)) {
        const blockIds = new Set<number>();
        const pieceIds = new Set<string>();

        for (let i = 0; i < obj.pieces.length; i++) {
            const piece = obj.pieces[i] as Record<string, unknown>;

            if (typeof piece.id !== 'string') {
                errors.push(`Piece ${i}: missing or invalid "id"`);
            } else if (pieceIds.has(piece.id)) {
                errors.push(`Piece ${i}: duplicate id "${piece.id}"`);
            } else {
                pieceIds.add(piece.id);
            }

            if (typeof piece.correctX !== 'number') errors.push(`Piece ${i}: invalid "correctX"`);
            if (typeof piece.correctY !== 'number') errors.push(`Piece ${i}: invalid "correctY"`);

            if (!Array.isArray(piece.cells)) {
                errors.push(`Piece ${i}: missing "cells" array`);
            } else {
                for (let j = 0; j < piece.cells.length; j++) {
                    const cell = piece.cells[j] as Record<string, unknown>;
                    if (typeof cell.relX !== 'number') errors.push(`Piece ${i} Cell ${j}: invalid "relX"`);
                    if (typeof cell.relY !== 'number') errors.push(`Piece ${i} Cell ${j}: invalid "relY"`);
                    if (typeof cell.letter !== 'string') errors.push(`Piece ${i} Cell ${j}: invalid "letter"`);
                    if (typeof cell.blockId !== 'number') {
                        errors.push(`Piece ${i} Cell ${j}: invalid "blockId"`);
                    } else {
                        if (blockIds.has(cell.blockId)) {
                            errors.push(`Piece ${i} Cell ${j}: duplicate blockId ${cell.blockId}`);
                        }
                        blockIds.add(cell.blockId);
                    }
                    if (!Array.isArray(cell.node) || cell.node.length !== 4) {
                        errors.push(`Piece ${i} Cell ${j}: invalid "node" array`);
                    }
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
