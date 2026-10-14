const fs = require('fs');
const path = require('path');

function patchDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        patchDirectory(full);
      } else if (full.endsWith('.mjs') || full.endsWith('.js') || full.endsWith('.cjs')) {
        let content = fs.readFileSync(full, 'utf8');
        if (content.includes('styleText') && content.includes('"node:util"')) {
          const original = content;
          content = content.replace(
            /import\s*\{\s*formatWithOptions,\s*styleText\s*\}\s*from\s*["']node:util["'];?/g,
            'import { formatWithOptions } from "node:util"; const styleText = (_fmt, text) => (typeof text === "string" ? text : (text !== undefined && text !== null ? String(text) : ""));'
          );
          content = content.replace(
            /import\s*\{\s*styleText,\s*formatWithOptions\s*\}\s*from\s*["']node:util["'];?/g,
            'import { formatWithOptions } from "node:util"; const styleText = (_fmt, text) => (typeof text === "string" ? text : (text !== undefined && text !== null ? String(text) : ""));'
          );
          content = content.replace(
            /import\s*\{\s*styleText\s*\}\s*from\s*["']node:util["'];?/g,
            'const styleText = (_fmt, text) => (typeof text === "string" ? text : (text !== undefined && text !== null ? String(text) : ""));'
          );
          if (content !== original) {
            fs.writeFileSync(full, content, 'utf8');
            console.log(`[patch-node18] Patched styleText in ${full}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[patch-node18] Warning while patching: ${err.message}`);
  }
}

const rolldownDir = path.resolve(__dirname, 'node_modules/rolldown');
if (fs.existsSync(rolldownDir)) {
  patchDirectory(rolldownDir);
}
