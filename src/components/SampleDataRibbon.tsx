/**
 * Fixed corner ribbon — indicates the app is running on sample / demo market data.
 */
export function SampleDataRibbon() {
  return (
    <aside
      className="pointer-events-none fixed right-0 top-0 z-[100] h-[4.75rem] w-[4.75rem] overflow-hidden sm:h-[5.25rem] sm:w-[5.25rem]"
      aria-label="Sample data"
    >
      <div
        className="absolute right-[-38%] top-5 flex w-[145%] justify-center border-y border-white/20 bg-amber-600 py-1 text-[0.5625rem] font-semibold uppercase tracking-[0.18em] text-white shadow-sm rotate-45 select-none sm:top-6 sm:text-[0.625rem] dark:bg-amber-700 dark:text-amber-50"
        role="presentation"
      >
        Sample Data
      </div>
    </aside>
  );
}
