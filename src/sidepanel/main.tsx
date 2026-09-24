import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { t, uiLanguage, isRtl } from '../shared/i18n';
import './styles.css';

// Reflect the browser UI language on <html> so assistive tech, line breaking,
// and right-to-left layout (Arabic) follow the localized copy. Chrome already
// picks the _locales catalog from this same language for chrome.i18n.
const language = uiLanguage();
document.documentElement.lang = language;
document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
document.title = t('panelTitle');

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main><h1>help-me-fill</h1><p role="alert">{t('errorBoundary')}</p></main> : this.props.children;
  }
}
const available = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
createRoot(document.getElementById('root')!).render(<ErrorBoundary>{available ? <App /> : <main><h1>help-me-fill</h1><p>{t('needsExtension')}</p></main>}</ErrorBoundary>);
