import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

export const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.warwickApi?.window?.isMaximized) {
        try {
          const max = await window.warwickApi.window.isMaximized();
          setIsMaximized(max);
        } catch {
          // ignore in non-electron or mock environments
        }
      }
    };
    checkMaximized();
  }, []);

  const handleMinimize = async () => {
    if (window.warwickApi?.window?.minimize) {
      await window.warwickApi.window.minimize();
    }
  };

  const handleMaximize = async () => {
    if (window.warwickApi?.window?.maximize) {
      await window.warwickApi.window.maximize();
      setIsMaximized((prev) => !prev);
    }
  };

  const handleClose = async () => {
    if (window.warwickApi?.window?.close) {
      await window.warwickApi.window.close();
    }
  };

  return (
    <div className="flex items-center gap-0.5 app-no-drag ml-1 select-none">
      <button
        type="button"
        onClick={handleMinimize}
        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
        title="Minimize"
        aria-label="Minimize"
      >
        <Minus size={13} />
      </button>

      <button
        type="button"
        onClick={handleMaximize}
        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
        title={isMaximized ? 'Restore' : 'Maximize'}
        aria-label="Maximize"
      >
        {isMaximized ? <Copy size={11} className="rotate-180" /> : <Square size={11} />}
      </button>

      <button
        type="button"
        onClick={handleClose}
        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-white hover:bg-[#e81123] transition-colors"
        title="Close"
        aria-label="Close"
      >
        <X size={13} />
      </button>
    </div>
  );
};

export default WindowControls;
