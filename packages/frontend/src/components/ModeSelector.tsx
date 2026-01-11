/**
 * Mode selector component.
 */

import type { GenerationMode } from '../types/api';
import './ModeSelector.css';

interface ModeSelectorProps {
    mode: GenerationMode;
    onChange: (mode: GenerationMode) => void;
    disabled?: boolean;
}

const MODES: Array<{ value: GenerationMode; label: string; description: string }> = [
    {
        value: 'ai',
        label: '🤖 AI Generated',
        description: 'Enter a topic and let AI create clues',
    },
    {
        value: 'manual_basic',
        label: '✏️ Words + Hints',
        description: 'Provide your own words and clues',
    },
    {
        value: 'manual_advanced',
        label: '🎯 Full Control',
        description: 'Define words, clues, and exact placement',
    },
];

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
    return (
        <div className="mode-selector">
            <div className="mode-selector-label">
                How do you want to create this crossword?
            </div>
            <div className="mode-options">
                {MODES.map((m) => (
                    <label
                        key={m.value}
                        className={`mode-option ${mode === m.value ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                    >
                        <input
                            type="radio"
                            name="mode"
                            value={m.value}
                            checked={mode === m.value}
                            onChange={() => onChange(m.value)}
                            disabled={disabled}
                        />
                        <div className="mode-content">
                            <span className="mode-label">{m.label}</span>
                            <span className="mode-description">{m.description}</span>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}
