const fs = require('fs');
const path = require('path');
const wasmPath = path.join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const wasm = fs.readFileSync(wasmPath);
const b64 = wasm.toString('base64');
fs.writeFileSync('wasm-b64.js', 'module.exports = "' + b64 + '";');
console.log('Done:', fs.statSync('wasm-b64.js').size, 'bytes');
