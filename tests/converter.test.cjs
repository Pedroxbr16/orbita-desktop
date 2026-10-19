const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ffmpeg = require('ffmpeg-static');
const { categoryOf, inspectFiles, processFiles } = require('../electron/converter.cjs');

test('classifica formatos principais', () => {
  assert.equal(categoryOf('/tmp/foto.png'), 'image');
  assert.equal(categoryOf('/tmp/filme.MP4'), 'video');
  assert.equal(categoryOf('/tmp/faixa.flac'), 'audio');
  assert.equal(categoryOf('/tmp/texto.docx'), 'document');
  assert.equal(categoryOf('/tmp/arquivo.xyz'), 'unknown');
});

test('converte e redimensiona imagem localmente', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'orbita-test-'));
  try {
    const input = path.join(root, 'amostra.png');
    const generated = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=#ff7b2c:s=320x180', '-frames:v', '1', input]);
    assert.equal(generated.status, 0, generated.stderr?.toString());
    const inspected = await inspectFiles([input]);
    assert.equal(inspected[0].width, 320);
    assert.equal(inspected[0].height, 180);

    const converted = await processFiles({ paths: [input], action: 'convert', options: { format: 'webp', quality: 80 } });
    assert.equal(converted.length, 1);
    assert.equal(path.extname(converted[0].outputPath), '.webp');
    assert.ok((await readFile(converted[0].outputPath)).length > 40);

    const resized = await processFiles({ paths: [input], action: 'resize', options: { format: 'png', width: 100, height: 100, fit: 'inside' } });
    const [meta] = await inspectFiles([resized[0].outputPath]);
    assert.equal(meta.width, 100);
    assert.equal(meta.height, 56);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
