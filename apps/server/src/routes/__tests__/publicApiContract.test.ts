/**
 * Public API contract baseline
 *
 * Reduces both OpenAPI documents to what a client depends on (operations,
 * parameters, request body and the dereferenced 200 response shape) and
 * checks every operation in the committed baseline is still there unchanged.
 * Additions are allowed: a new operation, a new optional parameter, a new
 * response property. Tags are compared for v1 only, since the first tag is
 * what a generated SDK names its class after and v2's grouping is deliberate.
 *
 * Regenerate the baseline only for a deliberate change, by running this file
 * with UPDATE_PUBLIC_API_CONTRACT=1 set, and read the fixture diff.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../public.openapi.js';
import { generateOpenAPIDocumentV2 } from '../publicV2.openapi.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'publicApiContract.json');

type Json = Record<string, unknown>;

const SHAPE_KEYS = [
  'type',
  'format',
  'nullable',
  'enum',
  'properties',
  'required',
  'items',
  'oneOf',
  'anyOf',
  'allOf',
  'additionalProperties',
  'minimum',
  'maximum',
  'default',
] as const;

interface Operation {
  tags: string[];
  parameters: Record<string, { required: boolean; schema: unknown }>;
  request: unknown;
  response: unknown;
}

type Contract = Record<string, Operation>;

function reduceSchema(node: unknown, components: Json, seen: string[]): unknown {
  if (typeof node !== 'object' || node === null) return node;
  const obj = node as Json;
  if (typeof obj.$ref === 'string') {
    const name = obj.$ref.replace('#/components/schemas/', '');
    if (seen.includes(name)) return { $ref: name };
    return reduceSchema(components[name], components, [...seen, name]);
  }
  const out: Json = {};
  for (const key of SHAPE_KEYS) {
    if (!(key in obj)) continue;
    const value = obj[key];
    if (key === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(value as Json).map(([name, s]) => [name, reduceSchema(s, components, seen)])
      );
    } else if (key === 'items' || key === 'additionalProperties') {
      out[key] = typeof value === 'object' ? reduceSchema(value, components, seen) : value;
    } else if (key === 'oneOf' || key === 'anyOf' || key === 'allOf') {
      out[key] = (value as unknown[]).map((s) => reduceSchema(s, components, seen));
    } else if (key === 'required') {
      out.required = [...(value as string[])].sort();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function firstContentSchema(holder: Json | undefined, components: Json): unknown {
  const content = holder?.content as Json | undefined;
  const media = content ? (Object.values(content)[0] as Json | undefined) : undefined;
  return media ? reduceSchema(media.schema, components, []) : null;
}

function contractOf(spec: Json): Contract {
  const components = ((spec.components as Json | undefined)?.schemas ?? {}) as Json;
  const out: Contract = {};
  for (const [path, methods] of Object.entries(spec.paths as Json)) {
    for (const [method, op] of Object.entries(methods as Json)) {
      const o = op as Json;
      const parameters: Operation['parameters'] = {};
      for (const p of (o.parameters as Json[] | undefined) ?? []) {
        parameters[`${String(p.in)}:${String(p.name)}`] = {
          required: p.required === true,
          schema: reduceSchema(p.schema, components, []),
        };
      }
      out[`${method.toUpperCase()} ${path}`] = {
        tags: (o.tags as string[] | undefined) ?? [],
        parameters,
        request: firstContentSchema(o.requestBody as Json | undefined, components),
        response: firstContentSchema((o.responses as Json)['200'] as Json | undefined, components),
      };
    }
  }
  return out;
}

/**
 * Every baseline key is still there with the same shape. New properties are
 * allowed. A response may gain required names; a request may not, since that
 * breaks a caller that never sent them. Enums compare exactly: a strict client
 * fails on a value it has not seen. A field that becomes nullable fails.
 */
