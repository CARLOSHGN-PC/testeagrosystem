import React from "react";

export function Badge({ className = "", style, children, ...props }) {
  return (
    <span
      className={`inline-flex items-center justify-center text-xs font-medium ${className}`}
      style={style}
      {...props}
    >
      {children}
    </span>
  );
}
