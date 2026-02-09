import { useState, useEffect } from 'react';
import {
  getMyWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getApprovedSenders,
  addApprovedSender,
  removeApprovedSender,
  Workflow,
  ApprovedSender,
  CreateWorkflowPayload,
} from '../lib/api';
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
  createButton: {
    padding: '10px 20px',
    background: '#0f4c75',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
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
  loading: { color: '#666' } as React.CSSProperties,
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
    marginBottom: '20px',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '4px',
    display: 'block',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    minHeight: '80px',
    resize: 'vertical',
  } as React.CSSProperties,
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  } as React.CSSProperties,
  saveButton: {
    padding: '10px 20px',
    background: '#0f4c75',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    background: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    padding: '10px 20px',
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  error: {
    background: '#fee',
    color: '#c00',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
  hint: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  } as React.CSSProperties,
  senderList: {
    marginTop: '12px',
  } as React.CSSProperties,
  senderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#f8f9fa',
    borderRadius: '4px',
    marginBottom: '8px',
  } as React.CSSProperties,
  removeSender: {
    background: 'none',
    border: 'none',
    color: '#dc3545',
    cursor: 'pointer',
    fontSize: '18px',
  } as React.CSSProperties,
  addSenderRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
  actionButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  } as React.CSSProperties,
};

type ModalType = 'create' | 'edit' | 'delete' | 'senders' | null;

