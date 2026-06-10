import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'assets/publishing/source');
const steamDir = path.join(root, 'assets/publishing/steam');
const iconDir = path.join(root, 'assets/publishing/icons');
const iosAppIconDir = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const tempDir = path.join(root, 'assets/publishing/.tmp');

const keyArtSource = path.join(sourceDir, 'driftlands-steam-key-art-source.png');
const iconSource = path.join(sourceDir, 'driftlands-app-icon-source.png');

const steamAssets = [
  ['header_capsule_920x430.png', keyArtSource, 920, 430],
  ['small_capsule_462x174.png', keyArtSource, 462, 174],
  ['main_capsule_1232x706.png', keyArtSource, 1232, 706],
  ['vertical_capsule_748x896.png', iconSource, 748, 896],
  ['library_capsule_600x900.png', iconSource, 600, 900],
  ['library_hero_3840x1240.png', keyArtSource, 3840, 1240],
  ['library_header_capsule_920x430.png', keyArtSource, 920, 430],
  ['page_background_1438x810.png', keyArtSource, 1438, 810],
  ['event_cover_800x450.png', keyArtSource, 800, 450],
  ['event_header_1920x622.png', keyArtSource, 1920, 622],
];

const iconSizes = [16, 32, 48, 64, 128, 184, 256, 512, 1024];
const icoSizes = [16, 32, 48, 64, 128, 256];

function run(command, args) {
  execFileSync(command, args, { stdio: 'pipe' });
}

function ensureInput(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing source image: ${path.relative(root, filePath)}`);
  }
}

function ensureDirs() {
  mkdirSync(steamDir, { recursive: true });
  mkdirSync(iconDir, { recursive: true });
  mkdirSync(iosAppIconDir, { recursive: true });
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
}

function getImageSize(filePath) {
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
    encoding: 'utf8',
  });
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);

  if (!width || !height) {
    throw new Error(`Could not read image size for ${filePath}`);
  }

  return { width, height };
}

function coverResize(source, output, width, height) {
  const sourceSize = getImageSize(source);
  const sourceRatio = sourceSize.width / sourceSize.height;
  const targetRatio = width / height;

  const resizeArgs =
    sourceRatio > targetRatio
      ? ['--resampleHeight', String(height), source, '--out', output]
      : ['--resampleWidth', String(width), source, '--out', output];

  run('sips', resizeArgs);
  run('sips', ['--cropToHeightWidth', String(height), String(width), output]);
}

function resizePng(source, output, size) {
  run('sips', ['--resampleHeightWidth', String(size), String(size), source, '--out', output]);
}

function resizeJpg(source, output, size) {
  run('sips', [
    '--resampleHeightWidth',
    String(size),
    String(size),
    '-s',
    'format',
    'jpeg',
    source,
    '--out',
    output,
  ]);
}

function makeIcns() {
  const icnsEntries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ];
  const chunks = icnsEntries.map(([type, size]) => {
    const png = readFileSync(path.join(iconDir, `driftlands-icon-${size}.png`));
    const chunk = Buffer.alloc(8 + png.length);
    chunk.write(type, 0, 4, 'ascii');
    chunk.writeUInt32BE(chunk.length, 4);
    png.copy(chunk, 8);
    return chunk;
  });
  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLength, 4);

  writeFileSync(path.join(iconDir, 'driftlands.icns'), Buffer.concat([header, ...chunks], totalLength));
}

function makeIco() {
  const pngBuffers = icoSizes.map((size) => {
    const pngPath = path.join(iconDir, `driftlands-icon-${size}.png`);
    return { size, buffer: readFileSync(pngPath) };
  });

  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + pngBuffers.length * entrySize;
  const totalSize = directorySize + pngBuffers.reduce((sum, item) => sum + item.buffer.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(pngBuffers.length, 4);

  let imageOffset = directorySize;

  for (const [index, item] of pngBuffers.entries()) {
    const entryOffset = headerSize + index * entrySize;
    const sizeByte = item.size === 256 ? 0 : item.size;

    ico.writeUInt8(sizeByte, entryOffset);
    ico.writeUInt8(sizeByte, entryOffset + 1);
    ico.writeUInt8(0, entryOffset + 2);
    ico.writeUInt8(0, entryOffset + 3);
    ico.writeUInt16LE(1, entryOffset + 4);
    ico.writeUInt16LE(32, entryOffset + 6);
    ico.writeUInt32LE(item.buffer.length, entryOffset + 8);
    ico.writeUInt32LE(imageOffset, entryOffset + 12);
    item.buffer.copy(ico, imageOffset);
    imageOffset += item.buffer.length;
  }

  const output = path.join(iconDir, 'driftlands.ico');
  writeFileSync(output, ico);
}

ensureInput(keyArtSource);
ensureInput(iconSource);
ensureDirs();

for (const [fileName, source, width, height] of steamAssets) {
  coverResize(source, path.join(steamDir, fileName), width, height);
}

for (const size of iconSizes) {
  resizePng(iconSource, path.join(iconDir, `driftlands-icon-${size}.png`), size);
}

resizeJpg(iconSource, path.join(iconDir, 'steam-app-icon-184x184.jpg'), 184);
const ipadIcon = path.join(iconDir, 'ipad-app-icon-1024.png');
resizePng(iconSource, ipadIcon, 1024);
copyFileSync(ipadIcon, path.join(iosAppIconDir, 'AppIcon-512@2x.png'));
makeIcns();
makeIco();
rmSync(tempDir, { recursive: true, force: true });

console.log(`Generated ${steamAssets.length} Steam images and ${iconSizes.length + 5} icon assets.`);
