import type { NodalDialect } from '../types/registry.js';
import type { NodalGraphPort } from '../types/model.js';

export type NodalPortSuggestionCandidate = {
  nodeType: string;
  title: string;
  portId: string;
  portDirection: 'input' | 'output';
};

export function resolveCompatibleNodeSuggestions(
  draftPort: NodalGraphPort,
  dialect: Pick<NodalDialect, 'nodeRegistry'>
): NodalPortSuggestionCandidate[] {
  const candidatePortDirection: NodalPortSuggestionCandidate['portDirection'] =
    draftPort.direction === 'output' ? 'input' : 'output';

  return dialect.nodeRegistry
    .flatMap((definition) =>
      (draftPort.direction === 'output' ? definition.inputs : definition.outputs)
        .filter((port) => port.dataType === draftPort.dataType && port.mode === draftPort.mode)
        .map((port) => ({
          nodeType: definition.type,
          title: definition.title,
          portId: port.id,
          portDirection: candidatePortDirection
        }))
    )
    .filter((candidate, index, allCandidates) => {
      return (
        allCandidates.findIndex(
          (entry) =>
            entry.nodeType === candidate.nodeType &&
            entry.portId === candidate.portId &&
            entry.portDirection === candidate.portDirection
        ) === index
      );
    });
}
