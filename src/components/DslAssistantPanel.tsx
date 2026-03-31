import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DslSyntaxHelpBody } from '@/components/DslEditorCore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  applyReplacePatches,
  assistantContentForDisplay,
  assistantHasYamlStreamMarker,
  DSL_EDIT_MARKER,
  DSL_YAML_STREAM_MARKER,
  parseDslEditPayload,
  yamlStreamBufferFromAssistantAccumulated,
} from '@/lib/dslAssistant/editJson';
import {
  commitProposedEditorBuffer,
  validateProposedEditorBuffer,
} from '@/lib/dslAssistant/applyProposed';
import {
  buildUserMessageWithYaml,
  getDslAssistantSystemPrompt,
  prepareDslForPrompt,
} from '@/lib/dslAssistant/systemPrompt';
import {
  DEFAULT_OPENAI_MODEL_ID,
  estimateMessageCostUsd,
  OPENAI_MODEL_IDS,
  OPENAI_MODEL_PRICING_USD_PER_1M,
} from '@/lib/openai/pricing';
import { streamOpenAIChatCompletion, type OpenAIChatMessage } from '@/lib/openai/streamChat';
import { cn } from '@/lib/utils';
import { useAtcStore } from '@/store/useAtcStore';
import { BookOpen, KeyRound, Loader2, Send, Square, Eye, EyeOff, Terminal } from 'lucide-react';

/** Persists across browser sessions (localStorage). Legacy sessionStorage value is migrated once. */
const OPENAI_API_KEY_STORAGE_KEY = 'cpm_openai_api_key';
const MAX_USER_CHARS = 8000;
/** Prior user/assistant pairs in the API payload (excludes the current turn, which is sent as CURRENT_YAML + request). */
const ASSISTANT_API_HISTORY_MESSAGE_CAP = 28;

function readStoredApiKey(): string {
  try {
    let v = localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) ?? '';
    if (!v.trim()) {
      const legacy = sessionStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) ?? '';
      if (legacy.trim()) {
        v = legacy.trim();
        try {
          localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, v);
          sessionStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
        } catch {
          /* localStorage unavailable (e.g. private mode); keep using in-memory / legacy */
        }
      }
    }
    return v;
  } catch {
    return '';
  }
}

type ThreadMsg = { id: string; role: 'user' | 'assistant'; content: string };

type StatusLine =
  | 'Idle'
  | 'Calling model…'
  | 'Receiving…'
  | 'Applying edit…'
  | 'Parse check: OK'
  | 'Parse check: failed — see error';

export type DslAssistantLayout = 'panel' | 'dock';

type DslAssistantPanelProps = {
  /** `dock` = Code workspace bottom panel: streams YAML into Monaco, no review dialog. */
  layout?: DslAssistantLayout;
};

