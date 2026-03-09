import { PropsWithChildren } from 'react';

export default function Card({ children }: PropsWithChildren) {
  return <section className="card">{children}</section>;
}
