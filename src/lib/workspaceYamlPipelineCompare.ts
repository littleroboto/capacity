/** Normalize multi-doc workspace YAML for comparing editor state to last successful pipeline input. */
export function normalizeWorkspaceYamlForPipelineCompare(y: string): string {
  return y.replace(/\r\n/g, '\n').trimEnd();
}
