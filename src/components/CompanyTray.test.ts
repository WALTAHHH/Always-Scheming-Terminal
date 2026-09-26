import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CompanyTray mini-chart hover tooltips', () => {
  const filePath = path.resolve(__dirname, 'CompanyTray.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  test('Sparkline SVG has onMouseMove and onMouseLeave handlers', () => {
    // Find Sparkline function's SVG with onMouseMove attribute
    const svgOnMouseMoveRegex = /<svg[^>]*onMouseMove[^>]*>/;
    expect(content).toMatch(svgOnMouseMoveRegex);
    const svgOnMouseLeaveRegex = /<svg[^>]*onMouseLeave[^>]*>/;
    expect(content).toMatch(svgOnMouseLeaveRegex);
  });

  test('Sparkline uses useState for hoverX', () => {
    expect(content).toContain('const [hoverX, setHoverX] = useState<number | null>(null);');
  });

  test('Sparkline uses useRef for containerRef', () => {
    expect(content).toContain('const containerRef = useRef<HTMLDivElement>(null);');
  });

  test('Sparkline tooltip div has correct styling classes', () => {
    // Tooltip class string from the spec
    const tooltipClassRegex = /bg-ast-surface border border-ast-border text-\[10px\] text-ast-text rounded px-2 py-1 pointer-events-none absolute z-10/;
    expect(content).toMatch(tooltipClassRegex);
  });

  test('Sparkline tooltip displays price via formatCurrency', () => {
    expect(content).toContain('formatCurrency(hoverPoint.price');
  });

  test('Sparkline tooltip displays date', () => {
    expect(content).toContain('hoverPoint.date');
  });

  test('Sparkline interpolates price on hover', () => {
    // Look for interpolation logic: points array includes price and date
    expect(content).toContain('price: h.close');
    expect(content).toContain('date: h.date');
  });
});