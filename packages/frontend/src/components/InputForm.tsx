import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import type { GenerateRequest, InputType, GenerationMode } from '../types/api';
import { LANGUAGES } from '../types/api';

interface InputFormProps {
    onGenerate: (request: GenerateRequest) => void;
    isLoading: boolean;
    mode?: GenerationMode;
    onDirtyChange?: (dirty: boolean) => void;
}

const INPUT_TYPES: { value: InputType; label: string }[] = [
    { value: 'TOPIC', label: 'Topic' },
    { value: 'TEXT', label: 'Text' },
    { value: 'URL', label: 'URL' },
    { value: 'PDF', label: 'PDF' },
];

export function InputForm({ onGenerate, isLoading, mode = 'ai', onDirtyChange }: InputFormProps) {
    const [formData, setFormData] = useState<GenerateRequest>({
        sessionId: crypto.randomUUID(),
        contentLanguage: 'en-US',
        mode,
        // AI defaults
        inputType: 'TOPIC',
        inputValue: 'Solar System',
        numItems: 10,
        userInstructions: '',
        // Manual defaults
        words: [{ word: '', clue: '', row: 1, col: 1, direction: 'ACROSS' }],
        // Shared defaults
        gridSizeX: 15,
        gridSizeY: 15,
        removeUnplacedWords: true, // Default true for AI
    });

    // Reset dirty state when mode changes
    useEffect(() => {
        if (onDirtyChange) {
            onDirtyChange(false);
        }
    }, [mode, onDirtyChange]);

    const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type } = e.target;

        // Convert number and range inputs to integers
        const isNumeric = type === 'number' || type === 'range';
        const parsedValue = isNumeric ? parseInt(value, 10) : value;

        setFormData((prev) => ({
            ...prev,
            [name]: isNumeric && !isNaN(parsedValue as number) ? parsedValue : value,
        }));

        onDirtyChange?.(true);
    };

    const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData((prev) => ({ ...prev, [name]: checked }));
        onDirtyChange?.(true);
    };

    // Manual word list handlers
    const handleWordChange = (index: number, field: string, value: any) => {
        const newWords = [...(formData.words || [])];
        // Use type assertion to handle dynamic field update safely
        const updatedWord = { ...newWords[index], [field]: value };
        newWords[index] = updatedWord as any;
        setFormData(prev => ({ ...prev, words: newWords }));
        onDirtyChange?.(true);
    };

    const handleAddWord = () => {
        const newWords = [...(formData.words || []), { word: '', clue: '', row: 1, col: 1, direction: 'ACROSS' as const }];
        setFormData(prev => ({ ...prev, words: newWords }));
        onDirtyChange?.(true);
    };

    const handleRemoveWord = (index: number) => {
        const newWords = (formData.words || []).filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, words: newWords }));
        onDirtyChange?.(true);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        // Prepare payload based on mode
        const payload = {
            ...formData,
            mode,
            sessionId: crypto.randomUUID(),
        };

        // For manual advanced, convert 1-based row/col to 0-based
        if (mode === 'manual_advanced' && payload.words) {
            payload.words = payload.words.map(w => ({
                ...w,
                row: (w.row || 1) - 1,
                col: (w.col || 1) - 1,
            }));
        }

        // Remove words array if in AI mode to avoid Zod validation errors on empty strings
        if (mode === 'ai') {
            delete payload.words;
        }

        onGenerate(payload);
    };

    const showPlacementFields = mode === 'manual_advanced';
    const showAiFields = mode === 'ai';

    return (
        <form onSubmit={handleSubmit} className="input-form">
            {/* Shared Settings */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h2 className="card-title">Settings</h2>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="gridSizeX">Grid Size</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="range"
                                id="gridSizeX"
                                name="gridSizeX"
                                min="5"
                                max="30"
                                value={formData.gridSizeX}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setFormData(prev => ({
                                        ...prev,
                                        gridSizeX: val,
                                        gridSizeY: val // Sync Y to keep square
                                    }));
                                    onDirtyChange?.(true);
                                }}
                                disabled={isLoading}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right' }}>
                                {formData.gridSizeX}×{formData.gridSizeX}
                            </span>
                        </div>
                    </div>

                    {/* Topic input for Manual Modes */}
                    {!showAiFields && (
                        <div className="form-group">
                            <label className="form-label" htmlFor="manualTopic">Topic / Title</label>
                            <input
                                type="text"
                                id="manualTopic"
                                name="inputValue" // Bind to inputValue which acts as theme
                                className="form-input"
                                value={formData.inputValue || ''}
                                onChange={handleChange}
                                disabled={isLoading}
                                placeholder="e.g., My Puzzle"
                            />
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label" htmlFor="contentLanguage">Language</label>
                        <select
                            id="contentLanguage"
                            name="contentLanguage"
                            className="form-select"
                            value={formData.contentLanguage}
                            onChange={handleChange}
                            disabled={isLoading}
                        >
                            {LANGUAGES.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Only show Unplaced Words option for AI/Basic modes where placement engine runs */}
                {mode !== 'manual_advanced' && (
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                name="removeUnplacedWords"
                                checked={formData.removeUnplacedWords}
                                onChange={handleCheckboxChange}
                                disabled={isLoading}
                            />
                            <span className="form-label" style={{ margin: 0 }}>Remove unplaced words from final puzzle</span>
                        </label>
                    </div>
                )}
            </div>

            {/* AI Input Fields */}
            {showAiFields && (
                <div className="card">
                    <h2 className="card-title">Content Source</h2>
                    <div className="form-group">
                        <label className="form-label">Input Type</label>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            {INPUT_TYPES.map((type) => (
                                <label key={type.value} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="inputType"
                                        value={type.value}
                                        checked={formData.inputType === type.value}
                                        onChange={handleChange}
                                        disabled={isLoading}
                                    />
                                    <span style={{ fontSize: '0.9rem' }}>{type.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="inputValue">
                            {formData.inputType === 'TOPIC' ? 'Topic' :
                                formData.inputType === 'URL' ? 'URL' :
                                    formData.inputType === 'TEXT' ? 'Text Content' : 'Input'}
                        </label>
                        {formData.inputType === 'TEXT' ? (
                            <textarea
                                id="inputValue"
                                name="inputValue"
                                className="form-textarea"
                                rows={4}
                                value={formData.inputValue}
                                onChange={handleChange}
                                disabled={isLoading}
                                placeholder="Paste your text content here..."
                            />
                        ) : (
                            <input
                                type="text"
                                id="inputValue"
                                name="inputValue"
                                className="form-input"
                                value={formData.inputValue}
                                onChange={handleChange}
                                disabled={isLoading}
                                placeholder={formData.inputType === 'TOPIC' ? 'e.g., Solar System' : 'https://...'}
                            />
                        )}
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label" htmlFor="numItems">Number of Words</label>
                            <input
                                type="number"
                                id="numItems"
                                name="numItems"
                                className="form-input"
                                min="3"
                                max="50"
                                value={formData.numItems}
                                onChange={handleChange}
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="userInstructions">Additional Instructions (Optional)</label>
                        <textarea
                            id="userInstructions"
                            name="userInstructions"
                            className="form-textarea"
                            rows={2}
                            value={formData.userInstructions}
                            onChange={handleChange}
                            disabled={isLoading}
                            placeholder="e.g., Use only simple words, focus on planets..."
                        />
                    </div>
                </div>
            )}

            {/* Manual Words Input */}
            {!showAiFields && (
                <div className="card">
                    <h2 className="card-title">Words & Clues</h2>
                    <div className="word-input-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {(formData.words || []).map((word, index) => (
                            <div key={index} className="word-item" style={{ alignItems: 'flex-start' }}>
                                <div className="word-number">{index + 1}</div>
                                <div className="word-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>

                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Word"
                                                value={word.word}
                                                onChange={(e) => handleWordChange(index, 'word', e.target.value)}
                                                disabled={isLoading}
                                            />
                                        </div>
                                        {showPlacementFields && (
                                            <>
                                                <div style={{ width: '60px' }}>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        placeholder="Row"
                                                        title="Row (1-based)"
                                                        value={word.row}
                                                        onChange={(e) => handleWordChange(index, 'row', parseInt(e.target.value))}
                                                        disabled={isLoading}
                                                    />
                                                </div>
                                                <div style={{ width: '60px' }}>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        placeholder="Col"
                                                        title="Column (1-based)"
                                                        value={word.col}
                                                        onChange={(e) => handleWordChange(index, 'col', parseInt(e.target.value))}
                                                        disabled={isLoading}
                                                    />
                                                </div>
                                                <div style={{ width: '100px' }}>
                                                    <select
                                                        className="form-select"
                                                        value={word.direction}
                                                        onChange={(e) => handleWordChange(index, 'direction', e.target.value)}
                                                        disabled={isLoading}
                                                    >
                                                        <option value="ACROSS">Across</option>
                                                        <option value="DOWN">Down</option>
                                                    </select>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Clue"
                                            value={word.clue}
                                            onChange={(e) => handleWordChange(index, 'clue', e.target.value)}
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleRemoveWord(index)}
                                    disabled={isLoading}
                                    title="Remove word"
                                    style={{ padding: '0.5rem', height: 'fit-content' }}
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="btn btn-secondary btn-full"
                        onClick={handleAddWord}
                        disabled={isLoading}
                        style={{ marginTop: '1rem' }}
                    >
                        + Add Word
                    </button>
                </div>
            )}

            <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={isLoading}
                style={{ marginTop: '2rem', height: '3rem', fontSize: '1.1rem' }}
            >
                {isLoading ? 'Generating...' : mode === 'manual_advanced' ? 'Verify & Build' : 'Generate Crossword'}
            </button>
        </form>
    );
}
