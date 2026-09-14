export type NodalDialectNodeFamily = 'source' | 'compute' | 'output';

export interface NodalPresentationAccent {
  color: string;
  rgb: string;
}

export interface NodalDialectPresentation {
  families: Record<NodalDialectNodeFamily, NodalPresentationAccent>;
  familyLabels?: Partial<Record<NodalDialectNodeFamily, string>>;
  nodeTypeAccents?: Record<string, NodalPresentationAccent>;
}

const defaultPresentation: NodalDialectPresentation = {
  families: {
    source: { color: '#86b9ff', rgb: '134, 185, 255' },
    compute: { color: '#ffd56a', rgb: '255, 213, 106' },
    output: { color: '#7de0b0', rgb: '125, 224, 176' }
  },
  familyLabels: { source: 'Source', compute: 'Compute', output: 'Output' },
  nodeTypeAccents: { 'math:multiply': { color: '#f09a57', rgb: '240, 154, 87' } }
};

const presentations = new Map<string, NodalDialectPresentation>();

export function registerNodalDialectPresentation(
  dialectId: string,
  presentation: NodalDialectPresentation
): void {
  presentations.set(dialectId, clonePresentation(presentation));
}

export function getNodalDialectPresentation(
  dialectId: string | null | undefined
): NodalDialectPresentation {
  const presentation = dialectId ? presentations.get(dialectId) : undefined;
  return mergePresentation(defaultPresentation, presentation);
}

function mergePresentation(
  fallback: NodalDialectPresentation,
  presentation: NodalDialectPresentation | undefined
): NodalDialectPresentation {
  return {
    families: { ...fallback.families, ...presentation?.families },
    familyLabels: { ...fallback.familyLabels, ...presentation?.familyLabels },
    nodeTypeAccents: { ...fallback.nodeTypeAccents, ...presentation?.nodeTypeAccents }
  };
}

function clonePresentation(presentation: NodalDialectPresentation): NodalDialectPresentation {
  return {
    families: { ...presentation.families },
    familyLabels: { ...presentation.familyLabels },
    nodeTypeAccents: { ...presentation.nodeTypeAccents }
  };
}
