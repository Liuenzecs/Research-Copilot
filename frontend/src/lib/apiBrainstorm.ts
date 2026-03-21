import { BrainstormIdeaResult } from './types';
import { request } from './apiCore';

export async function generateBrainstormIdeas(topic: string, paperIds: number[] = []) {
  return request<BrainstormIdeaResult>('/brainstorm/ideas', {
    method: 'POST',
    body: JSON.stringify({ topic, paper_ids: paperIds }),
  });
}
