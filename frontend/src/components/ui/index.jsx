'use client';

import { useEffect, useRef } from 'react';

const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60',
  outline: 'border border-brand-600 text-brand-700 bg-white hover:bg-brand-50 disabled:opacity-50',
  soft: 'bg-brand-50 text-gray-900 hover:bg-brand-100 disabled:opacity-50',
  ghost: 'text-gray-600 hover:bg-gray-100 disabled:opacity-50',
  danger: 'border border-red-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50',
};

export function Button({ variant = 'primary', loading, pill, children, className = '', disabled, ...rest }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed ${pill ? 'rounded-full' : 'rounded-lg'} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ---------------- Icon button ---------------- */
export function IconButton({ label, children, className = '', ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- Spinner ---------------- */
export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------- Popover (click outside / Esc to close) ---------------- */
export function Popover({ open, onClose, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    // defer so the click that opened it doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute z-30 rounded-xl border border-gray-200 bg-white shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ src, name, size = 32, className = '' }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-brand-500 font-semibold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials || '?'}
    </div>
  );
}
