"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';
import StatusStack from '@/components/common/StatusStack';
import MemoryGraph from '@/components/memory/MemoryGraph';
import MemoryList from '@/components/memory/MemoryList';
import ProfilePanel from '@/components/memory/ProfilePanel';
import ProjectContextBanner from '@/components/projects/ProjectContextBanner';
import { getProject, listMemories, queryMemory } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { MemoryItem } from '@/lib/types';

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function MemoryRoute() {
  const [searchParams] = useSearchParams();
  const projectId = parsePositiveInt(searchParams.get('project_id'));
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [memoryType, setMemoryType] = useState('');
  const [layer, setLayer] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'recent' | 'search'>('recent');

  usePageTitle(projectId ? '项目记忆' : '长期记忆');

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      try {
        const project = await getProject(projectId);
        setQuery((current) => current || project.research_question);
      } catch {
        // Ignore prefill failures.
      }
    })();
  }, [projectId]);

  async function loadRecentMemories() {
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const payload = await listMemories({
        limit: 12,
        memory_types: memoryType ? [memoryType] : [],
        layers: layer ? [layer] : [],
        project_id: projectId || undefined,
      });
      setItems(payload);
      setViewMode('recent');
      setInfo('当前显示最近写入的长期记忆。即使你刚刚重启前后端，也可以先在这里确认记忆是否已保存。');
      if (payload.length > 0) {
        setNotice(`已加载 ${payload.length} 条最近记忆。`);
      } else {
        setNotice('');
      }
    } catch (loadError) {
      setError((loadError as Error).message || '最近记忆加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecentMemories();
  }, []);

  async function searchMemory() {
    if (!query.trim()) {
      setInfo('未输入检索问题，已切回最近记忆列表。');
      await loadRecentMemories();
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    setNotice('');
    try {
      const payload = await queryMemory({
        query: query.trim(),
        top_k: 10,
        memory_types: memoryType ? [memoryType] : [],
        layers: layer ? [layer] : [],
        project_id: projectId || undefined,
      });
      setItems(payload);
      setViewMode('search');
      if (payload.length > 0) {
        setNotice(`已返回 ${payload.length} 条记忆结果。`);
      } else {
        setInfo('当前没有命中记忆结果。你可以换个问题重试，或先查看最近记忆。');
      }
    } catch (searchError) {
      setError((searchError as Error).message || '记忆检索失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card className="page-header-card">
        <span className="page-kicker">长期沉淀</span>
        <h2 className="page-shell-title">长期记忆</h2>
        <p className="page-shell-copy">先看最近写入的记忆，再按问题检索历史研究内容，并精确回跳到论文、复现或心得上下文。</p>
        <ProjectContextBanner projectId={projectId} message="当前为项目上下文记忆视图。" />
      </Card>

      <div className="library-toolbar-card">
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入你要检索的研究问题，例如：哪篇论文最适合先复现？"
        />
        <div className="grid-2">
          <select className="select" value={memoryType} onChange={(event) => setMemoryType(event.target.value)}>
            <option value="">全部记忆类型</option>
            <option value="PaperMemory">论文记忆</option>
            <option value="SummaryMemory">摘要记忆</option>
            <option value="ReflectionMemory">心得记忆</option>
            <option value="ReproMemory">复现记忆</option>
            <option value="IdeaMemory">灵感记忆</option>
            <option value="RepoMemory">代码仓记忆</option>
          </select>
          <select className="select" value={layer} onChange={(event) => setLayer(event.target.value)}>
            <option value="">全部层级</option>
            <option value="raw">原始层</option>
            <option value="structured">结构层</option>
            <option value="semantic">语义层</option>
            <option value="profile">画像层</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <Button onClick={() => void searchMemory()}>检索记忆</Button>
          <Button className="secondary" onClick={() => void loadRecentMemories()}>
            查看最近记忆
          </Button>
        </div>
      </div>

      <StatusStack
        items={[
          ...(error ? [{ variant: 'error' as const, message: error }] : []),
          ...(info ? [{ variant: 'info' as const, message: info }] : []),
          ...(notice ? [{ variant: 'success' as const, message: notice }] : []),
        ]}
      />

      <div className="memory-layout">
        <div>
          {loading ? (
            <Loading text={viewMode === 'recent' ? '加载最近记忆...' : '检索记忆中...'} />
          ) : (
            <MemoryList
              items={items}
              title={viewMode === 'recent' ? '最近写入的长期记忆' : '记忆检索结果'}
              emptyTitle={viewMode === 'recent' ? '当前还没有已保存的长期记忆' : '当前没有命中记忆结果'}
              emptyHint={
                viewMode === 'recent'
                  ? '当你在论文页点击“推送到记忆”或创建会写入记忆的对象后，这里会显示最近保存的记录。'
                  : '可以换个问题重新检索，或点击“查看最近记忆”确认已有记忆是否存在。'
              }
            />
          )}
        </div>
        <div className="memory-secondary-zone">
          <MemoryGraph />
          <ProfilePanel />
        </div>
      </div>
    </>
  );
}
