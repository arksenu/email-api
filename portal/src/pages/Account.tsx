import { useState, useEffect } from 'react';
import { getAccount, getUsage, getTransactions, User, Mapping, Transaction, PaginatedResponse } from '../lib/api';

const styles = {
  title: {
    fontSize: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  card: {
    background: '#fff',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#333',
  } as React.CSSProperties,
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
  infoLabel: {
    color: '#666',
    fontSize: '14px',
  } as React.CSSProperties,
  infoValue: {
    fontWeight: 500,
    fontSize: '14px',
  } as React.CSSProperties,
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '16px',
  } as React.CSSProperties,
  tab: {
    padding: '12px 24px',
    border: 'none',
    background: '#e9ecef',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  activeTab: {
    background: '#fff',
    borderBottom: '2px solid #0f4c75',
    color: '#0f4c75',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    background: '#f8f9fa',
    fontWeight: 600,
    fontSize: '14px',
    color: '#666',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  } as React.CSSProperties,
  status: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  } as React.CSSProperties,
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
  pageButton: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    background: '#fff',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  activePageButton: {
    background: '#0f4c75',
    color: '#fff',
    borderColor: '#0f4c75',
  } as React.CSSProperties,
  loading: { color: '#666' } as React.CSSProperties,
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
  } as React.CSSProperties,
  positive: { color: '#28a745' } as React.CSSProperties,
  negative: { color: '#dc3545' } as React.CSSProperties,
};

type TabType = 'usage' | 'transactions';

export default function Account() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('usage');

  const [usageData, setUsageData] = useState<PaginatedResponse<Mapping> | null>(null);
  const [usagePage, setUsagePage] = useState(1);
  const [usageLoading, setUsageLoading] = useState(false);

  const [transactionData, setTransactionData] = useState<PaginatedResponse<Transaction> | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionLoading, setTransactionLoading] = useState(false);

  useEffect(() => {
    getAccount()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'usage') {
      setUsageLoading(true);
      getUsage(usagePage, 10)
        .then(setUsageData)
        .finally(() => setUsageLoading(false));
    }
  }, [activeTab, usagePage]);

  useEffect(() => {
    if (activeTab === 'transactions') {
      setTransactionLoading(true);
      getTransactions(transactionPage, 10)
        .then(setTransactionData)
        .finally(() => setTransactionLoading(false));
    }
  }, [activeTab, transactionPage]);

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

  if (loading) {
    return <p style={styles.loading}>Loading...</p>;
  }

  if (!user) {
    return <p>Failed to load account</p>;
  }

  return (
    <div>
      <h1 style={styles.title}>Account</h1>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Account Information</h2>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Email</span>
          <span style={styles.infoValue}>{user.email}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Credit Balance</span>
          <span style={styles.infoValue}>{user.credits}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Status</span>
          <span style={{ ...styles.infoValue, color: user.is_approved ? '#28a745' : '#ffc107' }}>
            {user.is_approved ? 'Approved' : 'Pending Approval'}
          </span>
        </div>
        <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
          <span style={styles.infoLabel}>Member Since</span>
          <span style={styles.infoValue}>{new Date(user.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeTab === 'usage' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('usage')}
          >
            Usage History
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'transactions' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </button>
        </div>

        {activeTab === 'usage' && (
          <>
            {usageLoading ? (
              <p style={styles.loading}>Loading...</p>
            ) : !usageData || usageData.data.length === 0 ? (
              <p style={styles.empty}>No usage history yet.</p>
            ) : (
              <>
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
                    {usageData.data.map((item) => (
                      <tr key={item.id}>
                        <td style={styles.td}>{item.workflow}</td>
                        <td style={styles.td}>
                          <span style={getStatusStyle(item.status)}>{item.status}</span>
                        </td>
                        <td style={styles.td}>{item.credits_charged ?? '-'}</td>
                        <td style={styles.td}>{new Date(item.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {usageData.totalPages > 1 && (
                  <div style={styles.pagination}>
                    {Array.from({ length: usageData.totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        style={{
                          ...styles.pageButton,
                          ...(page === usagePage ? styles.activePageButton : {}),
                        }}
                        onClick={() => setUsagePage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'transactions' && (
          <>
            {transactionLoading ? (
              <p style={styles.loading}>Loading...</p>
            ) : !transactionData || transactionData.data.length === 0 ? (
              <p style={styles.empty}>No transactions yet.</p>
            ) : (
              <>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Reason</th>
                      <th style={styles.th}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionData.data.map((item) => (
                      <tr key={item.id}>
                        <td style={styles.td}>
                          <span style={item.credits_delta >= 0 ? styles.positive : styles.negative}>
                            {item.credits_delta >= 0 ? '+' : ''}
                            {item.credits_delta}
                          </span>
                        </td>
                        <td style={styles.td}>{item.reason || '-'}</td>
                        <td style={styles.td}>{new Date(item.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactionData.totalPages > 1 && (
                  <div style={styles.pagination}>
                    {Array.from({ length: transactionData.totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        style={{
                          ...styles.pageButton,
                          ...(page === transactionPage ? styles.activePageButton : {}),
                        }}
                        onClick={() => setTransactionPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
