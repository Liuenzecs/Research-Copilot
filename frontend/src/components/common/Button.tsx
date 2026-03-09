"use client";

import { ButtonHTMLAttributes } from 'react';

export default function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = props.className ? `button ${props.className}` : 'button';
  return <button {...props} className={className} />;
}
