"use client";

import React from "react";

export function useRingSeries<T>(size = 600) {
  const buffer = React.useRef<T[]>([]);
  const push = (v: T) => {
    buffer.current.push(v);
    if (buffer.current.length > size) buffer.current.shift();
  };
  return { buffer: buffer.current, push };
}

