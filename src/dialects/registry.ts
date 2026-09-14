import type { NodalGraphDocument, NodalValidationIssue, NodalValidationResult } from '../types/model.js';
import type {
  NodalDialect,
  NodalDialectAdmission,
  NodalDialectExecution,
  NodalDialectRuntime,
  NodalDialectSchema,
  NodalNodeExecutionBinding,
  NodalNodeSchemaDefinition
} from '../types/registry.js';

export type NodalDialectRegistryState = 'created' | 'active' | 'inactive' | 'disposed';

export interface NodalDialectSchemaContribution {
  id: string;
  version: string;
  dialectId: string;
  title?: string;
  nodeDefinitions: NodalNodeSchemaDefinition[];
}

export interface NodalDialectAdmissionContribution {
  id: string;
  version: string;
  dialectId: string;
  validate: (graph: NodalGraphDocument) => NodalValidationResult;
}

export interface NodalDialectExecutionContribution {
  id: string;
  version: string;
  dialectId: string;
  bindings: NodalNodeExecutionBinding[];
}

export interface NodalDialectContributionSet {
  schema: NodalDialectSchemaContribution;
  admission: NodalDialectAdmissionContribution | null;
  execution: NodalDialectExecutionContribution;
}

export interface NodalDialectRegistration {
  readonly contributionId: string;
  readonly kind: 'schema' | 'admission' | 'execution';
  dispose(): void;
}

type StoredContribution =
  | { kind: 'schema'; value: NodalDialectSchemaContribution }
  | { kind: 'admission'; value: NodalDialectAdmissionContribution }
  | { kind: 'execution'; value: NodalDialectExecutionContribution };

export class NodalDialectRegistry {
  private readonly contributionsById = new Map<string, StoredContribution>();
  private readonly schemaTargets = new Map<string, string>();
  private readonly executionTargets = new Map<string, string>();
  private lifecycleState: NodalDialectRegistryState = 'created';

  get state(): NodalDialectRegistryState {
    return this.lifecycleState;
  }

  registerSchema(contribution: NodalDialectSchemaContribution): NodalDialectRegistration {
    this.assertContribution(contribution);
    const nodeTypes = new Set<string>();
    for (const definition of contribution.nodeDefinitions) {
      assertIdentifier(definition.type, 'Nodal node type');
      if (nodeTypes.has(definition.type)) {
        throw new Error(`Duplicate Nodal schema node type in contribution ${contribution.id}: ${definition.type}`);
      }
      nodeTypes.add(definition.type);
      this.assertTargetAvailable(this.schemaTargets, contribution.dialectId, definition.type, 'schema');
    }

    const registered = cloneSchemaContribution(contribution);
    this.contributionsById.set(registered.id, { kind: 'schema', value: registered });
    for (const definition of registered.nodeDefinitions) {
      this.schemaTargets.set(createTargetKey(registered.dialectId, definition.type), registered.id);
    }
    return this.createRegistration('schema', registered.id);
  }

  registerAdmission(contribution: NodalDialectAdmissionContribution): NodalDialectRegistration {
    this.assertContribution(contribution);
    if (typeof contribution.validate !== 'function') {
      throw new TypeError('Nodal admission contribution validate must be a function.');
    }
    const registered = { ...contribution };
    this.contributionsById.set(registered.id, { kind: 'admission', value: registered });
    return this.createRegistration('admission', registered.id);
  }

  registerExecution(contribution: NodalDialectExecutionContribution): NodalDialectRegistration {
    this.assertContribution(contribution);
    const nodeTypes = new Set<string>();
    for (const binding of contribution.bindings) {
      assertIdentifier(binding.nodeType, 'Nodal execution node type');
      if (typeof binding.execute !== 'function') {
        throw new TypeError(`Nodal executor must be a function: ${binding.nodeType}`);
      }
      if (nodeTypes.has(binding.nodeType)) {
        throw new Error(`Duplicate Nodal executor in contribution ${contribution.id}: ${binding.nodeType}`);
      }
      nodeTypes.add(binding.nodeType);
      this.assertTargetAvailable(this.executionTargets, contribution.dialectId, binding.nodeType, 'executor');
    }

    const registered = cloneExecutionContribution(contribution);
    this.contributionsById.set(registered.id, { kind: 'execution', value: registered });
    for (const binding of registered.bindings) {
      this.executionTargets.set(createTargetKey(registered.dialectId, binding.nodeType), registered.id);
    }
    return this.createRegistration('execution', registered.id);
  }

