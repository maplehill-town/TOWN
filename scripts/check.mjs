// Content check for every pull request: only the allowed folders and file types, schema rules,
// and no links, handles, wallets or code. Runs in GitHub Actions with plain Node (no dependencies).
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = [/https?:\/\/|www\./i, /@\w{2,}/, /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b|0x[a-fA-F0-9]{20,}/, /<\s*(script|iframe|img|a|style)\b/i, /seed phrase|private key/i];
const FOLDERS = { buildings: '.json', laws: '.md', library: '.md', signs: '.json', languages: '.json' };
const SCHEMA_OF = { buildings: 'building', signs: 'sign', languages: 'language' };
const NAME = /^[a-z0-9][a-z0-9-]{1,60}\.(json|md)$/;
const errors = [];

function validate(obj, s, where) {
  if (typeof obj !== 'object' || !obj || Array.isArray(obj)) return errors.push(`${where}: must be a JSON object`);
  for (const k of s.required || []) if (!(k in obj)) errors.push(`${where}: missing "${k}"`);
  for (const [k, v] of Object.entries(obj)) {
    const p = s.properties?.[k];
    if (!p) { errors.push(`${where}: unknown field "${k}"`); continue; }
    if (p.enum && !p.enum.includes(v)) errors.push(`${where}: "${k}" must be one of: ${p.enum.join(', ')}`);
    if (p.type === 'string' && (typeof v !== 'string' || (p.maxLength && v.length > p.maxLength))) errors.push(`${where}: "${k}" must be text up to ${p.maxLength} characters`);
    if (p.type === 'object') {
      const keys = Object.keys(v || {});
      if (keys.length > (p.maxProperties || 200)) errors.push(`${where}: too many entries in "${k}"`);
      const re = new RegExp(p.propertyNames?.pattern || '.*');
      for (const w of keys) {
        if (!re.test(w)) errors.push(`${where}: bad word "${w}"`);
        if (typeof v[w] !== 'string' || v[w].length > 80) errors.push(`${where}: bad meaning for "${w}"`);
      }
    }
  }
}

const changed = (process.env.CHANGED || '').split('\n').map(s => s.trim()).filter(Boolean);
const files = changed.length ? changed : Object.keys(FOLDERS).flatMap(p => fs.existsSync(p) ? fs.readdirSync(p).map(f => `${p}/${f}`) : []);
for (const f of files) {
  if (f.endsWith('.gitkeep')) continue;
  const [folder, name, ...rest] = f.split('/');
  if (!FOLDERS[folder] || rest.length || !name) {
    errors.push(`${f}: proposals may only add files directly inside ${Object.keys(FOLDERS).join(', ')}`);
    continue;
  }
  if (!fs.existsSync(f)) continue; // removed file
  if (!NAME.test(name) || path.extname(name) !== FOLDERS[folder]) { errors.push(`${f}: name must be lowercase-with-dashes${FOLDERS[folder]}`); continue; }
  const text = fs.readFileSync(f, 'utf8');
  if (text.length > 6000) errors.push(`${f}: too long (max 6000 characters)`);
  for (const re of FORBIDDEN) if (re.test(text)) errors.push(`${f}: contains something not allowed (links, handles, wallets or code)`);
  if (FOLDERS[folder] === '.json') {
    let j; try { j = JSON.parse(text); } catch { errors.push(`${f}: invalid JSON`); continue; }
    validate(j, JSON.parse(fs.readFileSync(`schemas/${SCHEMA_OF[folder]}.json`, 'utf8')), f);
  }
}
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log(`ok (${files.length} files checked)`);
