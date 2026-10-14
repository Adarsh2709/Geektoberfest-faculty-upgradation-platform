const fs = require('fs');
const path = require('path');

function patchFile(fullPath) {
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('node:util')) return;
    if (!content.includes('styleText') && !content.includes('parseEnv')) return;

    let modified = false;
    const utilImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']node:util["'];?/g;
    const newContent = content.replace(utilImportRegex, (match, imports) => {
      const specifiers = imports.split(',').map(s => s.trim()).filter(Boolean);
      const hasStyleText = specifiers.includes('styleText');
      const hasParseEnv = specifiers.includes('parseEnv');
      if (!hasStyleText && !hasParseEnv) return match;

      modified = true;
      const filtered = specifiers.filter(s => s !== 'styleText' && s !== 'parseEnv');
      let res = '';
      if (filtered.length > 0) {
        res += `import { ${filtered.join(', ')} } from "node:util";\n`;
      }
      if (hasStyleText && !content.includes('const styleText =')) {
        res += 'const styleText = (_fmt, text) => (typeof text === "string" ? text : (text !== undefined && text !== null ? String(text) : ""));\n';
      }
      if (hasParseEnv && !content.includes('const parseEnv =')) {
        res += 'const parseEnv = (c) => { const r = {}; (c || "").split(/\\r?\\n/).forEach(l => { const m = l.match(/^\\s*([\\w.-]+)\\s*=\\s*(.*)?\\s*$/); if (m) r[m[1]] = (m[2] || "").trim().replace(/^[\'"]|[\'"]$/g, ""); }); return r; };\n';
      }
      return res;
    });

    if (modified) {
      fs.writeFileSync(fullPath, newContent, 'utf8');
      console.log(`[patch-node18] Successfully patched ${fullPath}`);
    }
  } catch (err) {
    console.warn(`[patch-node18] Error patching ${fullPath}: ${err.message}`);
  }
}

function scanAndPatch(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        scanAndPatch(full);
      } else if (full.endsWith('.mjs') || full.endsWith('.js') || full.endsWith('.cjs')) {
        patchFile(full);
      }
    }
  } catch (err) {
    console.warn(`[patch-node18] Error scanning directory ${dir}: ${err.message}`);
  }
}

const targetDirs = [
  path.resolve(__dirname, 'node_modules/rolldown'),
  path.resolve(__dirname, 'node_modules/vite')
];

for (const dir of targetDirs) {
  if (fs.existsSync(dir)) {
    scanAndPatch(dir);
  }
}