  activate(): void {
    this.assertUsable();
    this.lifecycleState = 'active';
  }

  deactivate(): void {
    this.assertUsable();
    this.lifecycleState = 'inactive';
  }

  resolve(dialectId: string): NodalDialectRuntime | null {
    this.assertUsable();
    if (this.lifecycleState !== 'active') return null;

    const stored = [...this.contributionsById.values()];
    const schemaContributions = stored
      .filter((entry): entry is Extract<StoredContribution, { kind: 'schema' }> => entry.kind === 'schema')
      .map((entry) => entry.value)
      .filter((contribution) => contribution.dialectId === dialectId);
    if (schemaContributions.length === 0) return null;

    const admissionContributions = stored
      .filter((entry): entry is Extract<StoredContribution, { kind: 'admission' }> => entry.kind === 'admission')
      .map((entry) => entry.value)
      .filter((contribution) => contribution.dialectId === dialectId);
    const executionContributions = stored
      .filter((entry): entry is Extract<StoredContribution, { kind: 'execution' }> => entry.kind === 'execution')
      .map((entry) => entry.value)
      .filter((contribution) => contribution.dialectId === dialectId);

    return {
      schema: {
        id: dialectId,
        title: schemaContributions.find((contribution) => contribution.title?.trim())?.title?.trim() ?? dialectId,
        nodeRegistry: schemaContributions.flatMap((contribution) => contribution.nodeDefinitions.map(cloneNodeSchema))
      },
      admission: createResolvedAdmission(dialectId, admissionContributions),
      execution: {
        dialectId,
        bindings: executionContributions.flatMap((contribution) => contribution.bindings.map((binding) => ({ ...binding })))
      }
    };
  }

  list(): StoredContribution[] {
    this.assertUsable();
    return [...this.contributionsById.values()].map(cloneStoredContribution);
  }

  dispose(): void {
    if (this.lifecycleState === 'disposed') return;
    this.contributionsById.clear();
    this.schemaTargets.clear();
    this.executionTargets.clear();
    this.lifecycleState = 'disposed';
  }

  private assertContribution(contribution: { id: string; version: string; dialectId: string }): void {
    this.assertUsable();
    assertIdentifier(contribution.id, 'Nodal dialect contribution');
    assertIdentifier(contribution.version, 'Nodal dialect contribution version');
    assertIdentifier(contribution.dialectId, 'Nodal dialect');
    if (this.contributionsById.has(contribution.id)) {
      throw new Error(`Duplicate Nodal dialect contribution id: ${contribution.id}`);
    }
  }

  private assertTargetAvailable(
    targets: Map<string, string>,
    dialectId: string,
    nodeType: string,
    subject: string
  ): void {
    if (targets.has(createTargetKey(dialectId, nodeType))) {
      throw new Error(`Duplicate Nodal ${subject} target: ${dialectId}/${nodeType}`);
    }
  }

  private createRegistration(
    kind: NodalDialectRegistration['kind'],
    contributionId: string
  ): NodalDialectRegistration {
    let disposed = false;
    return {
      contributionId,
      kind,
      dispose: () => {
        if (disposed || this.lifecycleState === 'disposed') return;
        disposed = true;
        const stored = this.contributionsById.get(contributionId);
        this.contributionsById.delete(contributionId);
        if (stored?.kind === 'schema') {
          for (const definition of stored.value.nodeDefinitions) {
            this.schemaTargets.delete(createTargetKey(stored.value.dialectId, definition.type));
          }
        }
        if (stored?.kind === 'execution') {
          for (const binding of stored.value.bindings) {
            this.executionTargets.delete(createTargetKey(stored.value.dialectId, binding.nodeType));
          }
        }
      }
    };
  }

