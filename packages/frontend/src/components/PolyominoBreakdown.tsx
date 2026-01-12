import { useState, useCallback } from 'react';
import { PolyominoPreview } from './PolyominoPreview';
import { PolyominoEditor } from './PolyominoEditor';
import {
    generatePolyomino,
    validatePolyominoPuzzle,
    DEFAULT_POLYOMINO_CONFIG,
    type Placement,
    type PolyominoPuzzle,
    type PolyominoConfig,
} from '../utils/polyomino-generator';

interface PolyominoBreakdownProps {
    placements: Placement[];
    gridWidth: number;
    gridHeight: number;
    theme: string;
    crosswordId?: string;
}

const API_BASE = '/api';

export function PolyominoBreakdown({
    placements,
    gridWidth,
    gridHeight,
    theme,
    crosswordId,
}: PolyominoBreakdownProps) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [puzzle, setPuzzle] = useState<PolyominoPuzzle | null>(null);
    const [jsonText, setJsonText] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Config state
    const [config, setConfig] = useState<PolyominoConfig>(DEFAULT_POLYOMINO_CONFIG);

    // Generate polyomino on toggle
    const handleToggle = useCallback(() => {
        if (!isEnabled) {
            // Generate with current config
            const generated = generatePolyomino(placements, gridWidth, gridHeight, theme, config);
            setPuzzle(generated);
            setJsonText(JSON.stringify(generated, null, 2));
            setParseError(null);
            setSaveMessage(null);
        }
        setIsEnabled(!isEnabled);
    }, [isEnabled, placements, gridWidth, gridHeight, theme, config]);

    // Update preview from edited JSON
    const handleUpdate = useCallback(() => {
        try {
            const parsed = JSON.parse(jsonText);
            const validation = validatePolyominoPuzzle(parsed);

            if (!validation.valid) {
                setParseError(validation.errors.join('; '));
                return;
            }

            setPuzzle(parsed as PolyominoPuzzle);
            setParseError(null);
            setSaveMessage(null);
        } catch (e) {
            setParseError(e instanceof Error ? e.message : 'Invalid JSON');
        }
    }, [jsonText]);

    // Save polyomino JSON
    const handleSave = useCallback(async () => {
        if (!crosswordId) {
            setSaveMessage('Error: No crossword ID available');
            return;
        }

        try {
            const parsed = JSON.parse(jsonText);
            const validation = validatePolyominoPuzzle(parsed);

            if (!validation.valid) {
                setParseError(validation.errors.join('; '));
                return;
            }

            setIsSaving(true);
            setSaveMessage(null);

            const res = await fetch(`${API_BASE}/crosswords/${crosswordId}/polyomino`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: jsonText,
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setSaveMessage('Polyomino saved successfully!');
            } else {
                setSaveMessage(`Error: ${data.error || 'Failed to save'}`);
            }
        } catch (e) {
            setSaveMessage(`Error: ${e instanceof Error ? e.message : 'Failed to save'}`);
        } finally {
            setIsSaving(false);
        }
    }, [jsonText, crosswordId]);

    return (
        <div className="polyomino-breakdown card">
            <h2 className="card-title">Polyomino Breakdown (Bonza Mode)</h2>

            {/* Config controls - shown before generation */}
            {!isEnabled && (
                <div className="polyomino-config">
                    <div className="config-row">
                        <label>
                            Min Piece Size:
                            <select
                                value={config.minPieceSize}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    minPieceSize: Number(e.target.value)
                                }))}
                            >
                                <option value={1}>1 (allow singles)</option>
                                <option value={2}>2 (default)</option>
                                <option value={3}>3</option>
                            </select>
                        </label>

                        <label>
                            Max Piece Size:
                            <select
                                value={config.maxPieceSize}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    maxPieceSize: Number(e.target.value)
                                }))}
                            >
                                <option value={3}>3</option>
                                <option value={4}>4 (default)</option>
                                <option value={5}>5</option>
                            </select>
                        </label>

                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={config.allowSingleCrossPentomino}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    allowSingleCrossPentomino: e.target.checked
                                }))}
                            />
                            Allow Cross Pentomino (+)
                        </label>
                    </div>
                </div>
            )}

            <div className="polyomino-toggle">
                <button
                    className={`btn-toggle ${isEnabled ? 'active' : ''}`}
                    onClick={handleToggle}
                >
                    {isEnabled ? '✓ Polyomino Generated' : 'Generate Polyomino Pieces'}
                </button>
            </div>

            {isEnabled && puzzle && (
                <>
                    <div className="polyomino-stats">
                        <span>Pieces: {puzzle.pieces.length}</span>
                        <span>Grid: {puzzle.gridWidth}×{puzzle.gridHeight}</span>
                        <span>
                            Single-cell: {puzzle.pieces.filter(p => p.cells.length === 1).length}
                        </span>
                    </div>

                    <PolyominoPreview pieces={puzzle.pieces} />

                    <PolyominoEditor
                        jsonText={jsonText}
                        onJsonChange={setJsonText}
                        onUpdate={handleUpdate}
                        onSave={handleSave}
                        error={parseError}
                        isSaving={isSaving}
                    />

                    {saveMessage && (
                        <div className={`save-message ${saveMessage.startsWith('Error') ? 'error' : 'success'}`}>
                            {saveMessage}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
