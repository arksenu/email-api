import { useState, useEffect } from 'react';
import {
  getMappings,
  getTransactions,
  Mapping,
  Transaction,
  PaginatedResponse,
  MappingFilters,
} from '../lib/api';

const styles = {
  title: {
    fontSize: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '20px',
    borderBottom: '1px solid #ddd',
  } as React.CSSProperties,
  tab: {
    padding: '12px 24px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
  } as React.CSSProperties,
  activeTab: {
    borderBottom: '2px solid #0f4c75',
    color: '#0f4c75',
    fontWeight: 'bold',
  } as React.CSSProperties,
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  input: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    width: '200px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    borderCollapse: 'collapse',
    overflow: 'hidden',
  } as React.CSSProperties,
  th: {
    textAlign: 'left',
    padding: '14px 16px',
    background: '#f8f9fa',
    borderBottom: '1px solid #eee',
    fontSize: '12px',
    textTransform: 'uppercase',
    color: '#666',
  } as React.CSSProperties,
  td: {
    padding: '14px 16px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  completed: {
    background: '#d4edda',
    color: '#155724',
  } as React.CSSProperties,
  pending: {
    background: '#fff3cd',
    color: '#856404',
  } as React.CSSProperties,
  positive: {
    color: '#28a745',
  } as React.CSSProperties,
  negative: {
    color: '#dc3545',
  } as React.CSSProperties,
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '20px',
  } as React.CSSProperties,
  pageButton: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    cursor: 'pointer',
  } as React.CSSProperties,
};

type TabType = 'mappings' | 'transactions';

export default function Activity() {
  const [activeTab, setActiveTab] = useState<TabType>('mappings');
  const [mappings, setMappings] = useState<PaginatedResponse<Mapping> | null>(null);
  const [transactions, setTransactions] = useState<PaginatedResponse<Transaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<MappingFilters>({});

  const fetchMappings = (page = 1) => {
    setLoading(true);
    getMappings(page, 20, filters)
      .then(setMappings)
      .finally(() => setLoading(false));
  };

  const fetchTransactions = (page = 1) => {
    setLoading(true);
    getTransactions(page, 20)
      .then(setTransactions)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'mappings') {
      fetchMappings();
    } else {
      fetchTransactions();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'mappings') {
      fetchMappings();
    }
  }, [filters]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div>
      <h1 style={styles.title}>Activity</h1>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'mappings' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('mappings')}
        >
          Email Tasks
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'transactions' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
      </div>

      {activeTab === 'mappings' && (
        <>
          <div style={styles.filters}>
            <select
              style={styles.select}
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <select
              style={styles.select}
              value={filters.workflow || ''}
              onChange={(e) => setFilters({ ...filters, workflow: e.target.value || undefined })}
            >
              <option value="">All Workflows</option>
              <option value="research">Research</option>
              <option value="summarize">Summarize</option>
              <option value="newsletter">Newsletter</option>
            </select>
            <input
              style={styles.input}
              type="text"
              placeholder="Filter by sender..."
              value={filters.sender || ''}
              onChange={(e) => setFilters({ ...filters, sender: e.target.value || undefined })}
            />
          </div>

          {loading ? (
            <p>Loading...</p>
          ) : (
            <>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Sender</th>
                    <th style={styles.th}>Workflow</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Credits</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.th}>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings?.data.map((mapping) => (
                    <tr key={mapping.id}>
                      <td style={styles.td}>{mapping.id}</td>
                      <td style={styles.td}>{mapping.original_sender}</td>
                      <td style={styles.td}>{mapping.workflow}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...(mapping.status === 'completed' ? styles.completed : styles.pending),
                          }}
                        >
                          {mapping.status}
                        </span>
                      </td>
                      <td style={styles.td}>{mapping.credits_charged ?? '-'}</td>
                      <td style={styles.td}>{formatDate(mapping.created_at)}</td>
                      <td style={styles.td}>
                        {mapping.completed_at ? formatDate(mapping.completed_at) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {mappings && mappings.totalPages > 1 && (
                <div style={styles.pagination}>
                  <button
                    style={styles.pageButton}
                    disabled={mappings.page <= 1}
                    onClick={() => fetchMappings(mappings.page - 1)}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '8px' }}>
                    Page {mappings.page} of {mappings.totalPages}
                  </span>
                  <button
                    style={styles.pageButton}
                    disabled={mappings.page >= mappings.totalPages}
                    onClick={() => fetchMappings(mappings.page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'transactions' && (
        <>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Reason</th>
                    <th style={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions?.data.map((tx) => (
                    <tr key={tx.id}>
                      <td style={styles.td}>{tx.id}</td>
                      <td style={styles.td}>{tx.user_email}</td>
                      <td style={styles.td}>
                        <span style={tx.credits_delta >= 0 ? styles.positive : styles.negative}>
                          {tx.credits_delta >= 0 ? '+' : ''}
                          {tx.credits_delta}
                        </span>
                      </td>
                      <td style={styles.td}>{tx.reason || '-'}</td>
                      <td style={styles.td}>{formatDate(tx.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {transactions && transactions.totalPages > 1 && (
                <div style={styles.pagination}>
                  <button
                    style={styles.pageButton}
                    disabled={transactions.page <= 1}
                    onClick={() => fetchTransactions(transactions.page - 1)}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '8px' }}>
                    Page {transactions.page} of {transactions.totalPages}
                  </span>
                  <button
                    style={styles.pageButton}
                    disabled={transactions.page >= transactions.totalPages}
                    onClick={() => fetchTransactions(transactions.page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