function expectShapeKept(
  baseline: unknown,
  current: unknown,
  at: string,
  side: 'request' | 'response'
): void {
  if (typeof baseline !== 'object' || baseline === null) {
    expect(current, at).toEqual(baseline);
    return;
  }
  expect(typeof current === 'object' && current !== null, at).toBe(true);
  if (Array.isArray(baseline)) {
    const list = current as unknown[];
    expect(list.length, at).toBeGreaterThanOrEqual(baseline.length);
    baseline.forEach((entry, i) => expectShapeKept(entry, list[i], `${at}[${i}]`, side));
    return;
  }
  const base = baseline as Json;
  const cur = current as Json;
  expect(cur.nullable === true && base.nullable !== true, `${at} became nullable`).toBe(false);
  for (const [key, value] of Object.entries(base)) {
    if (key === 'properties') {
      for (const [name, shape] of Object.entries(value as Json)) {
        expectShapeKept(shape, (cur.properties as Json | undefined)?.[name], `${at}.${name}`, side);
      }
    } else if (key === 'required') {
      if (side === 'response') {
        expect(cur.required, `${at}.required`).toEqual(expect.arrayContaining(value as unknown[]));
      } else {
        expect(value, `${at}.required gained names`).toEqual(
          expect.arrayContaining((cur.required as unknown[] | undefined) ?? [])
        );
      }
    } else if (key === 'enum') {
      expect(cur.enum, `${at}.enum`).toEqual(value);
    } else {
      expectShapeKept(value, cur[key], `${at}.${key}`, side);
    }
  }
  if (side === 'request' && !('required' in base) && Array.isArray(cur.required)) {
    expect(cur.required, `${at}.required gained names`).toEqual([]);
  }
}

describe('public API contract', () => {
  const documents = {
    v1: generateOpenAPIDocument() as Json,
    v2: generateOpenAPIDocumentV2() as Json,
  };
  const current = { v1: contractOf(documents.v1), v2: contractOf(documents.v2) };

  it('never sets operationId, so generated SDK method names keep deriving from the path', () => {
    for (const spec of Object.values(documents)) {
      for (const methods of Object.values(spec.paths as Json)) {
        for (const op of Object.values(methods as Json)) {
          expect((op as Json).operationId).toBeUndefined();
        }
      }
    }
  });

  it('keeps every baseline operation, parameter, request and response shape', () => {
    if (process.env.UPDATE_PUBLIC_API_CONTRACT) {
      writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    const baseline = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof current;

    for (const version of ['v1', 'v2'] as const) {
      for (const [key, op] of Object.entries(baseline[version])) {
        const now = current[version][key];
        expect(now, key).toBeDefined();
        if (!now) continue;
        if (version === 'v1') expect(now.tags, key).toEqual(op.tags);
        for (const [name, param] of Object.entries(op.parameters)) {
          expect(now.parameters[name], `${key} ${name}`).toEqual(param);
        }
        for (const [name, param] of Object.entries(now.parameters)) {
          if (!(name in op.parameters)) expect(param.required, `${key} new ${name}`).toBe(false);
        }
        expectShapeKept(op.request, now.request, `${key} request`, 'request');
        expectShapeKept(op.response, now.response, `${key} response`, 'response');
      }
    }
  });

  describe('the comparator itself', () => {
    const shape = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        state: { type: 'string', enum: ['up', 'down'] },
        name: { type: 'string' },
      },
    };
    const mutate = (fn: (copy: typeof shape) => void) => {
      const copy = JSON.parse(JSON.stringify(shape)) as typeof shape;
      fn(copy);
      return copy;
    };

    it('allows a new property and a new required response name', () => {
      const grown = mutate((c) => {
        (c.properties as Json).extra = { type: 'number' };
        c.required.push('name');
      });
      expect(() => expectShapeKept(shape, grown, 'x', 'response')).not.toThrow();
    });

    it('fails when a property goes missing', () => {
      const lost = mutate((c) => {
        delete (c.properties as Json).name;
      });
      expect(() => expectShapeKept(shape, lost, 'x', 'response')).toThrow();
    });

    it('fails when a property becomes nullable', () => {
      const nullable = mutate((c) => {
        (c.properties.name as Json).nullable = true;
      });
      expect(() => expectShapeKept(shape, nullable, 'x', 'response')).toThrow();
    });

    it('fails when an enum gains or loses a value', () => {
      const gained = mutate((c) => c.properties.state.enum.push('unknown'));
      const lost = mutate((c) => c.properties.state.enum.pop());
      expect(() => expectShapeKept(shape, gained, 'x', 'response')).toThrow();
      expect(() => expectShapeKept(shape, lost, 'x', 'response')).toThrow();
    });

    it('fails when a request property becomes required', () => {
      const stricter = mutate((c) => c.required.push('name'));
      expect(() => expectShapeKept(shape, stricter, 'x', 'request')).toThrow();
      expect(() => expectShapeKept(shape, stricter, 'x', 'response')).not.toThrow();
    });
  });
});
