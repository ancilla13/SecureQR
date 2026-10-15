import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Shield, QrCode, ShieldCheck, Users, Radio } from 'lucide-react';
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

  return (
    <nav className="navbar glass-card">
      <Link to="/" className="nav-brand">
        <Shield className="text-accent-primary" size={28} />
        <span className="font-bold gradient-text">SecureQR</span>
      </Link>
      <div className="nav-links">
        <Link to="/scanner" className="nav-link">
          <ShieldCheck size={18} /> Scan & Verify
        </Link>
        <Link to="/create" className="nav-link">
          <QrCode size={18} /> Create & Sign
        </Link>
        <Link to="/contacts" className="nav-link">
          <Users size={18} /> Trusted Contacts
        </Link>
        <Link to="/lan" className="nav-link" style={{ position: 'relative' }}>
          <Radio size={18} style={{ color: connectionStatus === 'connected' ? 'var(--wallet-success, #10b981)' : 'inherit' }} />
          <span>LAN Chat</span>
          {connectionStatus === 'connected' && (
            <span 
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--wallet-success, #10b981)',
                display: 'inline-block',
                boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
              }}
              title="LAN Chat Connected"
            />
          )}
          {unreadCount > 0 && (
            <span 
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-6px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '0.68rem',
                fontWeight: 800,
                lineHeight: '1.2',
                boxShadow: '0 2px 5px rgba(239, 68, 68, 0.5)'
              }}
            >
              {unreadCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
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
          
          <footer className="footer">
            <p>© 2026 SecureQR Platform • ECC-Based Authentication & Verification Architecture • Built for PBL</p>
          </footer>
        </div>
      </LanProvider>
    </Router>
  );
}

export default App;
