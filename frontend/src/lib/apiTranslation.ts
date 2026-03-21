import { TranslationResult } from './types';
import { request, requestStream } from './apiCore';

export async function translateSegment(payload: {
  text: string;
  mode?: 'paragraph' | 'selection';
  locator?: Record<string, unknown>;
}) {
  return request<TranslationResult>('/translation/segment', {
    method: 'POST',
    body: JSON.stringify({
      text: payload.text,
      mode: payload.mode ?? 'paragraph',
      locator: payload.locator ?? {},
    }),
  });
}

export async function translateSegmentStream(
  payload: {
    text: string;
    mode?: 'paragraph' | 'selection';
    locator?: Record<string, unknown>;
  },
  options?: {
    onDelta?: (delta: string) => void;
  },
) {
  return requestStream<TranslationResult>(
    '/translation/segment/stream',
    {
      method: 'POST',
      body: JSON.stringify({
        text: payload.text,
        mode: payload.mode ?? 'paragraph',
        locator: payload.locator ?? {},
      }),
    },
    {
      onDelta: options?.onDelta,
      pickComplete: (event) => (event.type === 'complete' ? (event.translation as TranslationResult) : undefined),
    },
  );
}
