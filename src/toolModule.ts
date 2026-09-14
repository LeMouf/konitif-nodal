import { defineKonitifToolModule } from '@konitif/tools';

export const nodalToolModule = defineKonitifToolModule({
  id: 'konitif.nodal',
  name: 'KONITIF Nodal',
  capability: 'graph-authoring',
  description: 'Product-neutral graph authoring, validation and deterministic execution.'
});
