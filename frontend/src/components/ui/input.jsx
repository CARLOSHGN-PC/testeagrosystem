import React from "react";

export function Input({ className = "", style, ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 bg-transparent outline-none ${className}`}
      style={style}
      {...props}
    />
  );
}
