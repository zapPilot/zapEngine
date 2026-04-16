
const fs = require('fs');
const coverage = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));

const results = [];

for (const [filePath, data] of Object.entries(coverage)) {
    const relativePath = filePath.replace(process.cwd() + '/', '');

    // Statements
    const statementsTotal = Object.keys(data.s).length;
    const statementsCovered = Object.values(data.s).filter(v => v > 0).length;
    const statementsPct = statementsTotal === 0 ? 100 : (statementsCovered / statementsTotal) * 100;

    // Functions
    const functionsTotal = Object.keys(data.f).length;
    const functionsCovered = Object.values(data.f).filter(v => v > 0).length;
    const functionsPct = functionsTotal === 0 ? 100 : (functionsCovered / functionsTotal) * 100;

    // Branches
    const branchesTotal = Object.keys(data.b).length; // Each key is a branch ID usually mapping to an array of outcomes? No, checking Istanbul format.
    // Actually data.b values are arrays of counts for each branch outcome.
    let branchOutcomesTotal = 0;
    let branchOutcomesCovered = 0;
    for (const outcomes of Object.values(data.b)) {
        branchOutcomesTotal += outcomes.length;
        branchOutcomesCovered += outcomes.filter(v => v > 0).length;
    }
    const branchesPct = branchOutcomesTotal === 0 ? 100 : (branchOutcomesCovered / branchOutcomesTotal) * 100;

    // Lines - Istanbul usually uses 's' for statements which maps to lines often, but sometimes 'l' is present?
    // coverage-final.json from v8 provider might be different. 
    // vitest v8 provider produces a slightly different format sometimes?
    // Let's rely on statements, functions, branches for now which are core.

    if (statementsPct < 100 || functionsPct < 100 || branchesPct < 100) {
        results.push({
            file: relativePath,
            s: parseFloat(statementsPct.toFixed(2)),
            f: parseFloat(functionsPct.toFixed(2)),
            b: parseFloat(branchesPct.toFixed(2))
        });
    }
}

console.log(JSON.stringify(results, null, 2));