export function DslAssistantPanel({ layout = 'panel' }: DslAssistantPanelProps) {
  const threadId = useId();
  const docked = layout === 'dock';
  const dslText = useAtcStore((s) => s.dslText);
  const parseError = useAtcStore((s) => s.parseError);
  const setDslText = useAtcStore((s) => s.setDslText);
  const setDslAssistantEditorLock = useAtcStore((s) => s.setDslAssistantEditorLock);

  const [apiKey, setApiKey] = useState(readStoredApiKey);
  /** When false and a key exists, the key field + note are hidden (use header “API key” to expand). */
  const [apiKeySectionOpen, setApiKeySectionOpen] = useState(() => !readStoredApiKey().trim());
  const [showKey, setShowKey] = useState(false);
  const [modelId, setModelId] = useState(DEFAULT_OPENAI_MODEL_ID);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [composer, setComposer] = useState('');
  const [streamingAssistant, setStreamingAssistant] = useState('');
  const [status, setStatus] = useState<StatusLine>('Idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [lastMessageUsd, setLastMessageUsd] = useState<number | null>(null);
  const [sessionUsd, setSessionUsd] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBefore, setPreviewBefore] = useState('');
  const [previewAfter, setPreviewAfter] = useState('');
  const [previewApplyError, setPreviewApplyError] = useState<string | null>(null);
  const [syntaxOpen, setSyntaxOpen] = useState(false);

  /** Latest thread for API calls (avoids stale closure if send runs before a re-render). */
  const messagesRef = useRef<ThreadMsg[]>([]);
  messagesRef.current = messages;

  const abortRef = useRef<AbortController | null>(null);
  const dslSnapshotRef = useRef('');
  const lastFailureAt = useRef(0);
  const systemPromptRef = useRef<string | null>(null);
  const yamlFlushRafRef = useRef<number | null>(null);
  const pendingYamlRef = useRef<string | null>(null);

  const persistKey = useCallback(() => {
    try {
      if (apiKey.trim()) {
        localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, apiKey.trim());
        sessionStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
      } else {
        localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
        sessionStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [apiKey]);

  const collapseKeySectionIfSet = useCallback(() => {
    if (apiKey.trim()) setApiKeySectionOpen(false);
    else setApiKeySectionOpen(true);
  }, [apiKey]);

  const persistKeyAndCollapse = useCallback(() => {
    persistKey();
    collapseKeySectionIfSet();
  }, [persistKey, collapseKeySectionIfSet]);

  const handleApiKeyBlur = useCallback(() => {
    persistKey();
    collapseKeySectionIfSet();
  }, [persistKey, collapseKeySectionIfSet]);

  const hasApiKey = Boolean(apiKey.trim());
  const showApiKeyFields = !hasApiKey || apiKeySectionOpen;

  const busy =
    status === 'Calling model…' || status === 'Receiving…' || status === 'Applying edit…';
  const composerInputDisabled = busy || Date.now() - lastFailureAt.current < 1000;
  const sendDisabled = !apiKey.trim() || composerInputDisabled || !composer.trim();

  const buildMessagesForApi = useCallback(
    (history: ThreadMsg[], nextUserContent: string): OpenAIChatMessage[] => {
      if (!systemPromptRef.current) {
        systemPromptRef.current = getDslAssistantSystemPrompt();
      }
      const sys = systemPromptRef.current;
      const tail = history.slice(-ASSISTANT_API_HISTORY_MESSAGE_CAP);
      const out: OpenAIChatMessage[] = [{ role: 'system', content: sys }];
      for (const m of tail) {
        out.push({ role: m.role, content: m.content });
      }
      out.push({ role: 'user', content: nextUserContent });
      return out;
    },
    []
  );

  const flushYamlRaf = useCallback(() => {
    if (yamlFlushRafRef.current != null) {
      cancelAnimationFrame(yamlFlushRafRef.current);
      yamlFlushRafRef.current = null;
    }
    pendingYamlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    flushYamlRaf();
    setStatus((s) => (s === 'Calling model…' || s === 'Receiving…' ? 'Idle' : s));
    setStreamingAssistant('');
    setDslAssistantEditorLock(false);
    /** Editor restore runs in `send`’s `AbortError` branch when a request was in flight. */
  }, [flushYamlRaf, setDslAssistantEditorLock]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const openPreview = useCallback((before: string, after: string) => {
    setPreviewBefore(before);
    setPreviewAfter(after);
    setPreviewApplyError(null);
    setPreviewOpen(true);
    setStatus('Idle');
    setStatusDetail(null);
  }, []);

  const finishAssistantResponse = useCallback(
    (assistantRaw: string, snapshot: string) => {
      const streamedYaml = yamlStreamBufferFromAssistantAccumulated(assistantRaw).yaml;
      const hadYamlMarker = assistantHasYamlStreamMarker(assistantRaw);
      const payload = parseDslEditPayload(assistantRaw);

      /** Prefer JSON patches → JSON full_yaml → streaming YAML (legacy / full rewrites). */
      const applyProposed = (proposed: string) => {
        if (docked) {
          setDslText(proposed);
          setStatus('Applying edit…');
          const v = validateProposedEditorBuffer(proposed);
          if (!v.ok) {
            setDslText(snapshot);
            setStatus('Parse check: failed — see error');
            setStatusDetail(v.error);
            return;
          }
          commitProposedEditorBuffer(proposed);
          setStatus('Parse check: OK');
          setStatusDetail(null);
        } else {
          openPreview(snapshot, proposed);
        }
      };

      if (payload?.kind === 'patches') {
        const r = applyReplacePatches(snapshot, payload.patches);
        if (r.ok) {
          applyProposed(r.text);
          return;
        }
        // Fall through to YAML stream or report patch error if nothing else applies.
        if (!hadYamlMarker || streamedYaml === null || streamedYaml.trim().length === 0) {
          setStatus('Idle');
          setStatusDetail(r.error);
          return;
        }
      }

      if (payload?.kind === 'full_yaml') {
        applyProposed(payload.yaml);
        return;
      }

      if (hadYamlMarker && streamedYaml !== null && streamedYaml.trim().length > 0) {
        applyProposed(streamedYaml);
        return;
      }

      if (!payload) {
        setStatus('Idle');
        setStatusDetail(
          docked
            ? `No valid edit found. The reply must include ${DSL_EDIT_MARKER} plus JSON, or the same JSON inside a markdown json code fence, or ${DSL_YAML_STREAM_MARKER} plus the full YAML. Expected shapes: {"kind":"patches","patches":[{"type":"replace","old":"…","new":"…"}]} or {"kind":"full_yaml","yaml":"…"}.`
            : 'No structured edit in the reply — use ' +
                DSL_EDIT_MARKER +
                ' or a json code block with kind/patches or kind/full_yaml.'
        );
      }
    },
    [docked, openPreview, setDslText]
  );

  const send = useCallback(async () => {
    const text = composer.trim();
    if (!text || !apiKey.trim()) return;
    if (text.length > MAX_USER_CHARS) {
      setStatusDetail(`Message too long (max ${MAX_USER_CHARS} characters).`);
      return;
    }

    persistKey();
    const { text: yamlSlice, truncatedNote } = prepareDslForPrompt(dslText);
    dslSnapshotRef.current = dslText;
    const userContent = buildUserMessageWithYaml(yamlSlice, text, truncatedNote);

    const userMsg: ThreadMsg = { id: crypto.randomUUID(), role: 'user', content: text };
    const priorThread = messagesRef.current;
    setMessages((m) => [...m, userMsg]);
    setComposer('');
    setStreamingAssistant('');
    setStatus('Calling model…');
    setStatusDetail(null);
    flushYamlRaf();
    if (docked) {
      setDslAssistantEditorLock(true);
    }

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = '';
    const usageHolder: { last?: { prompt_tokens: number; completion_tokens: number } } = {};

    const scheduleYamlFlush = () => {
      if (!docked) return;
      if (yamlFlushRafRef.current != null) return;
      yamlFlushRafRef.current = requestAnimationFrame(() => {
        yamlFlushRafRef.current = null;
        const y = pendingYamlRef.current;
        if (y != null) setDslText(y);
      });
    };

    try {
      setStatus('Receiving…');
      await streamOpenAIChatCompletion({
        apiKey: apiKey.trim(),
        model: modelId,
        messages: buildMessagesForApi(priorThread, userContent),
        signal: ac.signal,
        onDelta: (d) => {
          acc += d;
          setStreamingAssistant(acc);
          if (docked) {
            // Once the model commits to JSON patches, do not stream full YAML into Monaco (avoids whole-buffer churn).
            if (acc.includes(DSL_EDIT_MARKER)) return;
            const { yaml } = yamlStreamBufferFromAssistantAccumulated(acc);
            if (yaml !== null) {
              pendingYamlRef.current = yaml;
              scheduleYamlFlush();
            }
          }
        },
        onUsage: (u) => {
          usageHolder.last = u;
        },
      });

      flushYamlRaf();
      if (docked) {
        if (!acc.includes(DSL_EDIT_MARKER)) {
          const { yaml } = yamlStreamBufferFromAssistantAccumulated(acc);
          if (yaml !== null) setDslText(yaml);
        }
      }

      const assistantMsg: ThreadMsg = { id: crypto.randomUUID(), role: 'assistant', content: acc };
      setMessages((m) => [...m, assistantMsg]);
      setStreamingAssistant('');

      const usage = usageHolder.last;
      if (usage) {
        const usd = estimateMessageCostUsd(modelId, usage.prompt_tokens, usage.completion_tokens);
        setLastMessageUsd(usd);
        setSessionUsd((s) => s + usd);
      } else {
        setLastMessageUsd(null);
      }

      finishAssistantResponse(acc, dslSnapshotRef.current);
    } catch (e) {
      flushYamlRaf();
      setStreamingAssistant('');
      if ((e as Error).name === 'AbortError') {
        setStatus('Idle');
        setDslAssistantEditorLock(false);
        if (docked) {
          setDslText(dslSnapshotRef.current);
        }
        return;
      }
      lastFailureAt.current = Date.now();
      setStatus('Idle');
      setStatusDetail((e as Error).message || String(e));
    } finally {
      abortRef.current = null;
      setDslAssistantEditorLock(false);
    }
  }, [
    apiKey,
    buildMessagesForApi,
    composer,
    docked,
    dslText,
    finishAssistantResponse,
    flushYamlRaf,
    modelId,
    persistKey,
    setDslAssistantEditorLock,
    setDslText,
  ]);

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!sendDisabled) void send();
    }
  };

  const confirmApply = useCallback(() => {
    setPreviewApplyError(null);
    setStatus('Applying edit…');
    const v = validateProposedEditorBuffer(previewAfter);
    if (!v.ok) {
      setPreviewApplyError(v.error);
      setStatus('Parse check: failed — see error');
      setStatusDetail(v.error);
      return;
    }
    commitProposedEditorBuffer(previewAfter);
    setPreviewOpen(false);
    setStatus('Parse check: OK');
    setStatusDetail(null);
  }, [previewAfter]);

  const inputClass =
    'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600/50 dark:bg-zinc-800/90';

  const threadUl = (
    <ul className={cn('flex flex-col', docked ? 'gap-2' : 'gap-3')}>
      {messages.map((m) => (
        <li key={m.id} className={cn('text-xs leading-relaxed', m.role === 'user' ? 'text-foreground' : '')}>
          <span className="font-medium text-muted-foreground">
            {m.role === 'user' ? 'You' : 'Assistant'}
          </span>
          {m.role === 'assistant' ? (
            <AssistantBubble content={m.content} />
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{m.content}</p>
          )}
        </li>
      ))}
      {streamingAssistant ? (
        <li className="text-xs leading-relaxed">
          <span className="font-medium text-muted-foreground">Assistant</span>
          <AssistantBubble content={streamingAssistant} streaming />
        </li>
      ) : null}
    </ul>
  );

  const costHint =
    lastMessageUsd != null ? (
      <span>
        Last ~${lastMessageUsd.toFixed(3)} · Sess ~${sessionUsd.toFixed(2)}
        <span className="text-muted-foreground/60"> · est.</span>
      </span>
    ) : (
      <span>
        Sess ~${sessionUsd.toFixed(2)}
        <span className="text-muted-foreground/60"> · est.</span>
      </span>
    );

  const showDockStatusStrip =
    docked && (busy || status !== 'Idle' || statusDetail != null || parseError != null);

  return (
    <div
      className={cn(
        'flex w-full flex-col justify-start',
        docked ? 'min-h-0 min-w-0 flex-1 gap-3' : 'gap-2'
      )}
    >
      {docked ? (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-border/40 pb-2.5">
            <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="sr-only">Assistant</span>
            <div className="flex min-w-0 shrink-0 items-center gap-1">
              <Label htmlFor={`${threadId}-model`} className="sr-only">
                Model
              </Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger id={`${threadId}-model`} className="h-7 w-[min(11.5rem,38vw)] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_MODEL_IDS.map((id) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {OPENAI_MODEL_PRICING_USD_PER_1M[id]?.label ?? id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className="min-w-0 flex-1 truncate text-right text-[9px] leading-none text-muted-foreground tabular-nums"
              title="Approximate from token counts; OpenAI bills actual usage."
            >
              {costHint}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setApiKeySectionOpen(true)}
              aria-label={hasApiKey ? 'Open API key settings' : 'Set API key'}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          {showApiKeyFields ? (
            <div className="flex shrink-0 flex-col gap-2 rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 dark:bg-muted/10">
              <div className="flex items-center gap-2">
                <Label htmlFor={`${threadId}-key`} className="sr-only">
                  OpenAI API key
                </Label>
                <input
                  id={`${threadId}-key`}
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={handleApiKeyBlur}
                  placeholder="OpenAI API key (sk-…)"
                  className={cn(inputClass, 'h-8 min-h-0 flex-1 py-1 font-mono text-xs')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={persistKeyAndCollapse}
                >
                  Save
                </Button>
                {hasApiKey ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => {
                      persistKey();
                      setApiKeySectionOpen(false);
                    }}
                  >
                    Done
                  </Button>
                ) : null}
              </div>
              <p className="text-[9px] leading-snug text-muted-foreground">
                Saved in this browser (local storage); sent only to OpenAI from your machine.
              </p>
            </div>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
            <div
              className="flex min-h-[7rem] min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-muted/10 p-2.5 dark:bg-muted/5 md:min-h-0"
              aria-busy={busy}
              aria-live="polite"
            >
              {messages.length === 0 && !streamingAssistant ? (
                <p className="mb-1.5 shrink-0 text-[10px] leading-snug text-muted-foreground">
                  Streams YAML into the editor; applies when complete. Stop cancels.
                </p>
              ) : null}
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-gutter:stable]">
                {threadUl}
              </div>
            </div>

            <div className="flex min-h-0 w-full min-w-0 shrink-0 flex-col gap-2 md:w-[min(42%,22rem)] md:border-l md:border-border/40 md:pl-4">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={onComposerKeyDown}
                disabled={composerInputDisabled}
                maxLength={MAX_USER_CHARS}
                rows={1}
                title="Won’t change dates or holidays unless you ask."
                placeholder="Describe the change… ⌘↵ send"
                className={cn(
                  inputClass,
                  'min-h-[3.25rem] w-full min-w-0 flex-1 resize-none py-1.5 text-xs leading-snug md:min-h-[6rem]'
                )}
              />
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-[11px]"
                  disabled={sendDisabled}
                  onClick={() => void send()}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-[11px]"
                  disabled={!busy}
                  onClick={stop}
                >
                  <Square className="h-3 w-3" aria-hidden />
                  Stop
                </Button>
                {busy || status !== 'Idle' ? (
                  <span className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground/75">{status}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {showDockStatusStrip && (statusDetail || parseError) ? (
            <div className="shrink-0 border-t border-border/40 pt-2.5 text-[10px] leading-snug text-muted-foreground">
              {statusDetail ? <p className="m-0 text-destructive">{statusDetail}</p> : null}
              {parseError ? (
                <p className="m-0 text-amber-700 dark:text-amber-400">Editor parse: {parseError}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              DSL assistant
            </h3>
            <div className="flex flex-wrap items-center justify-end gap-0.5">
              {hasApiKey && !showApiKeyFields ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setApiKeySectionOpen(true)}
                >
                  API key
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                onClick={() => setSyntaxOpen(true)}
              >
                <BookOpen className="h-3 w-3" aria-hidden />
                Syntax reference
              </Button>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1.5 rounded-md border border-border/60 bg-background/30 p-1.5 dark:bg-background/15">
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-[7.5rem] flex-1 space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Model</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_MODEL_IDS.map((id) => (
                      <SelectItem key={id} value={id} className="text-xs">
                        {OPENAI_MODEL_PRICING_USD_PER_1M[id]?.label ?? id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div
                className="max-w-[11rem] text-right text-[10px] leading-tight text-muted-foreground"
                title="Approximate from token counts; OpenAI bills actual usage."
              >
                {costHint}
              </div>
            </div>

            {showApiKeyFields ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor={`${threadId}-key-panel`} className="text-[11px] text-muted-foreground">
                    API key
                  </Label>
                  <div className="flex gap-1.5">
                    <input
                      id={`${threadId}-key-panel`}
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onBlur={handleApiKeyBlur}
                      placeholder="sk-…"
                      className={cn(inputClass, 'font-mono text-xs')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 px-2"
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Stored in this browser&apos;s local storage until you clear site data or remove it here. Your key
                    never leaves your machine except to OpenAI. Static sites cannot hide secrets from the device owner
                    — BYOK risk is accepted.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    onClick={persistKeyAndCollapse}
                  >
                    Save key
                  </Button>
                  {hasApiKey ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-xs text-muted-foreground"
                      onClick={() => {
                        persistKey();
                        setApiKeySectionOpen(false);
                      }}
                    >
                      Done
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div
            className="max-h-[min(42vh,22rem)] min-h-[100px] shrink-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/50 bg-muted/10 px-2 py-2 dark:bg-muted/5"
            aria-busy={busy}
            aria-live="polite"
          >
            {messages.length === 0 && !streamingAssistant ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ask in plain language to edit the YAML in the main editor. You’ll preview changes before they apply.
              </p>
            ) : null}
            {threadUl}
          </div>

          <div className="shrink-0 space-y-1.5">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onComposerKeyDown}
              disabled={composerInputDisabled}
              rows={3}
              maxLength={MAX_USER_CHARS}
              placeholder="Describe the YAML change… (⌘↵ / Ctrl+↵ to send)"
              className={cn(inputClass, 'min-h-[4.5rem] resize-none py-2 font-sans')}
            />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Won’t change dates or holidays unless you ask. Won’t invent public holiday dates.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={sendDisabled}
                onClick={() => void send()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={!busy}
                onClick={stop}
              >
                <Square className="h-3 w-3" aria-hidden />
                Stop
              </Button>
            </div>
          </div>

          <div className="shrink-0 border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{status}</span>
            {statusDetail ? <span className="mt-0.5 block text-destructive">{statusDetail}</span> : null}
            {parseError ? (
              <span className="mt-0.5 block text-amber-700 dark:text-amber-400">Editor parse: {parseError}</span>
            ) : null}
          </div>
        </>
      )}

      {!docked ? (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-h-[min(90dvh,800px)] gap-0 overflow-hidden sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Review YAML change</DialogTitle>
              <DialogDescription>
                Compare the assistant proposal to your buffer from when you sent the message. Apply runs the same parse
                as the app; your previous editor content stays until you confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[55vh] min-h-0 grid-cols-1 gap-2 overflow-hidden sm:grid-cols-2">
              <div className="flex min-h-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">Current (snapshot)</span>
                <pre className="max-h-full overflow-auto rounded-md border border-border/60 bg-muted/20 p-2 font-mono text-[10px] leading-snug">
                  {previewBefore}
                </pre>
              </div>
              <div className="flex min-h-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">Proposed</span>
                <pre className="max-h-full overflow-auto rounded-md border border-border/60 bg-muted/20 p-2 font-mono text-[10px] leading-snug">
                  {previewAfter}
                </pre>
              </div>
            </div>
            {previewApplyError ? (
              <p className="text-sm text-destructive">{previewApplyError}</p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)}>
                Discard
              </Button>
              <Button type="button" onClick={confirmApply}>
                Apply to editor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={syntaxOpen} onOpenChange={setSyntaxOpen}>
        <DialogContent className="max-h-[min(85dvh,720px)] gap-0 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>DSL syntax reference</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto py-2">
            <DslSyntaxHelpBody />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSyntaxOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssistantBubble({ content, streaming }: { content: string; streaming?: boolean }) {
  const shown = assistantContentForDisplay(content);
  const machine = content.includes(DSL_EDIT_MARKER);
  const yamlStreaming = Boolean(streaming && assistantHasYamlStreamMarker(content));
  return (
    <div className="mt-0.5 space-y-1">
      {shown ? (
        <div className="whitespace-pre-wrap text-foreground/90">
          {shown}
          {streaming ? <span className="inline-block h-3 w-1 animate-pulse bg-primary/60 align-middle" /> : null}
        </div>
      ) : streaming ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
          <span>Receiving…</span>
        </div>
      ) : null}
      {yamlStreaming ? (
        <p className="rounded border border-primary/25 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary">
          Streaming YAML into the editor…
        </p>
      ) : null}
      {machine && !streaming ? (
        <details className="rounded-md border border-border/50 bg-muted/15 px-2 py-1 text-[10px] text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground/70">Structured edit (JSON)</summary>
          <pre className="mt-1 max-h-32 overflow-auto font-mono text-[9px]">{content.slice(content.indexOf(DSL_EDIT_MARKER))}</pre>
        </details>
      ) : null}
    </div>
  );
}
