import { lazy, Suspense } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const LandingMonacoYamlDemo = lazy(() => import('./LandingMonacoYamlDemo'));

function EditorFallback() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-violet-500/20 bg-[#0f0f14]">
      <div className="h-10 animate-pulse border-b border-violet-500/15 bg-[#1a1428]/80" />
      <div className="h-9 animate-pulse border-b border-violet-500/15 bg-[#12101c]/90" />
      <div
        className="animate-pulse bg-[#0f0f14]/80"
        style={{ height: 'min(52vh, 440px)', minHeight: 280 }}
      />
      <div className="h-8 animate-pulse border-t border-violet-500/15 bg-black/30" />
      <div className="h-20 animate-pulse border-t border-violet-500/15 bg-[#0c0c10]" />
    </div>
  );
}

export function LandingMonacoYamlMock() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.section
      className="relative mx-auto w-full max-w-6xl"
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="monaco-mock-heading"
    >
      <div className="mb-6 max-w-2xl">
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400/90">
          Configuration as code
        </p>
        <h2 id="monaco-mock-heading" className="font-landing text-2xl font-semibold text-white">
          Data driven
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          The same Monaco surface as the workbench — Capacity syntax theme, folding, minimap, and multi-market
          tabs — with live sample data for Australia.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#111114] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-400">capacity</span>
            <span className="text-zinc-600">.app</span>
            <span className="text-violet-400/85"> / dsl</span>
          </div>
        </div>
        <div className="relative z-0 min-h-0 p-2 sm:p-3">
          <Suspense fallback={<EditorFallback />}>
            <LandingMonacoYamlDemo />
          </Suspense>
        </div>
      </div>
    </motion.section>
  );
}
