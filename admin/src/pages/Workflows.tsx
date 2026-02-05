import { useState, useEffect, FormEvent } from 'react';
import { getWorkflows, updateWorkflow, Workflow } from '../lib/api';

const styles = {
  title: {
    fontSize: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  } as React.CSSProperties,
  card: {
    background: '#fff',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  active: {
    background: '#d4edda',
    color: '#155724',
  } as React.CSSProperties,
  inactive: {
    background: '#f8d7da',
    color: '#721c24',
  } as React.CSSProperties,
  description: {
    color: '#666',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  stats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #eee',
  } as React.CSSProperties,
  stat: {
    fontSize: '12px',
    color: '#666',
  } as React.CSSProperties,
  statValue: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1a1a2e',
  } as React.CSSProperties,
  button: {
    padding: '10px 16px',
    background: '#0f4c75',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    width: '100%',
  } as React.CSSProperties,
  buttonSecondary: {
    background: '#6c757d',
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
    borderRadius: '8px',
    width: '100%',
    maxWidth: '400px',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '18px',
    marginBottom: '16px',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  textarea: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    minHeight: '80px',
    resize: 'vertical',
  } as React.CSSProperties,
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
};

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    manus_address: '',
    description: '',
    credits_per_task: 1,
    is_active: true,
  });

  const fetchWorkflows = () => {
    setLoading(true);
    getWorkflows()
      .then(setWorkflows)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const openEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setFormData({
      name: workflow.name,
      manus_address: workflow.manus_address,
      description: workflow.description || '',
      credits_per_task: workflow.credits_per_task,
      is_active: workflow.is_active,
    });
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingWorkflow) return;
    await updateWorkflow(editingWorkflow.id, formData);
    setEditingWorkflow(null);
    fetchWorkflows();
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1 style={styles.title}>Workflows</h1>
      <div style={styles.grid}>
        {workflows.map((workflow) => (
          <div key={workflow.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>{workflow.name}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                  {workflow.manus_address}
                </div>
              </div>
              <span
                style={{
                  ...styles.badge,
                  ...(workflow.is_active ? styles.active : styles.inactive),
                }}
              >
                {workflow.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p style={styles.description}>
              {workflow.description || 'No description'}
            </p>
            <div style={styles.stats}>
              <div>
                <div style={styles.stat}>Credits/Task</div>
                <div style={styles.statValue}>{workflow.credits_per_task}</div>
              </div>
              <div>
                <div style={styles.stat}>Total Tasks</div>
                <div style={styles.statValue}>{workflow.total_tasks || 0}</div>
              </div>
              <div>
                <div style={styles.stat}>Completed</div>
                <div style={styles.statValue}>{workflow.completed_tasks || 0}</div>
              </div>
              <div>
                <div style={styles.stat}>Credits Earned</div>
                <div style={styles.statValue}>{workflow.total_credits_earned || 0}</div>
              </div>
            </div>
            <button style={styles.button} onClick={() => openEdit(workflow)}>
              Edit Workflow
            </button>
          </div>
        ))}
      </div>

      {editingWorkflow && (
        <div style={styles.modal} onClick={() => setEditingWorkflow(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit Workflow</h2>
            <form style={styles.form} onSubmit={handleEdit}>
              <div>
                <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                  Workflow Name (email prefix)
                </label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="e.g. research"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  Users send to: {formData.name || 'name'}@mail.fly-bot.net
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                  Manus Address
                </label>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="e.g. arksenu-research@manus.bot"
                  value={formData.manus_address}
                  onChange={(e) => setFormData({ ...formData, manus_address: e.target.value })}
                  required
                />
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  Emails forwarded to this Manus workflow
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                  Description
                </label>
                <textarea
                  style={styles.textarea}
                  placeholder="What this workflow does..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                  Credits per Task
                </label>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="Credits per task"
                  min="1"
                  value={formData.credits_per_task}
                  onChange={(e) =>
                    setFormData({ ...formData, credits_per_task: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Active
              </label>
              <div style={styles.actions}>
                <button type="submit" style={styles.button}>
                  Save
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonSecondary }}
                  onClick={() => setEditingWorkflow(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
