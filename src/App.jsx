import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  ArrowRight,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Crop,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  Film,
  Folder,
  FolderOpen,
  History,
  ImageMinus,
  Images,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  MonitorUp,
  Music2,
  Palette,
  Plus,
  RotateCw,
  Scissors,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';

const api = window.orbita;

const CONVERSIONS = {
  image: ['jpg', 'png', 'webp', 'avif', 'gif', 'tiff'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'gif', 'mp3'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'flac'],
  document: ['pdf', 'docx', 'odt', 'rtf', 'txt'],
};

const TOOLS = {
  image: [
    { id: 'compress', label: 'Comprimir', icon: CircleGauge },
    { id: 'resize', label: 'Redimensionar', icon: Maximize2 },
    { id: 'crop', label: 'Recortar', icon: Crop },
    { id: 'rotate', label: 'Girar', icon: RotateCw },
    { id: 'grayscale', label: 'Preto e branco', icon: Palette },
    { id: 'clean', label: 'Limpar dados', icon: ShieldCheck },
  ],
  video: [
    { id: 'compress', label: 'Comprimir', icon: CircleGauge },
    { id: 'trim', label: 'Cortar trecho', icon: Scissors },
    { id: 'extract-audio', label: 'Extrair áudio', icon: Music2 },
    { id: 'clean', label: 'Limpar dados', icon: ShieldCheck },
  ],
  audio: [
    { id: 'compress', label: 'Comprimir', icon: CircleGauge },
    { id: 'trim', label: 'Cortar trecho', icon: Scissors },
    { id: 'clean', label: 'Limpar dados', icon: ShieldCheck },
  ],
  document: [],
};

const ACTION_NAMES = {
  convert: 'Converter',
  compress: 'Comprimir',
  resize: 'Redimensionar',
  crop: 'Recortar',
  rotate: 'Girar',
  grayscale: 'Preto e branco',
  clean: 'Remover metadados',
  trim: 'Cortar trecho',
  'extract-audio': 'Extrair áudio',
};

function prettySize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function prettyDuration(seconds = 0) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function iconFor(category, size = 22) {
  if (category === 'image') return <FileImage size={size} />;
  if (category === 'video') return <Film size={size} />;
  if (category === 'audio') return <FileAudio size={size} />;
  if (category === 'document') return <FileText size={size} />;
  return <File size={size} />;
}

function defaultOptions(file, action, format) {
  const quality = action === 'compress' ? 62 : 84;
  return {
    format: format || (action === 'extract-audio' ? 'mp3' : file?.extension),
    quality,
    width: file?.width || 1920,
    height: file?.height || 1080,
    left: 0,
    top: 0,
    fit: 'inside',
    degrees: 90,
    start: 0,
    duration: file?.duration ? Math.min(30, Math.round(file.duration)) : 10,
    keepMetadata: false,
  };
}

function conversionFormats(file) {
  if (!file) return [];
  let formats = CONVERSIONS[file.category] || [];
  if (file.category === 'document') {
    if (['xls', 'xlsx', 'ods', 'csv'].includes(file.extension)) formats = ['pdf', 'xlsx', 'ods', 'csv'];
    if (['ppt', 'pptx', 'odp'].includes(file.extension)) formats = ['pdf', 'pptx', 'odp'];
  }
  return formats.filter((format, index) => format !== file.extension && formats.indexOf(format) === index);
}

