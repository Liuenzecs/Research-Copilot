import { PropsWithChildren } from 'react';

export default function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={['card', className].filter(Boolean).join(' ')}>{children}</section>;
}
