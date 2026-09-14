import { validateGraphDocument } from '../core/validation.js';
import { executeScalarAdd, executeScalarConstantNumber, executeScalarMultiply } from '../runtime/scalarMathExecutors.js';
import type { NodalDialect } from '../types/registry.js';

function normalizeNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const mathDialect: NodalDialect = {
  id: 'math',
  title: 'Math Dataflow',
  nodeRegistry: [
    {
      type: 'constant:number',
      title: 'Constant',
      description: 'Emit a numeric value.',
      inputs: [],
      outputs: [
        {
          id: 'value',
          label: 'Value',
          dataType: 'number',
          mode: 'value'
        }
      ],
      defaultConfig: {
        value: 1
      },
      execute({ node }) {
        return executeScalarConstantNumber({
          nodeId: node.id,
          config: node.config,
          resolvedInputs: {}
        });
      }
    },
    {
      type: 'math:add',
      title: 'Add',
      description: 'Add two numbers.',
      inputs: [
        { id: 'a', label: 'A', dataType: 'number', mode: 'value' },
        { id: 'b', label: 'B', dataType: 'number', mode: 'value' }
      ],
      outputs: [
        { id: 'result', label: 'Result', dataType: 'number', mode: 'value' }
      ],
      defaultConfig: {},
      execute({ node, resolvedInputs }) {
        return executeScalarAdd({
          nodeId: node.id,
          config: node.config,
          resolvedInputs
        });
      }
    },
    {
      type: 'math:multiply',
      title: 'Multiply',
      description: 'Multiply two numbers.',
      inputs: [
        { id: 'a', label: 'A', dataType: 'number', mode: 'value' },
        { id: 'b', label: 'B', dataType: 'number', mode: 'value' }
      ],
      outputs: [
        { id: 'result', label: 'Result', dataType: 'number', mode: 'value' }
      ],
      defaultConfig: {},
      execute({ node, resolvedInputs }) {
        return executeScalarMultiply({
          nodeId: node.id,
          config: node.config,
          resolvedInputs
        });
      }
    },
    {
      type: 'graph:output',
      title: 'Output',
      description: 'Expose the final graph value.',
      inputs: [
        { id: 'value', label: 'Value', dataType: 'number', mode: 'value' }
      ],
      outputs: [],
      defaultConfig: {},
      execute({ resolvedInputs }) {
        return {
          outputs: {
            value: normalizeNumber(resolvedInputs.value)
          }
        };
      }
    }
  ],
  validate(graph) {
    return validateGraphDocument(graph);
  }
};
