import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Overlay from './Overlay.jsx';
import './styles.css';

const mode = new URLSearchParams(window.location.search).get('mode');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {mode === 'overlay' ? <Overlay /> : <App />}
  </React.StrictMode>,
);
