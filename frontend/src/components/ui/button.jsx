import React from "react";

export function Button({ className = "", style, children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center transition-colors disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}
