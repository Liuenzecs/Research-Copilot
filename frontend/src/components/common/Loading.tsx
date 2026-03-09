export default function Loading({ text = '加载中...' }: { text?: string }) {
  return <div className="subtle">{text}</div>;
}
