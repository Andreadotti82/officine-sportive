// Richieste HTTP "sincrone" per i codici nati su Google (UrlFetchApp.fetch aspetta la risposta).
// Un worker fa la richiesta; il codice principale aspetta con Atomics.wait.
import { Worker } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CODICE_WORKER = `
const { parentPort } = require('worker_threads');
const fs = require('fs');
parentPort.on('message', async ({ id, url, opz, file, sab }) => {
  const flag = new Int32Array(sab);
  let out;
  try {
    const r = await fetch(url, opz);
    const buf = Buffer.from(await r.arrayBuffer());
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
    out = { status: r.status, headers: h, body: buf.toString('base64') };
  } catch (e) { out = { errore: String(e && e.message || e) }; }
  fs.writeFileSync(file, JSON.stringify(out));
  Atomics.store(flag, 0, 1); Atomics.notify(flag, 0);
});`;

let worker = null, n = 0;
function w() {
  if (!worker) { worker = new Worker(CODICE_WORKER, { eval: true }); worker.unref(); }
  return worker;
}

export function fetchSync(url, opz = {}, timeoutMs = 50000) {
  const sab = new SharedArrayBuffer(4), flag = new Int32Array(sab);
  const file = path.join(os.tmpdir(), 'jf-' + process.pid + '-' + (++n) + '.json');
  w().postMessage({ id: n, url, opz, file, sab });
  const r = Atomics.wait(flag, 0, 0, timeoutMs);
  if (r === 'timed-out') throw new Error('Tempo scaduto: ' + url.split('?')[0]);
  const out = JSON.parse(fs.readFileSync(file, 'utf8')); try { fs.unlinkSync(file); } catch (e) { }
  if (out.errore) throw new Error(out.errore);
  return { status: out.status, headers: out.headers, body: Buffer.from(out.body, 'base64') };
}
