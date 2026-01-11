/**
 * History panel component - shows list of past crosswords.
 */

import type { CrosswordListItem, GenerationMode } from '../types/api';
import './HistoryPanel.css';

interface HistoryPanelProps {
    history: CrosswordListItem[];
    activeCrosswordId: string | null;
    isLoading: boolean;
    onSelect: (id: string) => void;
    onRefresh: () => void;
}

/**
 * Format date for display.
 */
function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Get mode badge label.
 */
function getModeLabel(mode: GenerationMode): string {
    switch (mode) {
        case 'ai':
            return '🤖 AI';
        case 'manual_basic':
            return '✏️ Manual';
        case 'manual_advanced':
            return '🎯 Custom';
        default:
            return mode;
    }
}

export function HistoryPanel({
    history,
    activeCrosswordId,
    isLoading,
    onSelect,
    onRefresh,
}: HistoryPanelProps) {
    if (history.length === 0 && !isLoading) {
        return (
            <div className="history-panel">
                <div className="history-header">
                    <h3>My Crosswords</h3>
                    <button className="refresh-btn" onClick={onRefresh} title="Refresh">
                        🔄
                    </button>
                </div>
                <div className="history-empty">
                    <p>No crosswords yet. Generate one to get started!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="history-panel">
            <div className="history-header">
                <h3>My Crosswords</h3>
                <button className="refresh-btn" onClick={onRefresh} title="Refresh">
                    🔄
                </button>
            </div>

            {isLoading && (
                <div className="history-loading">Loading...</div>
            )}

            <ul className="history-list">
                {history.map((item) => (
                    <li
                        key={item.id}
                        className={`history-item ${item.id === activeCrosswordId ? 'active' : ''}`}
                        onClick={() => onSelect(item.id)}
                    >
                        <div className="history-item-header">
                            <span className="history-theme">{item.theme}</span>
                            <span className="history-mode">{getModeLabel(item.mode)}</span>
                        </div>
                        <div className="history-item-meta">
                            <span className="history-grid">{item.gridSize}</span>
                            <span className="history-placed">{item.placedCount} words</span>
                            <span className="history-date">{formatDate(item.createdAt)}</span>
                        </div>
                        {item.warning && (
                            <div className="history-warning">⚠️ {item.warning}</div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
