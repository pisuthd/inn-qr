import { useEffect } from "react";
import { X } from 'lucide-react';

function Modal({ isOpen, onClose, title, subtitle, children }) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
            }}
        >
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                }}
            />

            {/* Card */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '480px',
                    maxHeight: '90vh',
                    background: 'linear-gradient(145deg, rgba(26, 26, 46, 0.95), rgba(15, 15, 30, 0.98))',
                    border: '1px solid rgba(0, 229, 196, 0.2)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    overflowY: 'auto',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>{title}</h2>
                        {subtitle && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#7dd3c2' }}>{subtitle}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.4rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#7dd3c2',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                {children}
            </div>
        </div>
    );
}

export default Modal;
