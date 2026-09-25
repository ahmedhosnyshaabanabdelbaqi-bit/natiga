import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENCY_RELATIONS, MARKET_RELATIONS } from './markets.service';

/** List relations (`name Model[]`) of a model in the multi-file Prisma schema. */
function listRelationsOf(model: string): string[] {
  const dir = join(__dirname, '../../../prisma/schema');
  const schema = readdirSync(dir)
    .filter((f) => f.endsWith('.prisma'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
  const block = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? '';
  return [...block.matchAll(/^\s+(\w+)\s+\w+\[\]/gm)].map((m) => m[1]).sort();
}

describe('market / currency deletion guards', () => {
  // A relation missing from these lists would let a delete cascade or null
  // data silently instead of answering 409 *_IN_USE.
  it('MARKET_RELATIONS lists every relation of Market', () => {
    expect([...MARKET_RELATIONS].sort()).toEqual(listRelationsOf('Market'));
  });

  it('CURRENCY_RELATIONS lists every relation of Currency', () => {
    expect([...CURRENCY_RELATIONS].sort()).toEqual(listRelationsOf('Currency'));
  });
});
