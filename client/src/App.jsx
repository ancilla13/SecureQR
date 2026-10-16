import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, QrCode, ShieldCheck, Users, Radio, Menu, X, ArrowUpRight } from 'lucide-react';
import Home from './pages/Home';
import CreateSign from './pages/CreateSign';
import Scanner from './pages/Scanner';
import TrustedContacts from './pages/TrustedContacts';
import LanChat from './pages/LanChat';
import { LanProvider, useLan } from './context/LanContext';
import './styles/index.css';
import './styles/layout.css';

function NavigationBar() {
  const { connectionStatus, unreadCount } = useLan();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sysTime, setSysTime] = useState('');

  // Live UTC system clock in inspiration style: HH:MM:SS UTC+0
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      const seconds = String(now.getUTCSeconds()).padStart(2, '0');
      setSysTime(`${hours}:${minutes}:${seconds}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="navbar-wrapper">
      <nav className="navbar">
        {/* Left: Brand & System Status */}
        <div className="nav-left">
          <Link to="/" className="nav-brand">
            <span className="nav-brand-bracket">[</span>
            <span>SECURE_QR</span>
            <span className="nav-brand-bracket">]</span>
          </Link>
          <div className="nav-status-indicator" title="System operational and cryptographic engine ready">
            <span className="status-dot"></span>
            <span>SYS.STATUS: ONLINE</span>
          </div>
        </div>

        {/* Middle: Horizontal Nav with Editorial Dividers */}
        <ul className="nav-links">
          <li>
            <Link 
              to="/scanner" 
              className={`nav-link ${isActive('/scanner') ? 'active' : ''}`}
            >
              Scan & Verify
            </Link>
          </li>
          <li className="nav-divider">/</li>
          <li>
            <Link 
              to="/create" 
              className={`nav-link ${isActive('/create') ? 'active' : ''}`}
            >
              Create & Sign
            </Link>
          </li>
          <li className="nav-divider">/</li>
          <li>
            <Link 
              to="/contacts" 
              className={`nav-link ${isActive('/contacts') ? 'active' : ''}`}
            >
              Trusted Contacts
            </Link>
          </li>
          <li className="nav-divider">/</li>
          <li>
            <Link 
              to="/lan" 
              className={`nav-link ${isActive('/lan') ? 'active' : ''}`}
            >
              <span>LAN Relay</span>
              {connectionStatus === 'connected' && (
                <span 
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--status-success)',
                    display: 'inline-block',
                    marginLeft: '4px'
                  }}
                  title="LAN Peer Connected"
                />
              )}
              {unreadCount > 0 && (
                <span className="nav-badge-count">{unreadCount}</span>
              )}
            </Link>
          </li>
        </ul>

        {/* Right: Technical Metadata & Action Button */}
        <div className="nav-right">
          <div className="nav-meta-block">
            <span className="meta-label">SYS.TIME</span>
            <span className="meta-value">{sysTime || '00:00:00'} UTC</span>
          </div>
          <div className="nav-meta-block" style={{ borderRight: 'none', paddingRight: 0 }}>
            <span className="meta-label">CRYPTO_ENGINE</span>
            <span className="meta-value">ECDSA_P256</span>
          </div>
          <Link to="/scanner" className="btn btn-primary nav-action-btn">
            <span>INIT SCAN</span>
            <span className="arrow-icon">↗</span>
          </Link>
        </div>

        {/* Mobile Toggle Button */}
        <button 
          className="mobile-nav-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile Drawer Menu */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <Link 
          to="/scanner" 
          className={`nav-link ${isActive('/scanner') ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          Scan & Verify
        </Link>
        <Link 
          to="/create" 
          className={`nav-link ${isActive('/create') ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          Create & Sign
        </Link>
        <Link 
          to="/contacts" 
          className={`nav-link ${isActive('/contacts') ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          Trusted Contacts
        </Link>
        <Link 
          to="/lan" 
          className={`nav-link ${isActive('/lan') ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          LAN Relay {unreadCount > 0 && `(${unreadCount})`}
        </Link>
        <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="section-annotation">SYS.TIME: {sysTime} UTC</span>
          <Link 
            to="/scanner" 
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            INIT SCAN ↗
          </Link>
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <Router>
      <LanProvider>
        <div className="app-container">
          <NavigationBar />

          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/scanner" element={<Scanner />} />
              <Route path="/create" element={<CreateSign />} />
              <Route path="/contacts" element={<TrustedContacts />} />
              <Route path="/lan" element={<LanChat />} />
            </Routes>
          </main>
          
          {/* Cyber Brutalism Architectural Bottom Status Strip */}
          <footer className="footer-strip">
            <div className="footer-strip-left">
              <span className="pulse-dot dot-green" />
              <span>CONNECTION SECURE</span>
            </div>
            <div className="footer-strip-center">
              <span>&gt; ACCESS GRANTED // ZERO-TRUST CRYPTOGRAPHIC ENGINE ACTIVE</span>
            </div>
            <div className="footer-strip-right">
              <span>SCN: 0001</span>
              <span>NODE: CYBR_01</span>
              <span style={{ color: 'var(--accent-violet)', fontWeight: 800 }}>+</span>
            </div>
          </footer>
        </div>
      </LanProvider>
    </Router>
  );
}

export default App;
