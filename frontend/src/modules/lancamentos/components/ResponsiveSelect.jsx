import React from 'react';
import { ChevronDown, Check } from 'lucide-react';

const defaultClass = 'w-full rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-left text-slate-100 shadow-sm outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-slate-900/70 disabled:text-slate-500';

export default function ResponsiveSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Selecione...',
  disabled = false,
  className = defaultClass,
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`${className} flex min-w-0 items-center justify-between gap-3 text-left`}
      >
        <span className={`block min-w-0 flex-1 truncate text-left ${selected ? 'text-slate-100' : 'text-slate-500'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[80] w-full max-w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50">
          <div className="max-h-[45vh] overflow-y-auto overflow-x-hidden py-1 overscroll-contain">
            <button
              type="button"
              onClick={() => choose('')}
              className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/10"
            >
              <span className="block min-w-0 flex-1 truncate text-left">{placeholder}</span>
              {!value ? <Check className="h-4 w-4 shrink-0 text-green-300" /> : null}
            </button>
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                title={option.label}
                onClick={() => choose(option.value)}
                className={`flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-white/10 ${String(option.value) === String(value) ? 'bg-green-500/15 text-green-100' : 'text-slate-100'}`}
              >
                <span className="block min-w-0 flex-1 truncate text-left">{option.label}</span>
                {String(option.value) === String(value) ? <Check className="h-4 w-4 shrink-0 text-green-300" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