function OrbitaMark({ small = false }) {
  return (
    <span className={`orbita-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <span className="mark-orbit" />
      <span className="mark-core" />
    </span>
  );
}

function Titlebar() {
  return (
    <div className="titlebar">
      <div className="titlebar-brand"><OrbitaMark small /><span>orbita</span></div>
      <div className="titlebar-copy">conversor local</div>
      <div className="window-controls">
        <button aria-label="Minimizar" onClick={() => api?.window.minimize()}><Minus size={15} /></button>
        <button aria-label="Maximizar" onClick={() => api?.window.maximize()}><Maximize2 size={13} /></button>
        <button className="close" aria-label="Fechar" onClick={() => api?.window.close()}><X size={16} /></button>
      </div>
    </div>
  );
}

function RadialMenu({ file, mode, selected, onMode, onSelect, onClose }) {
  const entries = mode === 'convert'
    ? conversionFormats(file).map((format) => ({ id: `format:${format}`, label: format.toUpperCase(), sub: 'Converter', icon: null }))
    : (TOOLS[file?.category] || []);

  return (
    <div className="radial-backdrop" role="dialog" aria-modal="true" aria-label="Ações do arquivo" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="radial-scene">
        <div className="radial-halo halo-one" />
        <div className="radial-halo halo-two" />
        {entries.map((entry, index) => {
          const angle = -90 + (360 / Math.max(entries.length, 1)) * index;
          const radius = entries.length > 6 ? 190 : 178;
          const Icon = entry.icon;
          return (
            <button
              className={`radial-item ${selected?.id === entry.id ? 'selected' : ''}`}
              style={{ '--angle': `${angle}deg`, '--radius': `${radius}px` }}
              key={entry.id}
              onClick={() => onSelect(entry)}
            >
              <span className="radial-item-inner">
                {Icon ? <Icon size={19} /> : <strong>{entry.label}</strong>}
                <small>{Icon ? entry.label : entry.sub}</small>
              </span>
            </button>
          );
        })}

        <div className="radial-center">
          <span className={`center-file ${file?.category}`}>{iconFor(file?.category, 30)}</span>
          <strong title={file?.name}>{file?.name}</strong>
          <small>{prettySize(file?.size)} · {file?.extension?.toUpperCase()}</small>
          <div className="radial-tabs" role="tablist">
            <button className={mode === 'convert' ? 'active' : ''} onClick={() => onMode('convert')}>Formatos</button>
            <button className={mode === 'tools' ? 'active' : ''} disabled={!TOOLS[file?.category]?.length} onClick={() => onMode('tools')}>Ferramentas</button>
          </div>
        </div>
        <button className="radial-close" aria-label="Fechar menu" onClick={onClose}><X size={18} /></button>
      </div>
    </div>
  );
}

function ActionPanel({ file, selected, options, onOptions, onRun, onBack, processing }) {
  if (!selected) return null;
  const action = selected.id.startsWith('format:') ? 'convert' : selected.id;
  const format = selected.id.startsWith('format:') ? selected.id.split(':')[1] : options.format;
  const isQuality = ['convert', 'compress'].includes(action) && ['image', 'video', 'audio'].includes(file.category);

  const set = (key, value) => onOptions({ ...options, [key]: value });

  return (
    <div className="action-panel">
      <div className="action-panel-title">
        <button onClick={onBack} aria-label="Voltar ao menu"><ChevronRight size={18} /></button>
        <span><small>Ação selecionada</small><strong>{ACTION_NAMES[action]}{format ? ` · ${String(format).toUpperCase()}` : ''}</strong></span>
      </div>

      <div className="action-fields">
        {isQuality && (
          <label className="field range-field">
            <span>Qualidade <b>{options.quality}%</b></span>
            <input type="range" min="20" max="100" value={options.quality} onChange={(event) => set('quality', Number(event.target.value))} />
          </label>
        )}
        {action === 'resize' && <>
          <label className="field"><span>Largura</span><input type="number" min="1" max="20000" value={options.width} onChange={(event) => set('width', event.target.value)} /></label>
          <label className="field"><span>Altura</span><input type="number" min="1" max="20000" value={options.height} onChange={(event) => set('height', event.target.value)} /></label>
          <label className="field"><span>Ajuste</span><select value={options.fit} onChange={(event) => set('fit', event.target.value)}><option value="inside">Conter</option><option value="cover">Preencher</option><option value="fill">Esticar</option></select></label>
        </>}
        {action === 'crop' && <>
          <label className="field"><span>X</span><input type="number" min="0" value={options.left} onChange={(event) => set('left', event.target.value)} /></label>
          <label className="field"><span>Y</span><input type="number" min="0" value={options.top} onChange={(event) => set('top', event.target.value)} /></label>
          <label className="field"><span>Largura</span><input type="number" min="1" value={options.width} onChange={(event) => set('width', event.target.value)} /></label>
          <label className="field"><span>Altura</span><input type="number" min="1" value={options.height} onChange={(event) => set('height', event.target.value)} /></label>
        </>}
        {action === 'rotate' && (
          <label className="field"><span>Ângulo</span><select value={options.degrees} onChange={(event) => set('degrees', Number(event.target.value))}><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>
        )}
        {action === 'trim' && <>
          <label className="field"><span>Início (s)</span><input type="number" min="0" step="0.1" value={options.start} onChange={(event) => set('start', event.target.value)} /></label>
          <label className="field"><span>Duração (s)</span><input type="number" min="0.1" step="0.1" value={options.duration} onChange={(event) => set('duration', event.target.value)} /></label>
        </>}
        {action === 'extract-audio' && (
          <label className="field"><span>Formato</span><select value={options.format} onChange={(event) => set('format', event.target.value)}><option value="mp3">MP3</option><option value="wav">WAV</option><option value="m4a">M4A</option><option value="flac">FLAC</option></select></label>
        )}
        {['clean', 'grayscale'].includes(action) && <div className="no-options"><Sparkles size={18} /> Pronto para processar localmente.</div>}
      </div>

      <button className="run-action" disabled={processing} onClick={() => onRun(action, format)}>
        {processing ? <><span className="spinner" /> Processando…</> : <><Zap size={18} /> Executar agora <ArrowRight size={17} /></>}
      </button>
    </div>
  );
}

export default function App() {
  const [files, setFiles] = useState([]);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelMode, setWheelMode] = useState('convert');
  const [selected, setSelected] = useState(null);
  const [options, setOptions] = useState(defaultOptions());
  const [dragging, setDragging] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [progressName, setProgressName] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [outputDirectory, setOutputDirectory] = useState(null);
  const [view, setView] = useState('workspace');
  const dragDepth = useRef(0);
  const firstFile = files[0];
  const processing = status === 'processing';

  useEffect(() => {
    const keyDown = (event) => event.key === 'Shift' && setShiftHeld(true);
    const keyUp = (event) => event.key === 'Shift' && setShiftHeld(false);
    const blur = () => setShiftHeld(false);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => api?.onProgress(({ percent, name }) => {
    setProgress(percent);
    setProgressName(name || '');
  }), []);

  const formats = useMemo(() => conversionFormats(firstFile), [firstFile]);

  const loadPaths = async (paths, openWheel = true) => {
    if (!api || !paths?.length || processing) return;
    setMessage('');
    setStatus('idle');
    try {
      const inspected = await api.inspectFiles(paths);
      if (!inspected.length) throw new Error('Nenhum arquivo válido foi selecionado.');
      if (inspected.some((item) => item.category === 'unknown')) throw new Error('Um ou mais formatos ainda não são suportados.');
      if (!inspected.every((item) => item.category === inspected[0].category)) throw new Error('Selecione arquivos da mesma categoria por vez.');
      setFiles(inspected);
      setWheelMode('convert');
      setSelected(null);
      setOptions(defaultOptions(inspected[0]));
      setWheelOpen(openWheel);
      setView('workspace');
    } catch (error) {
      setMessage(error.message || 'Não foi possível abrir os arquivos.');
      setStatus('error');
    }
  };

  const chooseFiles = async () => loadPaths(await api?.chooseFiles(), true);

  const handleDrop = async (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const paths = api?.pathsFromFiles(event.dataTransfer.files) || [];
    await loadPaths(paths, true);
  };

  const chooseEntry = (entry) => {
    const action = entry.id.startsWith('format:') ? 'convert' : entry.id;
    const format = entry.id.startsWith('format:') ? entry.id.split(':')[1] : undefined;
    setSelected(entry);
    setOptions(defaultOptions(firstFile, action, format));
    setWheelOpen(false);
  };

  const runAction = async (action, format) => {
    if (!files.length || processing) return;
    const jobId = `${Date.now()}`;
    setStatus('processing');
    setProgress(2);
    setMessage('');
    const response = await api.processFiles({
      jobId,
      paths: files.map((file) => file.path),
      action,
      options: { ...options, format: format || options.format },
      outputDirectory,
    });
    if (response.ok) {
      setStatus('done');
      setProgress(100);
      setHistory((current) => [{ id: jobId, action: ACTION_NAMES[action], date: new Date(), results: response.results }, ...current]);
      setMessage(`${response.results.length} ${response.results.length === 1 ? 'arquivo pronto' : 'arquivos prontos'}.`);
    } else {
      setStatus('error');
      setMessage(response.error);
    }
  };

  const chooseOutput = async () => {
    const directory = await api?.chooseOutputDirectory();
    if (directory) setOutputDirectory(directory);
  };

  const clearWorkspace = () => {
    if (processing) return;
    setFiles([]);
    setSelected(null);
    setWheelOpen(false);
    setStatus('idle');
    setProgress(0);
    setMessage('');
  };

  return (
    <div className={`desktop-app ${dragging ? 'is-dragging' : ''}`}>
      <Titlebar />
      <aside className="sidebar">
        <div className="sidebar-logo"><OrbitaMark /><div><strong>orbita</strong><small>LOCAL FILE LAB</small></div></div>
        <nav>
          <button className={view === 'workspace' ? 'active' : ''} onClick={() => setView('workspace')}><Aperture size={19} /><span>Espaço</span></button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={19} /><span>Histórico</span>{history.length > 0 && <b>{history.length}</b>}</button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings2 size={19} /><span>Ajustes</span></button>
        </nav>
        <div className="sidebar-status"><span><i /> Tudo local</span><small>Nenhum upload</small></div>
      </aside>

      <main className="main-content">
        {view === 'workspace' && <>
          <header className="page-heading">
            <div><span className="kicker">WORKSPACE</span><h1>O que vamos <em>transformar?</em></h1></div>
            <button className="add-files" onClick={chooseFiles}><Plus size={18} /> Adicionar arquivos</button>
          </header>

          <section
            className={`drop-stage ${files.length ? 'has-files' : ''} ${shiftHeld ? 'shift-ready' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setShiftHeld(event.shiftKey); }}
            onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) { setDragging(false); dragDepth.current = 0; } }}
            onDrop={handleDrop}
          >
            <div className="stage-glow glow-a" /><div className="stage-glow glow-b" />
            <div className="stage-grid" />
            {!files.length ? (
              <button className="drop-target" onClick={chooseFiles}>
                <span className="drop-orbit"><span /><span /><MonitorUp size={31} /></span>
                <h2>{dragging ? 'Solte para abrir a órbita' : 'Arraste qualquer arquivo'}</h2>
                <p>Segure <kbd>Shift</kbd> enquanto arrasta para revelar o menu circular</p>
                <span className="choose-link">ou escolha no computador <ArrowRight size={15} /></span>
              </button>
            ) : (
              <div className="loaded-workspace">
                <div className="file-stack">
                  {files.slice(0, 3).map((file, index) => (
                    <div className={`file-card card-${index}`} key={file.path} style={{ '--stack-index': index }}>
                      <span className={`file-card-icon ${file.category}`}>{iconFor(file.category, 31)}</span>
                      <strong>{file.name}</strong>
                      <small>{prettySize(file.size)}{file.duration ? ` · ${prettyDuration(file.duration)}` : ''}</small>
                    </div>
                  ))}
                  {files.length > 3 && <span className="more-files">+{files.length - 3}</span>}
                </div>
                <div className="workspace-copy">
                  <span className="ready-pill"><Check size={13} /> {files.length} {files.length === 1 ? 'arquivo pronto' : 'arquivos prontos'}</span>
                  <h2>Escolha o próximo movimento</h2>
                  <p>Abra a órbita para converter ou usar ferramentas rápidas.</p>
                  <div className="workspace-actions">
                    <button className="open-orbit" onClick={() => setWheelOpen(true)}><OrbitaMark small /> Abrir órbita</button>
                    <button className="clear-action" onClick={clearWorkspace}><Trash2 size={16} /> Limpar</button>
                  </div>
                </div>
              </div>
            )}
            <div className="stage-caption"><ShieldCheck size={14} /> Seus arquivos nunca saem deste computador</div>
          </section>

          {selected && files.length > 0 && (
            <ActionPanel file={firstFile} selected={selected} options={options} onOptions={setOptions} onRun={runAction} onBack={() => setWheelOpen(true)} processing={processing} />
          )}

          {processing && (
            <div className="progress-card">
              <div><span className="spinner" /><p><strong>Transformando {progressName || firstFile?.name}</strong><small>Processamento local em andamento</small></p><b>{progress}%</b></div>
              <span className="progress-track"><i style={{ width: `${progress}%` }} /></span>
            </div>
          )}

          {status === 'done' && history[0] && (
            <div className="result-card">
              <span className="result-check"><Check size={22} /></span>
              <div><strong>{message}</strong><small>Salvo em {outputDirectory || 'uma pasta “Orbita” ao lado do original'}</small></div>
              <div className="result-actions">
                {history[0].results.length === 1 && <button onClick={() => api.openFile(history[0].results[0].outputPath)}><FolderOpen size={16} /> Abrir</button>}
                <button onClick={() => api.revealFile(history[0].results[0].outputPath)}><Folder size={16} /> Mostrar na pasta</button>
              </div>
            </div>
          )}

          {status === 'error' && <div className="error-card"><Info size={18} /><span><strong>Não foi possível concluir</strong><small>{message}</small></span><button onClick={() => setStatus('idle')}><X size={16} /></button></div>}

          <div className="capability-row">
            <span><Images size={18} /><b>Imagens</b><small>Converter, cortar e comprimir</small></span>
            <span><Film size={18} /><b>Vídeo</b><small>Converter, cortar e extrair áudio</small></span>
            <span><FileText size={18} /><b>Documentos</b><small>Via LibreOffice instalado</small></span>
          </div>
        </>}

        {view === 'history' && (
          <section className="subview">
            <header><span className="kicker">HISTÓRICO DA SESSÃO</span><h1>Arquivos <em>prontos.</em></h1></header>
            {!history.length ? <div className="empty-state"><History size={34} /><strong>Ainda não há conversões</strong><p>Os resultados desta sessão aparecerão aqui.</p></div> : (
              <div className="history-list">{history.map((job) => job.results.map((result) => (
                <article key={result.outputPath}><span><Download size={20} /></span><div><strong>{result.name}</strong><small>{job.action} · {job.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><button onClick={() => api.revealFile(result.outputPath)}><FolderOpen size={17} /> Mostrar</button></article>
              )))}</div>
            )}
          </section>
        )}

        {view === 'settings' && (
          <section className="subview settings-view">
            <header><span className="kicker">PREFERÊNCIAS</span><h1>Seu fluxo, <em>do seu jeito.</em></h1></header>
            <div className="setting-card"><span><Folder size={22} /></span><div><strong>Pasta de saída</strong><small>{outputDirectory || 'Criar pasta “Orbita” junto ao arquivo original'}</small></div><button onClick={chooseOutput}>{outputDirectory ? 'Alterar' : 'Escolher'}</button>{outputDirectory && <button className="reset-setting" onClick={() => setOutputDirectory(null)}>Restaurar</button>}</div>
            <div className="setting-card"><span><ShieldCheck size={22} /></span><div><strong>Privacidade local</strong><small>O Orbita não possui servidor, conta ou telemetria.</small></div><b className="on-badge">Sempre ativo</b></div>
            <div className="setting-note"><Info size={17} /><p>Conversões de documentos dependem do LibreOffice instalado. Imagens, áudio e vídeo usam mecanismos incluídos no aplicativo.</p></div>
          </section>
        )}
      </main>

      {wheelOpen && firstFile && (
        <RadialMenu file={firstFile} mode={wheelMode} selected={selected} onMode={(next) => { setWheelMode(next); setSelected(null); }} onSelect={chooseEntry} onClose={() => setWheelOpen(false)} />
      )}
    </div>
  );
}
