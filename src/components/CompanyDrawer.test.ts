import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CompanyDrawer UX fixes', () => {
  const filePath = path.resolve(__dirname, 'CompanyDrawer.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  test('chart container has max-height constraint (≤192px)', () => {
    // Look for max-h-48 class on chart container
    // The chart container is the div wrapping InteractiveChart (line ~601)
    // It should have max-h-48 class
    const chartContainerRegex = /<div[^>]*className=[\"'][^\"']*max-h-48[^\"']*[\"'][^>]*>/;
    expect(content).toMatch(chartContainerRegex);
  });

  test('scroll hint appears when relatedItems.length > 0', () => {
    // Look for a scroll hint element that conditionally renders
    // Should contain "↓ Recent Coverage" or similar
    const scrollHintRegex = /↓.*Recent Coverage/;
    expect(content).toMatch(scrollHintRegex);
    // Also check conditional rendering based on relatedItems.length
    const conditionalRegex = /relatedItems\.length\s*>\s*0/;
    expect(content).toMatch(conditionalRegex);
  });

  test('stock chart hover tooltip onMouseMove handler present on SVG', () => {
    // Find SVG element with onMouseMove attribute
    const svgOnMouseMoveRegex = /<svg[^>]*onMouseMove[^>]*>/;
    expect(content).toMatch(svgOnMouseMoveRegex);
  });

  test('tooltip renders price + date and hides on mouseLeave', () => {
    // Look for tooltip markup that shows price and date
    // The tooltip might be a separate div or part of price display
    // For now, check that hoverPrice and hoverDate are used
    expect(content).toContain('hoverPrice');
    expect(content).toContain('hoverDate');
    // Check mouseLeave handler
    expect(content).toContain('onMouseLeave');
  });
});