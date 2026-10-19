import { useEffect, useMemo, useState } from 'react';
import { Check, CircleGauge, Crop, File, FileAudio, FileImage, FileText, Film, Maximize2, Music2, Palette, RotateCw, Scissors, ShieldCheck, X } from 'lucide-react';

const api = window.orbita;
const FORMATS = {
  image: ['jpg', 'png', 'webp', 'avif', 'gif', 'tiff'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'gif', 'mp3'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'flac'],
  document: ['pdf', 'docx', 'odt', 'rtf', 'txt'],
};
const TOOL_ITEMS = {
  image: [
    { id: 'compress', label: 'Comprimir', icon: CircleGauge },
    { id: 'resize', label: '50% menor', icon: Maximize2 },
    { id: 'crop', label: 'Quadrado', icon: Crop },
    { id: 'rotate', label: 'Girar 90°', icon: RotateCw },
    { id: 'grayscale', label: 'P&B', icon: Palette },
    { id: 'clean', label: 'Limpar dados', icon: ShieldCheck },
  ],
  video: [
    { id: 'compress', label: 'Comprimir', icon: CircleGauge },
    { id: 'trim', label: '30 segundos', icon: Scissors },
    { id: 'extract-audio', label: 'Extrair MP3', icon: Music2 },
    { id: 'clean', label: 'Limpar dados', icon: ShieldCheck },
  ],
  audio: [
    { id: 'compress', label: 'Comprimir', icon: CircleGauge },
    { id: 'trim', label: '30 segundos', icon: Scissors },
    { id: 'clean', label: 'Limpar dados', icon: ShieldCheck },
  ],
  document: [],
};

function fileIcon(category) {
  if (category === 'image') return <FileImage />;
  if (category === 'video') return <Film />;
  if (category === 'audio') return <FileAudio />;
  if (category === 'document') return <FileText />;
  return <File />;
}

function optionsFor(file, action, format) {
  const side = Math.max(1, Math.min(file.width || 1000, file.height || 1000));
  return {
    format: format || (action === 'extract-audio' ? 'mp3' : file.extension),
    quality: action === 'compress' ? 62 : 84,
    width: action === 'crop' ? side : Math.max(1, Math.round((file.width || 1920) / 2)),
    height: action === 'crop' ? side : Math.max(1, Math.round((file.height || 1080) / 2)),
    left: action === 'crop' ? Math.max(0, Math.round(((file.width || side) - side) / 2)) : 0,
    top: action === 'crop' ? Math.max(0, Math.round(((file.height || side) - side) / 2)) : 0,
    fit: 'inside',
    degrees: 90,
    start: 0,
    duration: Math.min(30, Math.max(1, Math.round(file.duration || 30))),
  };
}

export default function Overlay() {
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState('convert');
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Lendo arquivo…');
  const first = files[0];

  useEffect(() => {
    let alive = true;
    api.getOverlayFiles().then((paths) => api.inspectFiles(paths)).then((items) => {
      if (!alive) return;
      if (!items.length || items.some((item) => item.category === 'unknown')) throw new Error('Formato não suportado.');
      if (!items.every((item) => item.category === items[0].category)) throw new Error('Use arquivos da mesma categoria.');
      setFiles(items);
      setStatus('ready');
      setMessage('');
    }).catch((error) => {
      setStatus('error');
      setMessage(error.message || 'Não foi possível abrir o arquivo.');
    });
    const removeProgress = api.onProgress(({ percent }) => setProgress(percent));
    const closeOnEscape = (event) => event.key === 'Escape' && api.closeOverlay();
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      alive = false;
      removeProgress?.();
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const items = useMemo(() => {
    if (!first) return [];
    if (mode === 'tools') return TOOL_ITEMS[first.category] || [];
    let formats = FORMATS[first.category] || [];
    if (first.category === 'document') {
      if (['xls', 'xlsx', 'ods', 'csv'].includes(first.extension)) formats = ['pdf', 'xlsx', 'ods', 'csv'];
      if (['ppt', 'pptx', 'odp'].includes(first.extension)) formats = ['pdf', 'pptx', 'odp'];
    }
    return formats.filter((format) => format !== first.extension).map((format) => ({ id: `format:${format}`, label: format.toUpperCase() }));
  }, [first, mode]);

  const run = async (item) => {
    if (!first || status === 'processing') return;
    const format = item.id.startsWith('format:') ? item.id.split(':')[1] : undefined;
    const action = format ? 'convert' : item.id;
    setStatus('processing');
    setProgress(4);
    setMessage(item.label);
    const response = await api.processFiles({
      jobId: String(Date.now()),
      paths: files.map((file) => file.path),
      action,
      options: optionsFor(first, action, format),
      overlay: true,
    });
    if (response.ok) {
      setProgress(100);
      setStatus('done');
      setMessage(response.results.length === 1 ? 'Arquivo pronto' : `${response.results.length} arquivos prontos`);
      setTimeout(() => api.closeOverlay(), 1350);
    } else {
      setStatus('error');
      setMessage(response.error);
    }
  };

  return (
    <div className="overlay-app">
      <button className="overlay-close" aria-label="Fechar" onClick={() => api.closeOverlay()}><X /></button>
      <div className={`overlay-orbit ${status}`}>
        <span className="overlay-ring ring-a" /><span className="overlay-ring ring-b" />
        {status === 'ready' && items.map((item, index) => {
          const angle = -90 + (360 / Math.max(items.length, 1)) * index;
          const Icon = item.icon;
          return (
            <button className="overlay-action" style={{ '--angle': `${angle}deg` }} key={item.id} onClick={() => run(item)}>
              {Icon ? <Icon /> : <b>{item.label}</b>}<small>{Icon ? item.label : 'Converter'}</small>
            </button>
          );
        })}
        <div className="overlay-center">
          {status === 'ready' && <>
            <span className={`overlay-file ${first?.category}`}>{fileIcon(first?.category)}</span>
            <strong>{first?.name}</strong>
            {files.length > 1 && <small>+ {files.length - 1} arquivos</small>}
            <div className="overlay-tabs">
              <button className={mode === 'convert' ? 'active' : ''} onClick={() => setMode('convert')}>Formatos</button>
              <button className={mode === 'tools' ? 'active' : ''} disabled={!TOOL_ITEMS[first?.category]?.length} onClick={() => setMode('tools')}>Ferramentas</button>
            </div>
          </>}
          {status === 'loading' && <><span className="overlay-spinner" /><strong>Lendo arquivo…</strong></>}
          {status === 'processing' && <><span className="overlay-spinner" /><strong>{message}</strong><small>{progress}%</small><span className="overlay-progress"><i style={{ width: `${progress}%` }} /></span></>}
          {status === 'done' && <><span className="overlay-success"><Check /></span><strong>{message}</strong><small>Salvo na pasta Orbita</small></>}
          {status === 'error' && <><span className="overlay-error">!</span><strong>Não foi possível</strong><small>{message}</small><button className="overlay-dismiss" onClick={() => api.closeOverlay()}>Fechar</button></>}
        </div>
      </div>
    </div>
  );
}
