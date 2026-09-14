export interface ScalarExecutorContext {
  moduleId?: string;
  nodeId?: string;
  config: Record<string, unknown>;
  resolvedInputs: Record<string, unknown>;
}

export interface ScalarNumberResult {
  outputs: {
    value: number;
  };
}

export interface ScalarBinaryResult {
  outputs: {
    result: number;
  };
}

function normalizeNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function executeScalarConstantNumber(context: ScalarExecutorContext): ScalarNumberResult {
  return {
    outputs: {
      value: normalizeNumber(context.config.value)
    }
  };
}

export function executeScalarAdd(context: ScalarExecutorContext): ScalarBinaryResult {
  return {
    outputs: {
      result: normalizeNumber(context.resolvedInputs.a) + normalizeNumber(context.resolvedInputs.b)
    }
  };
}

export function executeScalarMultiply(context: ScalarExecutorContext): ScalarBinaryResult {
  return {
    outputs: {
      result: normalizeNumber(context.resolvedInputs.a) * normalizeNumber(context.resolvedInputs.b)
    }
  };
}
