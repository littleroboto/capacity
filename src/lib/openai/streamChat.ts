type ChatRole = 'system' | 'user' | 'assistant';

export type OpenAIChatMessage = { role: ChatRole; content: string };

export type StreamChatOptions = {
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number }) => void;
};

function openAIBaseUrl(): string {
  const raw = import.meta.env.VITE_OPENAI_BASE_URL as string | undefined;
  if (raw && raw.trim()) {
    return raw.replace(/\/$/, '');
  }
  return 'https://api.openai.com/v1';
}

/**
 * Chat Completions streaming. For static hosting, browsers may block direct calls to api.openai.com (CORS);
 * set `VITE_OPENAI_BASE_URL` to a same-origin proxy if needed.
 */
export async function streamOpenAIChatCompletion(options: StreamChatOptions): Promise<void> {
  const { apiKey, model, messages, signal, onDelta, onUsage } = options;
  const url = `${openAIBaseUrl()}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 600)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('No response body from OpenAI.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (typeof piece === 'string' && piece.length > 0) {
          onDelta(piece);
        }
        const u = json.usage;
        if (u && typeof u.prompt_tokens === 'number') {
          onUsage?.({
            prompt_tokens: u.prompt_tokens,
            completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : 0,
          });
        }
      } catch {
        // ignore malformed SSE JSON fragments
      }
    }
  }
}
