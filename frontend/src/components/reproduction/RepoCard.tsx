export default function RepoCard({ name, url }: { name: string; url: string }) {
  return (
    <div className="card">
      <h4 style={{ margin: 0 }}>{name}</h4>
      <a className="subtle" href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
    </div>
  );
}
