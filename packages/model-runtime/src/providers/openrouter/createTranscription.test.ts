// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenRouterTranscription } from './createTranscription';

describe('OpenRouter transcription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends base64 audio with inferred format and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        text: 'Hello world',
        usage: {
          cost: 0.0005,
          input_tokens: 80,
          output_tokens: 20,
          seconds: 9.2,
          total_tokens: 100,
        },
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['audio-bytes'], 'speech.mp3', { type: 'audio/mpeg' });
    const result = await createOpenRouterTranscription(
      { file, language: 'en', model: 'openai/whisper-1', temperature: 0.2 },
      { apiKey: 'test' } as any,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    const body = JSON.parse((init.body as string) || '{}');
    expect(body.model).toBe('openai/whisper-1');
    expect(body.language).toBe('en');
    expect(body.temperature).toBe(0.2);
    expect(body.input_audio.format).toBe('mp3');
    expect(typeof body.input_audio.data).toBe('string');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test');
    expect(result.text).toBe('Hello world');
    expect(result.usage).toEqual({
      cost: 0.0005,
      inputTokens: 80,
      outputTokens: 20,
      seconds: 9.2,
      totalTokens: 100,
    });
  });

  it('infers wav format from mime when no extension', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ text: 'Hallo' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new Blob(['data'], { type: 'audio/wav' });
    await createOpenRouterTranscription({ file, model: 'openai/whisper-1' }, { apiKey: 'k' } as any);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.input_audio.format).toBe('wav');
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }),
    );

    const file = new File(['x'], 'a.wav', { type: 'audio/wav' });
    await expect(
      createOpenRouterTranscription({ file, model: 'openai/whisper-1' }, { apiKey: 'bad' } as any),
    ).rejects.toThrow('401');
  });
});
