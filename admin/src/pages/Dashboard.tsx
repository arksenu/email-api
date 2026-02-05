import { useState, useEffect } from 'react';
import { getStats, Stats } from '../lib/api';

const styles = {
  title: {
    fontSize: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
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
  cardSub: {
    fontSize: '12px',
    color: '#999',
    marginTop: '8px',
  } as React.CSSProperties,
  loading: {
    color: '#666',
  } as React.CSSProperties,
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={styles.loading}>Loading...</p>;
  }

  if (!stats) {
    return <p>Failed to load stats</p>;
  }

  return (
    <div>
      <h1 style={styles.title}>Dashboard</h1>
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Total Users</div>
          <div style={styles.cardValue}>{stats.users.total}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Active Workflows</div>
          <div style={styles.cardValue}>{stats.workflows.active}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Total Tasks</div>
          <div style={styles.cardValue}>{stats.tasks.total}</div>
          <div style={styles.cardSub}>
            {stats.tasks.pending} pending / {stats.tasks.completed} completed
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Credits in System</div>
          <div style={styles.cardValue}>{stats.credits.totalInSystem}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Credits Spent</div>
          <div style={styles.cardValue}>{stats.credits.totalSpent}</div>
        </div>
      </div>
    </div>
  );
}
