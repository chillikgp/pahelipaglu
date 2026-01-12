

interface PolyominoEditorProps {
    jsonText: string;
    onJsonChange: (text: string) => void;
    onUpdate: () => void;
    onSave: () => void;
    error: string | null;
    isSaving: boolean;
}

export function PolyominoEditor({
    jsonText,
    onJsonChange,
    onUpdate,
    onSave,
    error,
    isSaving,
}: PolyominoEditorProps) {
    return (
        <div className="polyomino-editor">
            <h4 className="editor-title">JSON Editor</h4>

            <textarea
                className="json-textarea"
                value={jsonText}
                onChange={(e) => onJsonChange(e.target.value)}
                spellCheck={false}
                rows={20}
            />

            {error && (
                <div className="editor-error">
                    <strong>Validation Error:</strong> {error}
                </div>
            )}

            <div className="editor-buttons">
                <button
                    className="btn-secondary"
                    onClick={onUpdate}
                >
                    Update Polyomino Preview from JSON
                </button>
                <button
                    className="btn-primary"
                    onClick={onSave}
                    disabled={isSaving}
                >
                    {isSaving ? 'Saving...' : 'Save Polyomino JSON'}
                </button>
            </div>
        </div>
    );
}
