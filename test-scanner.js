const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function getFiles() {
  const result = spawnSync('find', [
    '.', 
    '-name', '*.ts', 
    '-not', '-path', '*/node_modules/*', 
    '-not', '-path', '*/.next/*', 
    '-not', '-path', '*/dist/*', 
    '-not', '-path', '*/build/*',
    '-not', '-path', '*/.worktrees/*',
    '-not', '-path', '*/.claude/worktrees/*'
  ], { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
  
  if (result.error) {
    throw result.error;
  }
  
  return result.stdout.toString().split('\n').filter(Boolean).map(f => f.replace(/^\.\//, ''));
}

const allFiles = getFiles();
const testFiles = new Set(allFiles.filter(f => f.endsWith('.test.ts') || f.endsWith('.spec.ts')));
const sourceFiles = allFiles.filter(f => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'));

const issues = [];
let criticalCount = 0;

function checkTestContent(testFile) {
  try {
    const content = fs.readFileSync(testFile, 'utf8');
    if (!content.includes('expect(') || 
        content.match(/test\([^,]+,\s*(?:async\s*)?\(\)\s*=>\s*{\s*}\)/) || 
        content.match(/it\([^,]+,\s*(?:async\s*)?\(\)\s*=>\s*{\s*}\)/)) {
      issues.push({
        type: 'trivial_test',
        file: testFile,
        severity: 'MEDIUM',
        confidence: 0.9,
        description: 'Test file contains no assertions or empty test blocks',
        suggested_action: 'Add assertions or remove empty tests'
      });
    }
  } catch(e) {}
}

function checkSourceContent(srcFile) {
  try {
    const content = fs.readFileSync(srcFile, 'utf8');
    
    // Risk patterns
    const risks = [];
    if (content.includes('setTimeout')) risks.push('setTimeout');
    if (content.includes('Math.random')) risks.push('Math.random');
    if (content.includes('fetch')) risks.push('fetch');
    if (content.includes('axios')) risks.push('axios');
    
    if (risks.length > 0) {
      issues.push({
        type: 'risk_pattern',
        file: srcFile,
        severity: 'LOW',
        confidence: 0.9,
        description: `Contains risk patterns: ${risks.join(', ')}`,
        suggested_action: 'Review usage of these patterns'
      });
    }

    // Broken imports check
    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const dir = path.dirname(srcFile);
      const resolvedBase = path.resolve(dir, importPath);
      const relativeResolved = path.relative(process.cwd(), resolvedBase);
      
      // Check extensions
      const exts = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js', '.jsx', '.json'];
      let found = false;
      for (const ext of exts) {
        if (fs.existsSync(relativeResolved + ext)) {
          found = true;
          break;
        }
      }
      if (!found) {
        issues.push({
          type: 'broken_import',
          file: srcFile,
          severity: 'CRITICAL',
          confidence: 0.7,
          description: `Import ${importPath} appears to be broken`,
          suggested_action: 'Fix import path'
        });
        criticalCount++;
      }
    }

  } catch(e) {}
}

for (const src of sourceFiles) {
  const dir = path.dirname(src);
  const name = path.basename(src, '.ts');
  
  const possibleTests = [
    path.join(dir, `${name}.test.ts`),
    path.join(dir, `${name}.spec.ts`),
    path.join(dir, '__tests__', `${name}.test.ts`),
    path.join(dir, '__tests__', `${name}.spec.ts`)
  ];
  
  let testFound = false;
  let matchingTest = null;
  for (const t of possibleTests) {
    if (testFiles.has(t) || fs.existsSync(t)) {
      testFound = true;
      matchingTest = t;
      break;
    }
  }
  
  if (!testFound) {
    issues.push({
      type: 'missing_test',
      file: src,
      severity: 'HIGH',
      confidence: 0.9,
      description: 'No matching test file found',
      suggested_action: 'Create a test file for this module'
    });
  } else {
    checkTestContent(matchingTest);
  }
  
  checkSourceContent(src);
}

const result = {
  task: "test-structure-scan",
  summary: {
    total_issues: issues.length,
    critical: criticalCount
  },
  items: issues
};

if (!fs.existsSync('.todos')) {
  fs.mkdirSync('.todos');
}
fs.writeFileSync('.todos/test-hygiene.json', JSON.stringify(result, null, 2));

