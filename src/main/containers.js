'use strict';
// Container-Tabs: jeder Container hat eigene Cookies, Logins und Speicher.
// "Privat" ist ein Wegwerf-Container: nichts wird auf der Platte gespeichert.

const { app, session } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = [
  { id: 'persoenlich', name: 'Persönlich', color: '#3ee0d0' },
  { id: 'arbeit', name: 'Arbeit', color: '#ffb547' },
  { id: 'gaming', name: 'Gaming', color: '#8b6cff' },
  { id: 'einkaufen', name: 'Einkaufen', color: '#ff5c7a' },
  { id: 'zweitkonto', name: 'Zweitkonto', color: '#5ca8ff' },
];
const PRIVATE = { id: 'privat', name: 'Privat', color: '#c0c4d0', temporary: true };

let list = null;
let prepare = () => {};

const file = () => path.join(app.getPath('userData'), 'containers.json');

function all() {
  if (!list) {
    try { list = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { list = DEFAULTS; }
  }
  return list;
}

function get(id) {
  if (!id) return null;
  if (id === PRIVATE.id) return PRIVATE;
  return all().find((c) => c.id === id) || null;
}

// Electron-Sitzung zu einem Container (null = Standard)
function sessionFor(id) {
  const c = get(id);
  if (!c) return session.defaultSession;
  const ses = session.fromPartition(c.temporary ? 'ghost-privat' : `persist:container-${c.id}`, { cache: !c.temporary });
  prepare(ses); // Werbeblocker, Downloads, VPN usw. (nur beim ersten Mal)
  return ses;
}

function partitionFor(id) {
  const c = get(id);
  if (!c) return undefined;
  return c.temporary ? 'ghost-privat' : `persist:container-${c.id}`;
}

// Privat-Daten löschen, wenn der letzte private Tab geschlossen wird
async function clearPrivate() {
  const ses = session.fromPartition('ghost-privat');
  await ses.clearStorageData();
  await ses.clearCache();
}

function setPrepare(fn) {
  prepare = fn;
}

module.exports = { all, get, sessionFor, partitionFor, clearPrivate, setPrepare, PRIVATE };
