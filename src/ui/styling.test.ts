import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}

/** Every `style={{ … }}` in the file, as its contents. */
function inlineStyles(source: string): string[] {
  const out: string[] = [];
  const marker = 'style={{';
  let at = source.indexOf(marker);
  while (at !== -1) {
    let depth = 2;
    let i = at + marker.length;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    out.push(source.slice(at + marker.length, i - 2));
    at = source.indexOf(marker, i);
  }
  return out;
}

/**
 * The UI is built from Tailwind utilities and the src/ui primitives. An inline
 * style is allowed only for a value that can't be known until render — a
 * per-series colour from a chart palette, a percentage width, a dialog's own
 * max width. A literal belongs in a utility, where the design system can see
 * it; that was what made the old UI drift.
 */
const LITERAL = /:\s*(['"`])(?!\s*\$)/; // a quoted literal value, not an expression
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /\b\d+px\b/;

describe('inline styles', () => {
  const files = tsxFiles(SRC);

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('carries no hardcoded colour or length', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const style of inlineStyles(readFileSync(file, 'utf8'))) {
        // A template literal computing a length (`${pct}%`) is fine; a bare
        // `12px` or `#a78bfa` is a design decision made in the wrong place.
        const computed = style.includes('${');
        if ((HEX.test(style) || (PX.test(style) && !computed))) {
          offenders.push(`${file.replace(SRC, '')}: ${style.trim().slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses inline styles only for values computed at render', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const style of inlineStyles(readFileSync(file, 'utf8'))) {
        if (LITERAL.test(style)) {
          offenders.push(`${file.replace(SRC, '')}: ${style.trim().slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the count low enough to stay reviewable', () => {
    const total = files.reduce((sum, f) => sum + inlineStyles(readFileSync(f, 'utf8')).length, 0);
    // Was 373 before the migration. Each survivor is a computed value; if this
    // climbs, something is styling itself locally again.
    expect(total).toBeLessThanOrEqual(12);
  });
});
