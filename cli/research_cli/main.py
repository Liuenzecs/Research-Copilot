import typer

from research_cli.client import pretty
from research_cli.commands import brainstorm, download, memory, reflection, repo, repro, search, summarize

app = typer.Typer(help='Research Copilot CLI')
reflection_app = typer.Typer(help='Reflection commands (MVP minimal)')


@app.command('search')
def search_cmd(query: str, limit: int = 10):
    typer.echo(pretty(search.run(query, limit)))


@app.command('download')
def download_cmd(paper_id: int | None = None, arxiv_id: str | None = None):
    typer.echo(pretty(download.run(paper_id=paper_id, arxiv_id=arxiv_id)))


@app.command('summarize')
def summarize_cmd(paper_id: int, deep: bool = False, focus: str = ''):
    if deep:
        typer.echo(pretty(summarize.deep(paper_id=paper_id, focus=focus)))
    else:
        typer.echo(pretty(summarize.quick(paper_id=paper_id)))


@app.command('brainstorm')
def brainstorm_cmd(topic: str):
    typer.echo(pretty(brainstorm.ideas(topic)))


@app.command('repo')
def repo_cmd(query: str = '', paper_id: int | None = None):
    typer.echo(pretty(repo.find(query=query, paper_id=paper_id)))


@app.command('repro')
def repro_cmd(paper_id: int | None = None, repo_id: int | None = None):
    typer.echo(pretty(repro.plan(paper_id=paper_id, repo_id=repo_id)))


@app.command('memory')
def memory_cmd(query: str, top_k: int = 10):
    typer.echo(pretty(memory.query(text=query, top_k=top_k)))


@reflection_app.command('create')
def reflection_create(
    reflection_type: str = typer.Option('paper', help='paper or reproduction'),
    stage: str = typer.Option('initial'),
    summary: str = typer.Option('', help='one-sentence report summary'),
):
    typer.echo(pretty(reflection.create(reflection_type=reflection_type, stage=stage, summary=summary)))


@reflection_app.command('list')
def reflection_list(status: str = typer.Option('', help='lifecycle_status filter')):
    typer.echo(pretty(reflection.list_items(status=status)))


@reflection_app.command('show')
def reflection_show(reflection_id: int):
    typer.echo(pretty(reflection.show(reflection_id)))


app.add_typer(reflection_app, name='reflection')


if __name__ == '__main__':
    app()
