#!/usr/bin/env node
/**
 * Initialize data/ directory with default content
 * Runs automatically via postinstall, can also be run manually
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LOCALES_SRC = path.join(ROOT, 'public', 'locales');
const IMAGES_SRC = path.join(ROOT, 'public', 'images');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${path.relative(ROOT, dir)}`);
  }
}

function copyIfMissing(src, dest, description) {
  if (!fs.existsSync(dest) && fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${description}`);
  }
}

function createBioJson() {
  const bioPath = path.join(DATA_DIR, 'bio.json');
  if (fs.existsSync(bioPath)) return;

  // Extract bios from existing locale files
  let enBio = '';
  let frBio = '';

  try {
    const enLocale = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'locales', 'en.json'), 'utf8'));
    enBio = enLocale.about?.bio || '';
  } catch (e) {
    // Fallback to source if data copy doesn't exist yet
    try {
      const enLocale = JSON.parse(fs.readFileSync(path.join(LOCALES_SRC, 'en.json'), 'utf8'));
      enBio = enLocale.about?.bio || '';
    } catch (e2) {}
  }

  try {
    const frLocale = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'locales', 'fr.json'), 'utf8'));
    frBio = frLocale.about?.bio || '';
  } catch (e) {
    try {
      const frLocale = JSON.parse(fs.readFileSync(path.join(LOCALES_SRC, 'fr.json'), 'utf8'));
      frBio = frLocale.about?.bio || '';
    } catch (e2) {}
  }

  const bioData = { en: enBio, fr: frBio };
  fs.writeFileSync(bioPath, JSON.stringify(bioData, null, 2));
  console.log('Created: data/bio.json');
}

function main() {
  // Skip if data/ already exists (don't overwrite user edits)
  if (fs.existsSync(DATA_DIR)) {
    console.log('data/ directory already exists, skipping initialization');
    return;
  }

  console.log('Initializing data/ directory...');

  // Create directories
  ensureDir(DATA_DIR);
  ensureDir(path.join(DATA_DIR, 'locales'));
  ensureDir(path.join(DATA_DIR, 'images'));

  // Copy locale files
  copyIfMissing(
    path.join(LOCALES_SRC, 'en.json'),
    path.join(DATA_DIR, 'locales', 'en.json'),
    'en.json'
  );
  copyIfMissing(
    path.join(LOCALES_SRC, 'fr.json'),
    path.join(DATA_DIR, 'locales', 'fr.json'),
    'fr.json'
  );

  // Copy profile image
  copyIfMissing(
    path.join(IMAGES_SRC, 'hellajay-pp.webp'),
    path.join(DATA_DIR, 'images', 'profile.webp'),
    'profile.webp'
  );

  // Create bio.json from locale files
  createBioJson();

  console.log('Done! data/ directory initialized.');
}

main();
