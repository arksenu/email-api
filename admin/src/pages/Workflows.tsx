import { useState, useEffect, FormEvent } from 'react';
import {
  getWorkflows,
  updateWorkflow,
  createWorkflow,
  deleteWorkflow,
  getApprovedSenders,
  addApprovedSender,
  removeApprovedSender,
  Workflow,
  ApprovedSender,
} from '../lib/api';

type ModalType = 'create' | 'edit' | 'delete' | 'senders' | null;

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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
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
    marginBottom: '12px',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  badgeRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  } as React.CSSProperties,
  typeBadge: {
    native: { background: '#6c757d', color: '#fff' },
    official: { background: '#0d6efd', color: '#fff' },
    community: { background: '#6f42c1', color: '#fff' },
  } as Record<string, React.CSSProperties>,
  visibilityBadge: {
    public: { background: '#d4edda', color: '#155724' },
    private: { background: '#fff3cd', color: '#856404' },
  } as Record<string, React.CSSProperties>,
  statusBadge: {
    active: { background: '#d4edda', color: '#155724' },
    inactive: { background: '#f8d7da', color: '#721c24' },
  } as Record<string, React.CSSProperties>,
  emailPreview: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  description: {
    color: '#666',
    fontSize: '14px',
    marginBottom: '16px',
    minHeight: '40px',
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
  cardActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  button: {
    padding: '10px 16px',
    background: '#0f4c75',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  buttonSecondary: {
    background: '#6c757d',
  } as React.CSSProperties,
  buttonDanger: {
    background: '#dc3545',
  } as React.CSSProperties,
  buttonSmall: {
    padding: '6px 12px',
    fontSize: '12px',
    flex: 1,
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
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '18px',
    marginBottom: '16px',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '4px',
    display: 'block',
  } as React.CSSProperties,
  fieldHint: {
    fontSize: '11px',
    color: '#999',
    marginTop: '4px',
  } as React.CSSProperties,
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  inputDisabled: {
    background: '#f5f5f5',
    color: '#999',
  } as React.CSSProperties,
  textarea: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    minHeight: '80px',
    resize: 'vertical',
    width: '100%',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  } as React.CSSProperties,
  senderList: {
    maxHeight: '200px',
    overflow: 'auto',
    border: '1px solid #eee',
    borderRadius: '4px',
    marginBottom: '16px',
  } as React.CSSProperties,
  senderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
  senderEmail: {
    fontSize: '14px',
  } as React.CSSProperties,
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#dc3545',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0 4px',
  } as React.CSSProperties,
  addSenderRow: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  warning: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '4px',
    padding: '12px',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#856404',
  } as React.CSSProperties,
};

interface EditFormData {
  name: string;
  description: string;
  instruction: string;
  credits_per_task: number;
  is_active: boolean;
  is_public: boolean;
}