export default function MyWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState<CreateWorkflowPayload>({
    name: '',
    description: '',
    instruction: '',
    credits_per_task: 10,
    is_public: true,
  });

  // Senders state
  const [senders, setSenders] = useState<ApprovedSender[]>([]);
  const [newSenderEmail, setNewSenderEmail] = useState('');

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = () => {
    setLoading(true);
    getMyWorkflows()
      .then(setWorkflows)
      .finally(() => setLoading(false));
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      instruction: '',
      credits_per_task: 10,
      is_public: true,
    });
    setError('');
    setModalType('create');
  };

  const openEditModal = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setFormData({
      name: workflow.name,
      description: workflow.description || '',
      instruction: workflow.instruction || '',
      credits_per_task: workflow.credits_per_task,
      is_public: workflow.is_public,
    });
    setError('');
    setModalType('edit');
  };

  const openDeleteModal = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setModalType('delete');
  };

  const openSendersModal = async (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setNewSenderEmail('');
    try {
      const senderList = await getApprovedSenders(workflow.id);
      setSenders(senderList);
      setModalType('senders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load senders');
    }
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedWorkflow(null);
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await createWorkflow(formData);
      loadWorkflows();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkflow) return;
    setError('');

    try {
      await updateWorkflow(selectedWorkflow.id, formData);
      loadWorkflows();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update workflow');
    }
  };

  const handleDelete = async () => {
    if (!selectedWorkflow) return;

    try {
      await deleteWorkflow(selectedWorkflow.id);
      loadWorkflows();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workflow');
    }
  };

  const handleAddSender = async () => {
    if (!selectedWorkflow || !newSenderEmail) return;

    try {
      const sender = await addApprovedSender(selectedWorkflow.id, newSenderEmail);
      setSenders([...senders, sender]);
      setNewSenderEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sender');
    }
  };

  const handleRemoveSender = async (email: string) => {
    if (!selectedWorkflow) return;

    try {
      await removeApprovedSender(selectedWorkflow.id, email);
      setSenders(senders.filter((s) => s.email !== email));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove sender');
    }
  };

  if (loading) {
    return <p style={styles.loading}>Loading...</p>;
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>My Workflows</h1>
        <button style={styles.createButton} onClick={openCreateModal}>
          Create Workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div style={styles.empty}>
          <p>You haven't created any workflows yet.</p>
          <p style={{ marginTop: '8px', fontSize: '14px' }}>
            Create a workflow to build your own custom email automation.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {workflows.map((workflow) => (
            <div key={workflow.id}>
              <WorkflowCard workflow={workflow} />
              <div style={styles.actions}>
                <button
                  style={{ ...styles.actionButton, background: '#0f4c75', color: '#fff' }}
                  onClick={() => openEditModal(workflow)}
                >
                  Edit
                </button>
                {!workflow.is_public && (
                  <button
                    style={{ ...styles.actionButton, background: '#6c757d', color: '#fff' }}
                    onClick={() => openSendersModal(workflow)}
                  >
                    Senders
                  </button>
                )}
                <button
                  style={{ ...styles.actionButton, background: '#dc3545', color: '#fff' }}
                  onClick={() => openDeleteModal(workflow)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(modalType === 'create' || modalType === 'edit') && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalType === 'create' ? 'Create Workflow' : 'Edit Workflow'}
            </h2>
            <form style={styles.form} onSubmit={modalType === 'create' ? handleCreate : handleUpdate}>
              {error && <div style={styles.error}>{error}</div>}

              <div>
                <label style={styles.label}>Name</label>
                <input
                  style={styles.input}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="my-workflow"
                />
                <p style={styles.hint}>Lowercase letters, numbers, and hyphens only. This becomes the email address.</p>
              </div>

              <div>
                <label style={styles.label}>Description</label>
                <textarea
                  style={styles.textarea as React.CSSProperties}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What does this workflow do?"
                />
              </div>

              <div>
                <label style={styles.label}>Instructions</label>
                <textarea
                  style={{ ...styles.textarea, minHeight: '120px' } as React.CSSProperties}
                  value={formData.instruction}
                  onChange={(e) => setFormData({ ...formData, instruction: e.target.value })}
                  placeholder="Instructions prepended to every request..."
                />
                <p style={styles.hint}>
                  These instructions are added before the user's email content when processing tasks.
                </p>
              </div>

              <div>
                <label style={styles.label}>Credits per Task</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={formData.credits_per_task}
                  onChange={(e) => setFormData({ ...formData, credits_per_task: parseInt(e.target.value) || 10 })}
                />
              </div>

              <div style={styles.checkbox}>
                <input
                  type="checkbox"
                  id="is_public"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                />
                <label htmlFor="is_public">Public (anyone can use this workflow)</label>
              </div>

              <div style={styles.buttons}>
                <button type="submit" style={styles.saveButton}>
                  {modalType === 'create' ? 'Create' : 'Save'}
                </button>
                <button type="button" style={styles.cancelButton} onClick={closeModal}>
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
            <p>Are you sure you want to delete <strong>{selectedWorkflow.name}</strong>?</p>
            <p style={{ color: '#666', marginTop: '8px', fontSize: '14px' }}>
              This action cannot be undone.
            </p>
            <div style={styles.buttons}>
              <button style={styles.deleteButton} onClick={handleDelete}>
                Delete
              </button>
              <button style={styles.cancelButton} onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Senders Modal */}
      {modalType === 'senders' && selectedWorkflow && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Approved Senders</h2>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
              Only these email addresses can use your private workflow.
            </p>

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.senderList}>
              {senders.length === 0 ? (
                <p style={{ color: '#666', fontSize: '14px' }}>No approved senders yet.</p>
              ) : (
                senders.map((sender) => (
                  <div key={sender.id} style={styles.senderItem}>
                    <span>{sender.email}</span>
                    <button
                      style={styles.removeSender}
                      onClick={() => handleRemoveSender(sender.email)}
                    >
                      x
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={styles.addSenderRow}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="email"
                placeholder="email@example.com"
                value={newSenderEmail}
                onChange={(e) => setNewSenderEmail(e.target.value)}
              />
              <button
                style={{ ...styles.saveButton, padding: '10px 16px' }}
                onClick={handleAddSender}
                disabled={!newSenderEmail}
              >
                Add
              </button>
            </div>

            <div style={{ marginTop: '20px' }}>
              <button style={styles.cancelButton} onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
