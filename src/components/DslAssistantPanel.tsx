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
  DSL_EDIT_MARKER,
  parseDslEditPayload,
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
import { BookOpen, Loader2, Send, Square, Eye, EyeOff } from 'lucide-react';

const SESSION_KEY = 'cpm_openai_api_key';
const MAX_USER_CHARS = 8000;

function readStoredApiKey(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? '';
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

export function DslAssistantPanel() {
  const threadId = useId();
  const dslText = useAtcStore((s) => s.dslText);
  const parseError = useAtcStore((s) => s.parseError);

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

  const abortRef = useRef<AbortController | null>(null);
  const dslSnapshotRef = useRef('');
  const lastFailureAt = useRef(0);
  const systemPromptRef = useRef<string | null>(null);

  const persistKey = useCallback(() => {
    try {
      if (apiKey.trim()) sessionStorage.setItem(SESSION_KEY, apiKey.trim());
      else sessionStorage.removeItem(SESSION_KEY);
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
      const tail = history.slice(-8);
      const out: OpenAIChatMessage[] = [{ role: 'system', content: sys }];
      for (const m of tail) {
        out.push({ role: m.role, content: m.content });
      }
      out.push({ role: 'user', content: nextUserContent });
      return out;
    },
    []
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === 'Calling model…' || s === 'Receiving…' ? 'Idle' : s));
    setStreamingAssistant('');
  }, []);

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

  const handleStructuredResult = useCallback(
    (assistantRaw: string, snapshot: string) => {
      const payload = parseDslEditPayload(assistantRaw);
      if (!payload) {
        setStatus('Idle');
        setStatusDetail('No structured edit in the reply (missing ' + DSL_EDIT_MARKER + ').');
        return;
      }
      let proposed: string;
      if (payload.kind === 'full_yaml') {
        proposed = payload.yaml;
      } else {
        const r = applyReplacePatches(snapshot, payload.patches);
        if (!r.ok) {
          setStatus('Idle');
          setStatusDetail(r.error);
          return;
        }
        proposed = r.text;
      }
      openPreview(snapshot, proposed);
    },
    [openPreview]
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
    setMessages((m) => [...m, userMsg]);
    setComposer('');
    setStreamingAssistant('');
    setStatus('Calling model…');
    setStatusDetail(null);

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = '';
    const usageHolder: { last?: { prompt_tokens: number; completion_tokens: number } } = {};

    try {
      setStatus('Receiving…');
      await streamOpenAIChatCompletion({
        apiKey: apiKey.trim(),
        model: modelId,
        messages: buildMessagesForApi(messages, userContent),
        signal: ac.signal,
        onDelta: (d) => {
          acc += d;
          setStreamingAssistant(acc);
        },
        onUsage: (u) => {
          usageHolder.last = u;
        },
      });

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

      handleStructuredResult(acc, dslSnapshotRef.current);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setStatus('Idle');
        return;
      }
      lastFailureAt.current = Date.now();
      setStatus('Idle');
      setStatusDetail((e as Error).message || String(e));
    } finally {
      abortRef.current = null;
    }
  }, [
    apiKey,
    buildMessagesForApi,
    composer,
    dslText,
    handleStructuredResult,
    messages,
    modelId,
    persistKey,
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

  return (
    <div className="flex w-full flex-col justify-start gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DSL assistant</h3>
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

      <div className="flex shrink-0 flex-col gap-2 rounded-md border border-border/60 bg-background/30 p-2 dark:bg-background/15">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[8rem] flex-1 space-y-1">
            <Label className="text-[11px] text-muted-foreground">Model</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger className="h-8 text-xs">
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
          <div className="text-[11px] leading-tight text-muted-foreground">
            {lastMessageUsd != null ? (
              <span>
                Last: ~${lastMessageUsd.toFixed(4)} · Session: ~${sessionUsd.toFixed(2)}
              </span>
            ) : (
              <span>Session: ~${sessionUsd.toFixed(2)}</span>
            )}
            <br />
            <span className="text-[10px] opacity-80">Approximate; actual billing per OpenAI.</span>
          </div>
        </div>

        {showApiKeyFields ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${threadId}-key`} className="text-[11px] text-muted-foreground">
                API key (session only)
              </Label>
              <div className="flex gap-1.5">
                <input
                  id={`${threadId}-key`}
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
                Stored in this browser tab session only (not on disk by default). Your key never leaves your machine
                except to OpenAI. Static sites cannot hide secrets from the device owner — BYOK risk is accepted.
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
                Save key to session
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
        className="min-h-[100px] max-h-[min(42vh,22rem)] shrink-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/50 bg-muted/10 px-2 py-2 dark:bg-muted/5"
        aria-busy={busy}
        aria-live="polite"
      >
        {messages.length === 0 && !streamingAssistant ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ask in plain language to edit the YAML in the main editor. You’ll preview changes before they apply.
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[min(90dvh,800px)] gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review YAML change</DialogTitle>
            <DialogDescription>
              Compare the assistant proposal to your buffer from when you sent the message. Apply runs the same parse as
              the app; your previous editor content stays until you confirm.
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
      {machine && !streaming ? (
        <details className="rounded-md border border-border/50 bg-muted/15 px-2 py-1 text-[10px] text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground/70">Structured edit (JSON)</summary>
          <pre className="mt-1 max-h-32 overflow-auto font-mono text-[9px]">{content.slice(content.indexOf(DSL_EDIT_MARKER))}</pre>
        </details>
      ) : null}
    </div>
  );
}