interface CreateFormData {
  name: string;
  description: string;
  instruction: string;
  credits_per_task: number;
  is_public: boolean;
}

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [approvedSenders, setApprovedSenders] = useState<ApprovedSender[]>([]);
  const [newSenderEmail, setNewSenderEmail] = useState('');
  const [error, setError] = useState('');

  const [editForm, setEditForm] = useState<EditFormData>({
    name: '',
    description: '',
    instruction: '',
    credits_per_task: 10,
    is_active: true,
    is_public: true,
  });

  const [createForm, setCreateForm] = useState<CreateFormData>({
    name: '',
    description: '',
    instruction: '',
    credits_per_task: 10,
    is_public: true,
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

  const openCreate = () => {
    setCreateForm({
      name: '',
      description: '',
      instruction: '',
      credits_per_task: 10,
      is_public: true,
    });
    setError('');
    setModalType('create');
  };

  const openEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setEditForm({
      name: workflow.name,
      description: workflow.description || '',
      instruction: workflow.instruction || '',
      credits_per_task: workflow.credits_per_task,
      is_active: workflow.is_active,
      is_public: workflow.is_public,
    });
    setError('');
    setModalType('edit');
  };

  const openDelete = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setModalType('delete');
  };

  const openSenders = async (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    try {
      const senders = await getApprovedSenders(workflow.id);
      setApprovedSenders(senders);
      setNewSenderEmail('');
      setError('');
      setModalType('senders');
    } catch (err: any) {
      setError(err.message || 'Failed to load approved senders');
    }
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedWorkflow(null);
    setError('');
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createWorkflow(createForm);
      closeModal();
      fetchWorkflows();
    } catch (err: any) {
      setError(err.message || 'Failed to create workflow');
    }
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedWorkflow) return;
    setError('');

    const updates: Partial<EditFormData> = {};
    if (selectedWorkflow.type !== 'native') {
      updates.name = editForm.name;
      updates.instruction = editForm.instruction;
      updates.is_public = editForm.is_public;
    }
    updates.description = editForm.description;
    updates.credits_per_task = editForm.credits_per_task;
    updates.is_active = editForm.is_active;

    try {
      await updateWorkflow(selectedWorkflow.id, updates);
      closeModal();
      fetchWorkflows();
    } catch (err: any) {
      setError(err.message || 'Failed to update workflow');
    }
  };

  const handleDelete = async () => {
    if (!selectedWorkflow) return;
    try {
      await deleteWorkflow(selectedWorkflow.id);
      closeModal();
      fetchWorkflows();
    } catch (err: any) {
      setError(err.message || 'Failed to delete workflow');
    }
  };

  const handleAddSender = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedWorkflow || !newSenderEmail.trim()) return;
    try {
      const sender = await addApprovedSender(selectedWorkflow.id, newSenderEmail.trim());
      setApprovedSenders([sender, ...approvedSenders]);
      setNewSenderEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to add sender');
    }
  };

  const handleRemoveSender = async (email: string) => {
    if (!selectedWorkflow) return;
    try {
      await removeApprovedSender(selectedWorkflow.id, email);
      setApprovedSenders(approvedSenders.filter((s) => s.email !== email));
    } catch (err: any) {
      setError(err.message || 'Failed to remove sender');
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Workflows</h1>
        <button style={styles.button} onClick={openCreate}>
          Create Workflow
        </button>
      </div>

      <div style={styles.grid}>
        {workflows.map((workflow) => (
          <div key={workflow.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>{workflow.name}</div>
                <div style={styles.emailPreview}>{workflow.name}@mail.fly-bot.net</div>
              </div>
              <div style={styles.badgeRow}>
                <span style={{ ...styles.badge, ...styles.typeBadge[workflow.type] }}>
                  {workflow.type}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    ...styles.visibilityBadge[workflow.is_public ? 'public' : 'private'],
                  }}
                >
                  {workflow.is_public ? 'Public' : 'Private'}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    ...styles.statusBadge[workflow.is_active ? 'active' : 'inactive'],
                  }}
                >
                  {workflow.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <p style={styles.description}>{workflow.description || 'No description'}</p>

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

            <div style={styles.cardActions}>
              <button
                style={{ ...styles.button, ...styles.buttonSmall }}
                onClick={() => openEdit(workflow)}
              >
                Edit
              </button>
              {!workflow.is_public && (
                <button
                  style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonSecondary }}
                  onClick={() => openSenders(workflow)}
                >
                  Senders
                </button>
              )}
              {workflow.type !== 'native' && (
                <button
                  style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonDanger }}
                  onClick={() => openDelete(workflow)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {modalType === 'create' && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Create Official Workflow</h2>
            {error && <div style={styles.warning}>{error}</div>}
            <form style={styles.form} onSubmit={handleCreate}>
              <div>
                <label style={styles.fieldLabel}>Workflow Name</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="e.g. translate"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value.toLowerCase() })
                  }
                  required
                />
                <div style={styles.fieldHint}>
                  Users send to: {createForm.name || 'name'}@mail.fly-bot.net
                </div>
              </div>

              <div>
                <label style={styles.fieldLabel}>Description</label>
                <textarea
                  style={styles.textarea}
                  placeholder="Brief description shown in directory..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>

              <div>
                <label style={styles.fieldLabel}>Instruction</label>
                <textarea
                  style={{ ...styles.textarea, minHeight: '120px' }}
                  placeholder="Instructions prepended to user's email when sent to Manus..."
                  value={createForm.instruction}
                  onChange={(e) => setCreateForm({ ...createForm, instruction: e.target.value })}
                />
                <div style={styles.fieldHint}>
                  This text is prepended to the user's email body when sent to Manus API.
                </div>
              </div>

              <div>
                <label style={styles.fieldLabel}>Credits per Task</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={createForm.credits_per_task}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, credits_per_task: parseInt(e.target.value) || 1 })
                  }
                />
              </div>

              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={createForm.is_public}
                  onChange={(e) => setCreateForm({ ...createForm, is_public: e.target.checked })}
                />
                Public (visible in directory)
              </label>

              <div style={styles.actions}>
                <button type="submit" style={{ ...styles.button, flex: 1 }}>
                  Create
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonSecondary, flex: 1 }}
                  onClick={closeModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modalType === 'edit' && selectedWorkflow && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              Edit Workflow
              <span
                style={{
                  ...styles.badge,
                  ...styles.typeBadge[selectedWorkflow.type],
                  marginLeft: '8px',
                  verticalAlign: 'middle',
                }}
              >
                {selectedWorkflow.type}
              </span>
            </h2>
            {error && <div style={styles.warning}>{error}</div>}
            <form style={styles.form} onSubmit={handleEdit}>
              <div>
                <label style={styles.fieldLabel}>Workflow Name</label>
                <input
                  style={{
                    ...styles.input,
                    ...(selectedWorkflow.type === 'native' ? styles.inputDisabled : {}),
                  }}
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value.toLowerCase() })
                  }
                  disabled={selectedWorkflow.type === 'native'}
                  required
                />
                <div style={styles.fieldHint}>
                  {selectedWorkflow.type === 'native'
                    ? 'Native workflow names cannot be changed'
                    : `Users send to: ${editForm.name}@mail.fly-bot.net`}
                </div>
              </div>

              <div>
                <label style={styles.fieldLabel}>Description</label>
                <textarea
                  style={styles.textarea}
                  placeholder="Brief description..."
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>

              <div>
                <label style={styles.fieldLabel}>Instruction</label>
                <textarea
                  style={{
                    ...styles.textarea,
                    minHeight: '120px',
                    ...(selectedWorkflow.type === 'native' ? styles.inputDisabled : {}),
                  }}
                  placeholder="Instructions prepended to user's email..."
                  value={editForm.instruction}
                  onChange={(e) => setEditForm({ ...editForm, instruction: e.target.value })}
                  disabled={selectedWorkflow.type === 'native'}
                />
                {selectedWorkflow.type === 'native' && (
                  <div style={styles.fieldHint}>Native workflow instructions cannot be changed</div>
                )}
              </div>

              <div>
                <label style={styles.fieldLabel}>Credits per Task</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={editForm.credits_per_task}
                  onChange={(e) =>
                    setEditForm({ ...editForm, credits_per_task: parseInt(e.target.value) || 1 })
                  }
                />
              </div>

              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                Active
              </label>

              {selectedWorkflow.type !== 'native' && (
                <label style={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={editForm.is_public}
                    onChange={(e) => setEditForm({ ...editForm, is_public: e.target.checked })}
                  />
                  Public (visible in directory)
                </label>
              )}

              <div style={styles.actions}>
                <button type="submit" style={{ ...styles.button, flex: 1 }}>
                  Save
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonSecondary, flex: 1 }}
                  onClick={closeModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modalType === 'delete' && selectedWorkflow && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Delete Workflow</h2>
            {error && <div style={{ ...styles.warning, marginBottom: '12px', color: '#dc3545' }}>{error}</div>}
            <div style={styles.warning}>
              Are you sure you want to delete <strong>{selectedWorkflow.name}</strong>? This action
              cannot be undone.
            </div>
            <div style={styles.actions}>
              <button
                style={{ ...styles.button, ...styles.buttonDanger, flex: 1 }}
                onClick={handleDelete}
              >
                Delete
              </button>
              <button
                style={{ ...styles.button, ...styles.buttonSecondary, flex: 1 }}
                onClick={closeModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved Senders Modal */}
      {modalType === 'senders' && selectedWorkflow && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Approved Senders for {selectedWorkflow.name}</h2>
            {error && <div style={styles.warning}>{error}</div>}

            <div style={styles.senderList}>
              {approvedSenders.length === 0 ? (
                <div style={{ padding: '16px', color: '#666', textAlign: 'center' }}>
                  No approved senders yet
                </div>
              ) : (
                approvedSenders.map((sender) => (
                  <div key={sender.id} style={styles.senderItem}>
                    <span style={styles.senderEmail}>{sender.email}</span>
                    <button
                      style={styles.removeBtn}
                      onClick={() => handleRemoveSender(sender.email)}
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>

            <form style={styles.addSenderRow} onSubmit={handleAddSender}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="email"
                placeholder="email@example.com"
                value={newSenderEmail}
                onChange={(e) => setNewSenderEmail(e.target.value)}
                required
              />
              <button type="submit" style={styles.button}>
                Add
              </button>
            </form>

            <div style={{ marginTop: '16px' }}>
              <button
                style={{ ...styles.button, ...styles.buttonSecondary, width: '100%' }}
                onClick={closeModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
