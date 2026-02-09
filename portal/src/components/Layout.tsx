import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearToken } from '../lib/api';

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
  } as React.CSSProperties,
  sidebar: {
    width: '220px',
    background: '#0f4c75',
    color: '#fff',
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  logo: {
    padding: '0 20px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
    marginBottom: '20px',
    fontSize: '18px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,
  link: {
    display: 'block',
    padding: '12px 20px',
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  activeLink: {
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    borderLeft: '3px solid #3282b8',
  } as React.CSSProperties,
  main: {
    flex: 1,
    padding: '20px 30px',
    background: '#f5f5f5',
    overflow: 'auto',
  } as React.CSSProperties,
  logout: {
    display: 'block',
    padding: '12px 20px',
    color: '#ff6b6b',
    textDecoration: 'none',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left',
    fontSize: '14px',
  } as React.CSSProperties,
  spacer: {
    flex: 1,
  } as React.CSSProperties,
};

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/directory', label: 'Directory' },
  { to: '/my-workflows', label: 'My Workflows' },
  { to: '/account', label: 'Account' },
];

export default function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>Fly-Bot Portal</div>
        <nav style={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                ...styles.link,
                ...(isActive ? styles.activeLink : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={styles.spacer} />
        <button style={styles.logout} onClick={handleLogout}>
          Logout
        </button>
      </aside>
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
