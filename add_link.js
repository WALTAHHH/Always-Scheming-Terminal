const fs = require('fs');
let lines = fs.readFileSync('src/components/SignalPanel.tsx', 'utf8').split('\n');
let insertIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('signals.slice') && lines[i+1] && lines[i+1].includes('const badge')) {
    // Find the closing )} after the map (there may be multiple)
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === ')}' && lines[j-1].trim() === '))') {
        insertIndex = j;
        break;
      }
    }
    break;
  }
}
if (insertIndex !== -1) {
  const indent = '            ';
  const newLines = [
    `${indent}{signals.length > 10 && (`,
    `${indent}  <p className="text-ast-muted text-[10px] text-center pt-1">`,
    `${indent}    +{signals.length - 10} more — <a href="/api-explorer" className="text-ast-accent hover:underline">API Explorer</a>`,
    `${indent}  </p>`,
    `${indent})}`,
  ];
  lines.splice(insertIndex + 1, 0, ...newLines);
  fs.writeFileSync('src/components/SignalPanel.tsx', lines.join('\n'));
  console.log('Added view-all link at line', insertIndex);
} else {
  console.error('Could not find insertion point');
}
