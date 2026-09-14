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

export type NodalProjectionKind = string;
export type NodalPresentationRegistryState = 'created' | 'active' | 'inactive' | 'disposed';

export interface NodalPresentationContribution {
  id: string;
  version: string;
  dialectId: string;
  projectionKind: NodalProjectionKind;
  presentation: NodalDialectPresentation;
}

export interface NodalPresentationRegistration {
  readonly contributionId: string;
  dispose(): void;
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

export class NodalPresentationRegistry {
  private readonly contributionsById = new Map<string, NodalPresentationContribution>();
  private readonly contributionIdsByTarget = new Map<string, string>();
  private lifecycleState: NodalPresentationRegistryState = 'created';

  get state(): NodalPresentationRegistryState {
    return this.lifecycleState;
  }

  register(contribution: NodalPresentationContribution): NodalPresentationRegistration {
    this.assertUsable();
    assertIdentifier(contribution.id, 'Nodal presentation contribution');
    assertIdentifier(contribution.version, 'Nodal presentation contribution version');
    assertIdentifier(contribution.dialectId, 'Nodal presentation dialect');
    assertIdentifier(contribution.projectionKind, 'Nodal projection kind');

    if (this.contributionsById.has(contribution.id)) {
      throw new Error(`Duplicate Nodal presentation contribution id: ${contribution.id}`);
    }

    const targetKey = createTargetKey(contribution.dialectId, contribution.projectionKind);
    if (this.contributionIdsByTarget.has(targetKey)) {
      throw new Error(
        `Duplicate Nodal presentation target: ${contribution.projectionKind}/${contribution.dialectId}`
      );
    }

    const registered = cloneContribution(contribution);
    this.contributionsById.set(registered.id, registered);
    this.contributionIdsByTarget.set(targetKey, registered.id);
    let disposed = false;

    return {
      contributionId: registered.id,
      dispose: () => {
        if (disposed || this.lifecycleState === 'disposed') return;
        disposed = true;
        this.contributionsById.delete(registered.id);
        this.contributionIdsByTarget.delete(targetKey);
      }
    };
  }

  activate(): void {
    this.assertUsable();
    this.lifecycleState = 'active';
  }

  deactivate(): void {
    this.assertUsable();
    this.lifecycleState = 'inactive';
  }

  resolve(
    dialectId: string | null | undefined,
    projectionKind: NodalProjectionKind = 'nodal'
  ): NodalDialectPresentation {
    if (this.lifecycleState !== 'active' || !dialectId) {
      return clonePresentation(defaultPresentation);
    }

    const contributionId = this.contributionIdsByTarget.get(createTargetKey(dialectId, projectionKind));
    const contribution = contributionId ? this.contributionsById.get(contributionId) : undefined;
    return mergePresentation(defaultPresentation, contribution?.presentation);
  }

  list(): NodalPresentationContribution[] {
    this.assertUsable();
    return [...this.contributionsById.values()].map(cloneContribution);
  }

  dispose(): void {
    if (this.lifecycleState === 'disposed') return;
    this.contributionsById.clear();
    this.contributionIdsByTarget.clear();
    this.lifecycleState = 'disposed';
  }

  private assertUsable(): void {
    if (this.lifecycleState === 'disposed') {
      throw new Error('Nodal presentation registry is disposed.');
    }
  }
}

export function getNodalDialectPresentation(
  dialectId: string | null | undefined,
  registry?: NodalPresentationRegistry,
  projectionKind: NodalProjectionKind = 'nodal'
): NodalDialectPresentation {
  return registry
    ? registry.resolve(dialectId, projectionKind)
    : clonePresentation(defaultPresentation);
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

function cloneContribution(contribution: NodalPresentationContribution): NodalPresentationContribution {
  return {
    ...contribution,
    presentation: clonePresentation(contribution.presentation)
  };
}

function createTargetKey(dialectId: string, projectionKind: NodalProjectionKind): string {
  return `${projectionKind}\u0000${dialectId}`;
}

function assertIdentifier(value: string, subject: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${subject} id must be a non-empty string.`);
  }
}
