"use client";

import { useEffect, useState } from 'react';

import Card from '@/components/common/Card';
import ReflectionEditor from '@/components/reflections/ReflectionEditor';
import ReflectionTimeline from '@/components/reflections/ReflectionTimeline';
import { listReflections } from '@/lib/api';
import { Reflection } from '@/lib/types';

export default function ReflectionsPage() {
  const [items, setItems] = useState<Reflection[]>([]);

  async function reload() {
    const rows = (await listReflections()) as Reflection[];
    setItems(rows);
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <>
      <Card>
        <h2 className="title">研究心得</h2>
        <p className="subtle">结构化模板 + 时间线，支持汇报价值标记与一句话摘要。</p>
      </Card>
      <ReflectionEditor onCreated={reload} />
      <ReflectionTimeline reflections={items} />
    </>
  );
}
