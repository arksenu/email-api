import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAccount, getUsage, User, Mapping } from '../lib/api';

const styles = {
  title: {
    fontSize: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  banner: {
    background: '#fff3cd',
    color: '#856404',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  } as React.CSSProperties,
  card: {
    background: '#fff',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  cardTitle: {
    color: '#666',
    fontSize: '14px',
    marginBottom: '8px',
  } as React.CSSProperties,
  cardValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1a1a2e',
  } as React.CSSProperties,
  section: {
    marginTop: '30px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  } as React.CSSProperties,
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    background: '#f8f9fa',
    fontWeight: 600,
    fontSize: '14px',
    color: '#666',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    borderTop: '1px solid #eee',
    fontSize: '14px',
  } as React.CSSProperties,
  status: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  } as React.CSSProperties,
  quickLinks: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
  } as React.CSSProperties,
  quickLink: {
    padding: '12px 24px',
    background: '#0f4c75',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  loading: {
    color: '#666',
  } as React.CSSProperties,
};

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [recentTasks, setRecentTasks] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAccount(), getUsage(1, 5)])
      .then(([userData, usageData]) => {
        setUser(userData);
        setRecentTasks(usageData.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={styles.loading}>Loading...</p>;
  }

  if (!user) {
    return <p>Failed to load user data</p>;
  }

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch (status) {
      case 'completed':
        return { ...styles.status, background: '#d4edda', color: '#155724' };
      case 'pending':
        return { ...styles.status, background: '#fff3cd', color: '#856404' };
      default:
        return { ...styles.status, background: '#f8d7da', color: '#721c24' };
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Dashboard</h1>

      {!user.is_approved && (
        <div style={styles.banner}>
          <span style={{ fontSize: '20px' }}>!</span>
          <span>
            Your account is pending approval. You can browse workflows but cannot send emails until approved.
          </span>
        </div>
      )}

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Credit Balance</div>
          <div style={styles.cardValue}>{user.credits}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Account Status</div>
          <div style={{ ...styles.cardValue, fontSize: '24px', color: user.is_approved ? '#28a745' : '#ffc107' }}>
            {user.is_approved ? 'Approved' : 'Pending'}
          </div>
        </div>
      </div>

      <div style={styles.quickLinks}>
        <Link to="/directory" style={styles.quickLink}>
          Browse Directory
        </Link>
        <Link to="/my-workflows" style={styles.quickLink}>
          My Workflows
        </Link>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Tasks</h2>
        {recentTasks.length === 0 ? (
          <div style={styles.card}>
            <p style={{ color: '#666' }}>No tasks yet. Send an email to a workflow to get started!</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Workflow</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Credits</th>
                <th style={styles.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map((task) => (
                <tr key={task.id}>
                  <td style={styles.td}>{task.workflow}</td>
                  <td style={styles.td}>
                    <span style={getStatusStyle(task.status)}>{task.status}</span>
                  </td>
                  <td style={styles.td}>{task.credits_charged ?? '-'}</td>
                  <td style={styles.td}>{new Date(task.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
