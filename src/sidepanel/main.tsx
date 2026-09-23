import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main><h1>help-me-fill</h1><p role="alert">The panel encountered a problem. Close and reopen it to start a fresh session. Inspect your form before retrying.</p></main> : this.props.children;
  }
}
const available = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
createRoot(document.getElementById('root')!).render(<ErrorBoundary>{available ? <App /> : <main><h1>help-me-fill</h1><p>This UI needs extension APIs. Build the project, load dist/ unpacked in Chrome or Edge, and click the extension toolbar icon.</p></main>}</ErrorBoundary>);
