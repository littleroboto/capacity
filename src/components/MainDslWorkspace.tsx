import { useState } from 'react';
import { DslEditorCore, DslSyntaxHelpBody } from '@/components/DslEditorCore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Full-width YAML editor in the main column; apply runs when leaving Code view mode. */
export function MainDslWorkspace() {
  const [syntaxOpen, setSyntaxOpen] = useState(false);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <DslEditorCore
        className="min-h-0 flex-1"
        initialFontSize={16}
        showApplyButton={false}
        editorChrome="studio"
        onSyntaxReference={() => setSyntaxOpen(true)}
      />

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
