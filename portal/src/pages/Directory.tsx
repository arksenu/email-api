import { useState, useEffect } from 'react';
import { getDirectory, Workflow, WorkflowType } from '../lib/api';
import WorkflowCard from '../components/WorkflowCard';

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
  } as React.CSSProperties,
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  } as React.CSSProperties,
  search: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    maxWidth: '300px',
  } as React.CSSProperties,
  select: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    background: '#fff',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px',
  } as React.CSSProperties,
  empty: {
    background: '#fff',
    padding: '40px',
    borderRadius: '8px',
    textAlign: 'center',
    color: '#666',
  } as React.CSSProperties,
  loading: {
    color: '#666',
  } as React.CSSProperties,
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  modalContent: {
    background: '#fff',
    padding: '24px',
    borderRadius: '12px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '16px',
  } as React.CSSProperties,
  modalSection: {
    marginBottom: '16px',
  } as React.CSSProperties,
  modalLabel: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '4px',
  } as React.CSSProperties,
  modalValue: {
    fontSize: '14px',
    color: '#333',
  } as React.CSSProperties,
  closeButton: {
    padding: '10px 20px',
    background: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '16px',
  } as React.CSSProperties,
};

export default function Directory() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<WorkflowType | ''>('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  useEffect(() => {
    getDirectory()
      .then(setWorkflows)
      .finally(() => setLoading(false));
  }, []);

  const filteredWorkflows = workflows.filter((w) => {
    const matchesSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesType = !typeFilter || w.type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return <p style={styles.loading}>Loading...</p>;
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Workflow Directory</h1>
      </div>

      <div style={styles.filters}>
        <input
          style={styles.search}
          type="text"
          placeholder="Search workflows..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={styles.select}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as WorkflowType | '')}
        >
          <option value="">All Types</option>
          <option value="native">Native</option>
          <option value="official">Official</option>
          <option value="community">Community</option>
        </select>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div style={styles.empty}>
          {search || typeFilter ? 'No workflows match your filters.' : 'No public workflows available.'}
        </div>
      ) : (
        <div style={styles.grid}>
          {filteredWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onClick={() => setSelectedWorkflow(workflow)}
            />
          ))}
        </div>
      )}

      {selectedWorkflow && (
        <div style={styles.modal} onClick={() => setSelectedWorkflow(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{selectedWorkflow.name}</h2>

            <div style={styles.modalSection}>
              <div style={styles.modalLabel}>Email Address</div>
              <div style={{ ...styles.modalValue, fontFamily: 'monospace', background: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
                {selectedWorkflow.name}@mail.fly-bot.net
              </div>
            </div>

            <div style={styles.modalSection}>
              <div style={styles.modalLabel}>Description</div>
              <div style={styles.modalValue}>
                {selectedWorkflow.description || 'No description provided.'}
              </div>
            </div>

            {selectedWorkflow.instruction && (
              <div style={styles.modalSection}>
                <div style={styles.modalLabel}>Instructions</div>
                <div style={{ ...styles.modalValue, background: '#f8f9fa', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                  {selectedWorkflow.instruction}
                </div>
              </div>
            )}

            <div style={styles.modalSection}>
              <div style={styles.modalLabel}>Credits per Task</div>
              <div style={styles.modalValue}>{selectedWorkflow.credits_per_task}</div>
            </div>

            <div style={{ fontSize: '13px', color: '#666', marginTop: '16px', padding: '12px', background: '#e3f2fd', borderRadius: '4px' }}>
              To use this workflow, send an email to <strong>{selectedWorkflow.name}@mail.fly-bot.net</strong>
            </div>

            <button style={styles.closeButton} onClick={() => setSelectedWorkflow(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
