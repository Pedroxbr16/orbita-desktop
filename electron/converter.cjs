const { spawn } = require('node:child_process');
const { access, copyFile, mkdir, mkdtemp, rename, rm, stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const IMAGE_INPUTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif', 'gif', 'tif', 'tiff']);
const VIDEO_INPUTS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg', 'mpg', 'wmv', 'flv', '3gp', 'mts', 'm2ts']);
const AUDIO_INPUTS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'wma']);
const DOCUMENT_INPUTS = new Set(['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp']);

function extensionOf(filePath) {
  return path.extname(filePath).slice(1).toLowerCase();
}

function unpacked(binaryPath) {
  if (!binaryPath) return binaryPath;
  return binaryPath.includes('app.asar') ? binaryPath.replace('app.asar', 'app.asar.unpacked') : binaryPath;
}

function ffmpegPath() {
  return unpacked(ffmpegStatic);
}

function ffprobePath() {
  return unpacked(ffprobeStatic.path);
}

function categoryOf(filePath) {
  const ext = extensionOf(filePath);
  if (IMAGE_INPUTS.has(ext)) return 'image';
  if (VIDEO_INPUTS.has(ext)) return 'video';
  if (AUDIO_INPUTS.has(ext)) return 'audio';
  if (DOCUMENT_INPUTS.has(ext)) return 'document';
  return 'unknown';
}

function safeStem(filePath) {
  const raw = path.basename(filePath, path.extname(filePath));
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'arquivo';
}

async function uniquePath(directory, stem, extension) {
  await mkdir(directory, { recursive: true });
  let suffix = '';
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = path.join(directory, `${stem}${suffix}.${extension}`);
    try {
      await access(candidate);
      suffix = `-${index + 1}`;
    } catch {
      return candidate;
    }
  }
  throw new Error('Não foi possível criar um nome único para o arquivo de saída.');
}

function run(command, args, { timeout = 30 * 60_000, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout = (stdout + text).slice(-1_000_000);
      onStdout?.(text);
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-80_000); });
    child.once('error', (error) => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(signal === 'SIGKILL' ? 'A operação excedeu o tempo limite.' : (stderr.trim() || `O conversor encerrou com código ${code}.`)));
    });
  });
}

