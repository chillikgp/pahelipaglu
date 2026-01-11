import { useState } from 'react';

interface ExportPayloadProps {
    payload: string;
}

export function ExportPayload({ payload }: ExportPayloadProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleDownload = () => {
        const blob = new Blob([payload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'crossword-payload.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="export-section">
            <h3 className="word-list-title">Export Payload</h3>

            <div className="payload-box">
                {payload}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                    className="btn btn-primary copy-btn"
                    onClick={handleCopy}
                    style={{ flex: 1 }}
                >
                    {copied ? '✓ Copied!' : 'Copy to Clipboard'}
                </button>

                <button
                    className="btn btn-secondary"
                    onClick={handleDownload}
                >
                    Download
                </button>
            </div>

            {copied && (
                <div className="copy-success">
                    <span>✓</span>
                    <span>Payload copied to clipboard</span>
                </div>
            )}
        </div>
    );
}
