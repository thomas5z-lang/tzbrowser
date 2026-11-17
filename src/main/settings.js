'use strict';
// Einfache Einstellungen in %APPDATA%\TZBrowser\settings.json

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  accent: '#fa1e4e',
  youtubeAds: true,
  sponsorblock: true,
  sbCategories: ['sponsor', 'selfpromo', 'interaction', 'music_offtopic'],
  dislikes: true,
  twitchAds: true,
  twitchPoints: true,
};

let data = null;
const file = () => path.join(app.getPath('userData'), 'settings.json');

function load() {
  if (data) return data;
  try { data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { data = { ...DEFAULTS }; }
  return data;
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  fs.writeFileSync(file(), JSON.stringify(data, null, 2));
}

function all() {
  return { ...load() };
}

module.exports = { get, set, all };
