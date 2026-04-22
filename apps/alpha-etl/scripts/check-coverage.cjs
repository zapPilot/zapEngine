
const fs = require('fs');
const summary = JSON.parse(fs.readFileSync('coverage-summary.json', 'utf8'));

const lowCoverage = [];
for (const [file, metrics] of Object.entries(summary)) {
    if (file === 'total') continue;
    if (
        metrics.lines.pct < 100 ||
        metrics.functions.pct < 100 ||
        metrics.statements.pct < 100 ||
        metrics.branches.pct < 100
    ) {
        lowCoverage.push({
            file: file.replace(process.cwd() + '/', ''),
            metrics: {
                lines: metrics.lines.pct,
                functions: metrics.functions.pct,
                statements: metrics.statements.pct,
                branches: metrics.branches.pct
            }
        });
    }
}

console.log(JSON.stringify(lowCoverage, null, 2));
