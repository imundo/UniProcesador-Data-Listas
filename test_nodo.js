const fs = require('fs');
const txt = fs.readFileSync('nodo.js', 'utf8');

const fromMatches = txt.match(/\.from\(['"]([^'"]+)['"]\)/g) || [];
const rpcMatches = txt.match(/\.rpc\(['"]([^'"]+)['"]\)/g) || [];
const selectMatches = txt.match(/\.select\(['"]([^'"]+)['"]\)/g) || [];
const eqMatches = txt.match(/\.eq\(['"]([^'"]+)['"]/g) || [];
const textSearchMatches = txt.match(/\.textSearch\(['"]([^'"]+)['"]/g) || [];
const ilikeMatches = txt.match(/\.ilike\(['"]([^'"]+)['"]/g) || [];
const functionMatches = txt.match(/fetch\(['"]([^'"]+)['"]/g) || [];

console.log('Tables:', [...new Set(fromMatches)]);
console.log('RPCs:', [...new Set(rpcMatches)]);
console.log('Selects:', [...new Set(selectMatches)]);
console.log('Eqs:', [...new Set(eqMatches)]);
console.log('TextSearches:', [...new Set(textSearchMatches)]);
console.log('ILikes:', [...new Set(ilikeMatches)]);
console.log('Fetches:', [...new Set(functionMatches)]);