  private assertUsable(): void {
    if (this.lifecycleState === 'disposed') {
      throw new Error('Nodal dialect registry is disposed.');
    }
  }
}

export function splitNodalDialect(
  dialect: NodalDialect,
  input: { contributionId?: string; version?: string } = {}
): NodalDialectContributionSet {
  const contributionId = input.contributionId?.trim() || dialect.id;
  const version = input.version?.trim() || '1.0.0';
  const nodeDefinitions = dialect.nodeRegistry.map(({ execute: _execute, ...definition }) => cloneNodeSchema(definition));
  const bindings = dialect.nodeRegistry.flatMap((definition) => definition.execute
    ? [{ nodeType: definition.type, execute: definition.execute }]
    : []);

  return {
    schema: {
      id: `${contributionId}.schema`,
      version,
      dialectId: dialect.id,
      title: dialect.title,
      nodeDefinitions
    },
    admission: dialect.validate
      ? {
          id: `${contributionId}.admission`,
          version,
          dialectId: dialect.id,
          validate: dialect.validate
        }
      : null,
    execution: {
      id: `${contributionId}.execution`,
      version,
      dialectId: dialect.id,
      bindings
    }
  };
}

export function registerNodalDialectContributions(
  registry: NodalDialectRegistry,
  contributions: NodalDialectContributionSet
): NodalDialectRegistration[] {
  return [
    registry.registerSchema(contributions.schema),
    ...(contributions.admission ? [registry.registerAdmission(contributions.admission)] : []),
    registry.registerExecution(contributions.execution)
  ];
}

export function composeNodalDialect(runtime: NodalDialectRuntime): NodalDialect {
  const executorsByNodeType = new Map(runtime.execution.bindings.map((binding) => [binding.nodeType, binding.execute]));
  return {
    id: runtime.schema.id,
    title: runtime.schema.title,
    nodeRegistry: runtime.schema.nodeRegistry.map((definition) => ({
      ...cloneNodeSchema(definition),
      execute: executorsByNodeType.get(definition.type)
    })),
    ...(runtime.admission ? { validate: runtime.admission.validate } : {})
  };
}

function createResolvedAdmission(
  dialectId: string,
  contributions: NodalDialectAdmissionContribution[]
): NodalDialectAdmission | null {
  if (contributions.length === 0) return null;
  return {
    dialectId,
    validate(graph) {
      const issues: NodalValidationIssue[] = contributions.flatMap((contribution) => contribution.validate(graph).issues);
      return {
        valid: issues.every((issue) => issue.severity !== 'error'),
        issues
      };
    }
  };
}

function cloneSchemaContribution(contribution: NodalDialectSchemaContribution): NodalDialectSchemaContribution {
  return {
    ...contribution,
    nodeDefinitions: contribution.nodeDefinitions.map(cloneNodeSchema)
  };
}

function cloneExecutionContribution(
  contribution: NodalDialectExecutionContribution
): NodalDialectExecutionContribution {
  return {
    ...contribution,
    bindings: contribution.bindings.map((binding) => ({ ...binding }))
  };
}

function cloneNodeSchema(definition: NodalNodeSchemaDefinition): NodalNodeSchemaDefinition {
  return {
    ...definition,
    inputs: definition.inputs.map((port) => ({ ...port })),
    outputs: definition.outputs.map((port) => ({ ...port })),
    defaultConfig: structuredClone(definition.defaultConfig)
  };
}

function cloneStoredContribution(contribution: StoredContribution): StoredContribution {
  if (contribution.kind === 'schema') {
    return { kind: 'schema', value: cloneSchemaContribution(contribution.value) };
  }
  if (contribution.kind === 'execution') {
    return { kind: 'execution', value: cloneExecutionContribution(contribution.value) };
  }
  return { kind: 'admission', value: { ...contribution.value } };
}

function createTargetKey(dialectId: string, nodeType: string): string {
  return `${dialectId}\u0000${nodeType}`;
}

function assertIdentifier(value: string, subject: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${subject} id must be a non-empty string.`);
  }
}
