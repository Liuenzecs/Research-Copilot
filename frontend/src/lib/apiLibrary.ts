import { LibraryItem } from './types';
import { request } from './apiCore';

export async function listLibrary() {
  return request<{ items: LibraryItem[]; total: number }>('/library/list');
}
