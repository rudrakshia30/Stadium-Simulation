/**
 * Fan Page — complete fan experience interface
 * Includes: AI chat, venue map, route finder, language selector, accessibility options
 */
import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client.js';
import VenueMap from '../components/fan/VenueMap.jsx';
import ChatWindow from '../components/fan/ChatWindow.jsx';
import RoutePanel from '../components/fan/RoutePanel.jsx';
import AccessibilityPanel from '../components/fan/AccessibilityPanel.jsx';
import styles from './FanPage.module.css';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
];

export default function FanPage() {
  const [activeTab, setActiveTab] = useState('chat');
  const [language, setLanguage] = useState('en');
  const [preferences, setPreferences] = useState({
    wheelchair: false,
    stepFree: false,
    avoidStairs: false,
    avoidCrowds: false,
    elderly: false,
    sensoryFriendly: false,
  });
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [venueData, setVenueData] = useState(null);

  useEffect(() => {
    api.venue()
      .then((data) => setVenueData(data))
      .catch(() => {});
  }, []);

  const handleRouteSelect = useCallback((from, to) => {
    setActiveTab('route');
    setSelectedRoute({ from, to });
  }, []);

  const needsAccessibleInfo =
    preferences.wheelchair || preferences.stepFree || preferences.elderly;

  return (
    <div className={styles.page} id="panel-fan" role="tabpanel" aria-labelledby="tab-fan">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.title}>
              <span className="gradient-text">Fan AI Assistant</span>
            </h1>
            <p className={styles.subtitle}>
              Your intelligent guide to Unity Arena. Ask anything.
            </p>
          </div>

          <div className={styles.headerControls}>
            {/* Language selector */}
            <div className={styles.langSelector}>
              <label htmlFor="lang-select" className="visually-hidden">Select language</label>
              <select
                id="lang-select"
                className="form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Select language"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Accessibility quick-toggles */}
        {needsAccessibleInfo && (
          <div className={styles.accessBanner} role="status" aria-live="polite">
            <span>♿</span>
            <span>Accessibility preferences active — all routes will prioritise accessible paths</span>
          </div>
        )}
      </header>

      {/* Tab navigation */}
      <div className={styles.tabBar}>
        <div className="tabs" role="tablist" aria-label="Fan assistant sections">
          {[
            { id: 'chat', label: 'AI Chat', icon: '💬' },
            { id: 'map', label: 'Venue Map', icon: '🗺️' },
            { id: 'route', label: 'Route Finder', icon: '🧭' },
            { id: 'accessibility', label: 'Accessibility', icon: '♿' },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`fan-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`fan-panel-${tab.id}`}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      <div className={styles.content}>
        <div
          id="fan-panel-chat"
          role="tabpanel"
          aria-labelledby="fan-tab-chat"
          hidden={activeTab !== 'chat'}
          className={styles.panel}
        >
          <ChatWindow
            language={language}
            preferences={preferences}
            onRouteRequest={handleRouteSelect}
          />
        </div>

        <div
          id="fan-panel-map"
          role="tabpanel"
          aria-labelledby="fan-tab-map"
          hidden={activeTab !== 'map'}
          className={styles.panel}
        >
          <VenueMap
            venueData={venueData}
            preferences={preferences}
            onRouteRequest={handleRouteSelect}
          />
        </div>

        <div
          id="fan-panel-route"
          role="tabpanel"
          aria-labelledby="fan-tab-route"
          hidden={activeTab !== 'route'}
          className={styles.panel}
        >
          <RoutePanel
            initialRoute={selectedRoute}
            preferences={preferences}
            venueData={venueData}
          />
        </div>

        <div
          id="fan-panel-accessibility"
          role="tabpanel"
          aria-labelledby="fan-tab-accessibility"
          hidden={activeTab !== 'accessibility'}
          className={styles.panel}
        >
          <AccessibilityPanel
            preferences={preferences}
            onPreferencesChange={setPreferences}
          />
        </div>
      </div>

      <footer className="disclaimer">
        CrowdSphere AI is an independent demonstration prototype using simulated data. Not affiliated with FIFA.
        All crowd data is fictional. In an emergency, contact venue staff directly.
      </footer>
    </div>
  );
}
