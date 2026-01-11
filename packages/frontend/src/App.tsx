import { useState, useEffect, useCallback } from 'react';
import { InputForm } from './components/InputForm';
import { GridPreview } from './components/GridPreview';
import { ExportPayload } from './components/ExportPayload';
import { HistoryPanel } from './components/HistoryPanel';
import { ModeSelector } from './components/ModeSelector';
import type {
    GenerateRequest,
    GenerateResponse,
    GenerationMode,
    CrosswordListItem,
    CrosswordBundle,
} from './types/api';

const API_BASE = '/api';

function App() {
    // Mode selection
    const [mode, setMode] = useState<GenerationMode>('ai');

    // History state
    const [history, setHistory] = useState<CrosswordListItem[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Active crossword (from history)
    const [activeCrosswordId, setActiveCrosswordId] = useState<string | null>(null);
    const [activeCrossword, setActiveCrossword] = useState<CrosswordBundle | null>(null);

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [isHydrating, setIsHydrating] = useState(false);
    const [response, setResponse] = useState<GenerateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form dirty state for mode switch confirmation
    const [formDirty, setFormDirty] = useState(false);

    // Fetch history on mount
    const fetchHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch(`${API_BASE}/crosswords`);
            const data = await res.json();
            if (data.success && data.crosswords) {
                setHistory(data.crosswords);
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Fetch crossword bundle by ID
    const fetchCrossword = async (id: string) => {
        setIsHydrating(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/crosswords/${id}`);
            const data = await res.json();
            if (data.success && data.crossword) {
                setActiveCrosswordId(id);
                setActiveCrossword(data.crossword);
                // Clear generation response when viewing history
                setResponse(null);
            } else {
                throw new Error(data.error || 'Failed to fetch crossword');
            }
        } catch (err) {
            console.error('Failed to fetch crossword:', err);
            setError(err instanceof Error ? err.message : 'Failed to load crossword');
        } finally {
            setIsHydrating(false);
        }
    };

    // Handle mode change with confirmation
    const handleModeChange = (newMode: GenerationMode) => {
        if (formDirty && newMode !== mode) {
            if (!confirm('You have unsaved changes. Switch mode and reset form?')) {
                return;
            }
        }
        setMode(newMode);
        setFormDirty(false);
    };

    // Handle generation
    const handleGenerate = async (request: GenerateRequest) => {
        setIsGenerating(true);
        setError(null);
        setResponse(null);
        setActiveCrosswordId(null);
        setActiveCrossword(null);

        try {
            const res = await fetch(`${API_BASE}/generate-crossword`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            const data: GenerateResponse = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to generate crossword');
            }

            setResponse(data);
            setFormDirty(false);

            // Refresh history to show new crossword
            fetchHistory();
        } catch (err) {
            console.error('Error generating crossword:', err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsGenerating(false);
        }
    };

    // Handle starting a new crossword (clear active)
    const handleNewCrossword = () => {
        setActiveCrosswordId(null);
        setActiveCrossword(null);
        setResponse(null);
        setError(null);
    };

    const isLoading = isGenerating || isHydrating;

    // Determine what to show in the preview area
    const showActiveBundle = activeCrossword && !response;
    const showGenerationResponse = response?.success && response.puzzle;

    return (
        <div className="app">
            <header className="app-header">
                <h1 className="app-title">Crossword Generator</h1>
                <p className="app-subtitle">
                    AI-powered multi-language crossword puzzle generator
                </p>
            </header>

            <main className="app-content">
                <div className="app-sidebar">
                    <HistoryPanel
                        history={history}
                        activeCrosswordId={activeCrosswordId}
                        isLoading={isLoadingHistory}
                        onSelect={fetchCrossword}
                        onRefresh={fetchHistory}
                    />
                </div>

                <div className="app-main">
                    <ModeSelector
                        mode={mode}
                        onChange={handleModeChange}
                        disabled={isLoading}
                    />

                    {activeCrossword ? (
                        <div className="viewing-history">
                            <div className="viewing-history-header">
                                <span>Viewing: <strong>{activeCrossword.meta.theme}</strong></span>
                                <button onClick={handleNewCrossword} className="btn-secondary">
                                    + New Crossword
                                </button>
                            </div>
                        </div>
                    ) : (
                        <InputForm
                            onGenerate={handleGenerate}
                            isLoading={isGenerating}
                            mode={mode}
                            onDirtyChange={setFormDirty}
                        />
                    )}

                    <div>
                        {error && (
                            <div className="card">
                                <div className="error-message">
                                    <strong>Error:</strong> {error}
                                </div>
                            </div>
                        )}

                        {showGenerationResponse && (
                            <>
                                {response.warning && (
                                    <div className="card" style={{ marginBottom: '1rem', backgroundColor: 'rgba(255, 193, 7, 0.1)', borderLeft: '4px solid #ffc107' }}>
                                        <div style={{ color: '#ffc107', fontWeight: 500 }}>
                                            ⚠️ {response.warning}
                                        </div>
                                    </div>
                                )}
                                <GridPreview response={response} />
                                {response.payload && (
                                    <div className="card" style={{ marginTop: '2rem' }}>
                                        <ExportPayload payload={response.payload} />
                                    </div>
                                )}
                            </>
                        )}

                        {showActiveBundle && activeCrossword.grid && (
                            <div className="card">
                                <h2 className="card-title">Crossword Preview</h2>
                                <div className="history-stats">
                                    <span>Mode: {activeCrossword.summary.mode}</span>
                                    <span>Placed: {activeCrossword.summary.placedCount}</span>
                                    <span>Grid: {activeCrossword.meta.gridSize}</span>
                                </div>
                                <div
                                    className="history-grid"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${activeCrossword.grid.width}, 32px)`,
                                        gap: '2px',
                                        marginTop: '1rem',
                                    }}
                                >
                                    {activeCrossword.grid.cells.map((row, y) =>
                                        row.map((cell, x) => (
                                            <div
                                                key={`${x},${y}`}
                                                className={`grid-cell ${cell.g ? 'filled' : 'empty'}`}
                                            >
                                                {cell.g || ''}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {!showGenerationResponse && !showActiveBundle && !error && !isLoading && (
                            <div className="card">
                                <div className="empty-state">
                                    <div className="empty-state-icon">🧩</div>
                                    <p className="empty-state-text">
                                        Configure your crossword and click Generate to create a puzzle
                                    </p>
                                </div>
                            </div>
                        )}

                        {isLoading && (
                            <div className="card">
                                <div className="empty-state">
                                    <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 1rem' }} />
                                    <p className="empty-state-text">
                                        {isHydrating ? 'Loading crossword...' : 'Generating your crossword puzzle...'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
