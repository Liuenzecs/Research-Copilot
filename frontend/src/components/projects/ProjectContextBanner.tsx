"use client";

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/common/Button';
import { projectPath } from '@/lib/routes';

export default function ProjectContextBanner({
  projectId,
  message,
  actions,
}: {
  projectId?: number | null;
  message: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();

  if (!projectId) {
    return null;
  }

  return (
    <div className="project-context-banner" data-testid="project-context-banner">
      <span className="subtle">{message}</span>
      <div className="projects-inline-actions">
        {actions}
        <Button className="secondary" type="button" onClick={() => navigate(projectPath(projectId))}>
          返回项目工作台
        </Button>
      </div>
    </div>
  );
}
