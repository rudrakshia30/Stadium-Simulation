/**
 * App root component — routing between Fan and Ops views.
 */
import { useState } from 'react';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import NavBar from './components/shared/NavBar.jsx';
import FanPage from './pages/FanPage.jsx';
import OpsPage from './pages/OpsPage.jsx';

export default function App() {
  const [activeView, setActiveView] = useState('fan'); // 'fan' | 'ops'

  return (
    <ToastProvider>
      <AuthProvider>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <div className="app-layout">
          <NavBar activeView={activeView} onViewChange={setActiveView} />
          <main id="main-content" className="page">
            {activeView === 'fan' ? <FanPage /> : <OpsPage />}
          </main>
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}
