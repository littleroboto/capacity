import { useCallback, useEffect, useState } from 'react';
import type { ViewModeId } from '@/lib/constants';
import { HeatmapSettingsPanel } from '@/components/HeatmapSettingsPanel';
import { ProgrammePlanDisplaySettingsForm } from '@/components/ProgrammePlanDisplaySettingsForm';
import { RunwayHeatmapCellStyleFields } from '@/components/RunwayHeatmapCellStyleFields';
import {
  loadProgrammeGanttPrefs,
  notifyProgrammeGanttPrefsChanged,
  RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS,
  saveProgrammeGanttPrefs,
  type ProgrammeGanttDisplayPrefs,
} from '@/lib/runwayProgrammeGanttPrefs';

function ProgrammePlanSettingsSection({ settingsDialogOpen }: { settingsDialogOpen: boolean }) {
  const [prefs, setPrefs] = useState<ProgrammeGanttDisplayPrefs>(() => loadProgrammeGanttPrefs());

  useEffect(() => {
    if (settingsDialogOpen) {
      setPrefs(loadProgrammeGanttPrefs());
    }
  }, [settingsDialogOpen]);

  const setPref = useCallback(<K extends keyof ProgrammeGanttDisplayPrefs>(key: K, value: ProgrammeGanttDisplayPrefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      saveProgrammeGanttPrefs(next);
      notifyProgrammeGanttPrefsChanged();
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    const next = { ...RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS };
    setPrefs(next);
    saveProgrammeGanttPrefs(next);
    notifyProgrammeGanttPrefsChanged();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Programme plan</h3>
        <button
          type="button"
          onClick={resetPrefs}
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Reset programme display
        </button>
      </div>
      <ProgrammePlanDisplaySettingsForm prefs={prefs} setPref={setPref} />
    </div>
  );
}

type WorkbenchSettingsContentProps = {
  viewMode: ViewModeId;
  /** When the dialog opens or is shown again, programme prefs reload from `localStorage`. */
  settingsDialogOpen: boolean;
};

/**
 * Single workbench Settings modal body: runway cells, programme plan strip, then heatmap tuning / palette.
 */
export function WorkbenchSettingsContent({ viewMode, settingsDialogOpen }: WorkbenchSettingsContentProps) {
  return (
    <div className="space-y-10">
      <RunwayHeatmapCellStyleFields />
      <ProgrammePlanSettingsSection settingsDialogOpen={settingsDialogOpen} />
      <div className="space-y-3 border-t border-border/60 pt-8">
        <h3 className="text-sm font-semibold text-foreground">Heatmap tuning &amp; palette</h3>
        <HeatmapSettingsPanel
          showCampaignBoost={viewMode !== 'combined'}
          showHeatmapTransferTuning={viewMode !== 'code'}
        />
      </div>
    </div>
  );
}