async function mediaMetadata(filePath) {
  const { stdout } = await run(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type', '-of', 'json', filePath], { timeout: 30_000 });
  return JSON.parse(stdout || '{}');
}

async function inspectFiles(paths) {
  const results = [];
  for (const filePath of paths) {
    const info = await stat(filePath);
    if (!info.isFile()) continue;
    const category = categoryOf(filePath);
    const item = { path: filePath, name: path.basename(filePath), extension: extensionOf(filePath), category, size: info.size };
    try {
      if (category === 'image' || category === 'video' || category === 'audio') {
        const meta = await mediaMetadata(filePath);
        item.duration = Number(meta.format?.duration) || 0;
        const video = meta.streams?.find((stream) => stream.codec_type === 'video');
        item.width = video?.width;
        item.height = video?.height;
        if (category === 'image') item.pages = 1;
      }
    } catch {
      item.warning = 'Não foi possível ler todos os metadados.';
    }
    results.push(item);
  }
  return results;
}

function imageCodecArgs(format, quality) {
  const q = Math.max(1, Math.min(100, Number(quality) || 82));
  if (format === 'jpg') return ['-c:v', 'mjpeg', '-q:v', String(Math.max(2, Math.round(31 - q * 0.29)))];
  if (format === 'png') return ['-c:v', 'png', '-compression_level', String(Math.max(0, Math.min(9, Math.round(9 - q / 12))))];
  if (format === 'webp') return ['-c:v', 'libwebp', '-quality', String(q), '-compression_level', '4'];
  if (format === 'avif') return ['-c:v', 'libaom-av1', '-crf', String(Math.max(8, Math.round(63 - q * 0.52))), '-b:v', '0', '-still-picture', '1'];
  if (format === 'tiff') return ['-c:v', 'tiff', '-compression_algo', 'deflate'];
  if (format === 'gif') return ['-c:v', 'gif'];
  throw new Error(`Saída de imagem .${format} não suportada.`);
}

async function processImage(inputPath, action, options, outputDirectory) {
  const inputExt = extensionOf(inputPath);
  const writableFormats = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff']);
  const requestedOption = (options.format || inputExt).toLowerCase();
  const requested = action !== 'convert' && !writableFormats.has(requestedOption) ? 'png' : requestedOption;
  const format = requested === 'jpeg' ? 'jpg' : requested === 'tif' ? 'tiff' : requested;
  if (!writableFormats.has(format)) throw new Error(`Saída de imagem .${format} não suportada.`);
  const suffixes = { compress: 'comprimido', resize: 'redimensionado', crop: 'recortado', rotate: 'girado', grayscale: 'pb', clean: 'sem-metadados' };
  const outputPath = await uniquePath(outputDirectory, `${safeStem(inputPath)}-${suffixes[action] || 'convertido'}`, format);
  const filters = [];

  if (action === 'resize') {
    const width = Math.max(1, Math.min(20_000, Math.round(Number(options.width) || 0))) || null;
    const height = Math.max(1, Math.min(20_000, Math.round(Number(options.height) || 0))) || null;
    if (!width && !height) throw new Error('Informe a largura ou a altura desejada.');
    if (width && height && options.fit === 'fill') filters.push(`scale=${width}:${height}`);
    else if (width && height && options.fit === 'cover') filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`);
    else filters.push(`scale=${width || -1}:${height || -1}${width && height ? ':force_original_aspect_ratio=decrease' : ''}`);
  }
  if (action === 'crop') {
    const meta = await mediaMetadata(inputPath);
    const video = meta.streams?.find((stream) => stream.codec_type === 'video');
    const sourceWidth = Number(video?.width) || 1;
    const sourceHeight = Number(video?.height) || 1;
    const left = Math.max(0, Math.round(Number(options.left) || 0));
    const top = Math.max(0, Math.round(Number(options.top) || 0));
    const width = Math.max(1, Math.min(Math.round(Number(options.width) || sourceWidth), sourceWidth - left));
    const height = Math.max(1, Math.min(Math.round(Number(options.height) || sourceHeight), sourceHeight - top));
    filters.push(`crop=${width}:${height}:${left}:${top}`);
  }
  if (action === 'rotate') {
    const degrees = [90, 180, 270].includes(Number(options.degrees)) ? Number(options.degrees) : 90;
    filters.push(degrees === 90 ? 'transpose=1' : degrees === 270 ? 'transpose=2' : 'hflip,vflip');
  }
  if (action === 'grayscale') filters.push('format=gray');

  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', inputPath];
  if (filters.length) args.push('-vf', filters.join(','));
  args.push('-frames:v', '1');
  if (action === 'clean' || !options.keepMetadata) args.push('-map_metadata', '-1');
  args.push(...imageCodecArgs(format, action === 'compress' ? (options.quality || 62) : options.quality), outputPath);
  await run(ffmpegPath(), args);
  return outputPath;
}

function mediaOutput(action, inputExt, options) {
  if (action === 'extract-audio') return options.format || 'mp3';
  if (action === 'compress') return AUDIO_INPUTS.has(inputExt) ? 'mp3' : 'mp4';
  return (options.format || inputExt).toLowerCase();
}

function mediaCodecArgs(format, quality) {
  const q = Math.max(1, Math.min(100, Number(quality) || 82));
  const crf = String(Math.round(36 - q * 0.2));
  if (format === 'mp3') return ['-vn', '-c:a', 'libmp3lame', '-q:a', String(Math.max(0, Math.round(9 - q / 12)))];
  if (format === 'wav') return ['-vn', '-c:a', 'pcm_s16le'];
  if (format === 'm4a' || format === 'aac') return ['-vn', '-c:a', 'aac', '-b:a', q > 80 ? '256k' : '160k'];
  if (format === 'ogg' || format === 'opus') return ['-vn', '-c:a', 'libopus', '-b:a', q > 80 ? '192k' : '128k'];
  if (format === 'flac') return ['-vn', '-c:a', 'flac'];
  if (format === 'webm') return ['-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k'];
  if (format === 'gif') return ['-vf', 'fps=12,scale=960:-1:flags=lanczos'];
  return ['-c:v', 'libx264', '-crf', crf, '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'];
}

async function processMedia(inputPath, action, options, outputDirectory) {
  const inputExt = extensionOf(inputPath);
  const format = mediaOutput(action, inputExt, options);
  const suffixes = { compress: 'comprimido', trim: 'trecho', clean: 'sem-metadados', 'extract-audio': 'audio' };
  const outputPath = await uniquePath(outputDirectory, `${safeStem(inputPath)}-${suffixes[action] || 'convertido'}`, format);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  if (action === 'trim') args.push('-ss', String(Math.max(0, Number(options.start) || 0)));
  args.push('-i', inputPath);
  if (action === 'trim' && Number(options.duration) > 0) args.push('-t', String(Number(options.duration)));
  if (action === 'clean') args.push('-map_metadata', '-1', '-c', 'copy');
  else args.push(...mediaCodecArgs(format, action === 'compress' ? (options.quality || 58) : options.quality));
  if (['mp4', 'mov', 'm4a'].includes(format)) args.push('-movflags', '+faststart');
  args.push(outputPath);
  await run(ffmpegPath(), args);
  return outputPath;
}

function officeCandidates() {
  if (process.platform === 'win32') return [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
    'soffice.exe',
  ];
  if (process.platform === 'darwin') return ['/Applications/LibreOffice.app/Contents/MacOS/soffice', 'soffice'];
  return ['soffice', '/usr/bin/soffice', '/usr/local/bin/soffice'];
}

async function processDocument(inputPath, options, outputDirectory) {
  const format = String(options.format || 'pdf').toLowerCase();
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'orbita-office-'));
  let lastError;
  try {
    for (const executable of officeCandidates()) {
      try {
        await run(executable, ['--headless', '--convert-to', format, '--outdir', tempDirectory, inputPath], { timeout: 4 * 60_000 });
        const generated = path.join(tempDirectory, `${path.basename(inputPath, path.extname(inputPath))}.${format}`);
        await access(generated);
        const outputPath = await uniquePath(outputDirectory, `${safeStem(inputPath)}-convertido`, format);
        await rename(generated, outputPath).catch(async () => copyFile(generated, outputPath));
        return outputPath;
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
  throw new Error(`LibreOffice não encontrado ou não conseguiu converter o arquivo. ${lastError?.message || ''}`.trim());
}

async function processFiles({ paths, action, options = {}, outputDirectory }, onProgress = () => {}) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Nenhum arquivo recebido.');
  if (paths.length > 30) throw new Error('Processe no máximo 30 arquivos por vez.');
  const results = [];
  for (let index = 0; index < paths.length; index += 1) {
    const inputPath = path.resolve(paths[index]);
    const info = await stat(inputPath);
    if (!info.isFile()) throw new Error(`${path.basename(inputPath)} não é um arquivo.`);
    const category = categoryOf(inputPath);
    if (category === 'unknown') throw new Error(`Formato .${extensionOf(inputPath) || '?'} não suportado.`);
    const destination = outputDirectory ? path.resolve(outputDirectory) : path.join(path.dirname(inputPath), 'Orbita');
    onProgress({ index, total: paths.length, percent: Math.round((index / paths.length) * 100), name: path.basename(inputPath) });
    let outputPath;
    if (category === 'image') outputPath = await processImage(inputPath, action, options, destination);
    else if (category === 'video' || category === 'audio') outputPath = await processMedia(inputPath, action, options, destination);
    else if (category === 'document' && action === 'convert') outputPath = await processDocument(inputPath, options, destination);
    else throw new Error(`A ação “${action}” não está disponível para este tipo de arquivo.`);
    results.push({ inputPath, outputPath, name: path.basename(outputPath) });
    onProgress({ index: index + 1, total: paths.length, percent: Math.round(((index + 1) / paths.length) * 100), name: path.basename(inputPath) });
  }
  return results;
}

module.exports = { categoryOf, extensionOf, inspectFiles, processFiles };
