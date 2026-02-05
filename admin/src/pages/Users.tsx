import { useState, useEffect, FormEvent } from 'react';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  adjustCredits,
  User,
  PaginatedResponse,
} from '../lib/api';

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
  button: {
    padding: '10px 16px',
    background: '#0f4c75',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  } as React.CSSProperties,
  buttonDanger: {
    background: '#dc3545',
  } as React.CSSProperties,
  buttonSecondary: {
    background: '#6c757d',
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
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  approved: {
    background: '#d4edda',
    color: '#155724',
  } as React.CSSProperties,
  pending: {
    background: '#fff3cd',
    color: '#856404',
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
  stats: {
    fontSize: '12px',
    color: '#666',
  } as React.CSSProperties,
};

type ModalType = 'create' | 'edit' | 'credits' | 'delete' | null;

export default function Users() {
  const [data, setData] = useState<PaginatedResponse<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ email: '', credits: 0, is_approved: false });
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditReason, setCreditReason] = useState('');

  const fetchUsers = (page = 1) => {
    setLoading(true);
    getUsers(page, 20)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreate = () => {
    setFormData({ email: '', credits: 0, is_approved: false });
    setModal('create');
  };

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setFormData({ email: user.email, credits: user.credits, is_approved: user.is_approved });
    setModal('edit');
  };

  const openCredits = (user: User) => {
    setSelectedUser(user);
    setCreditAmount(0);
    setCreditReason('');
    setModal('credits');
  };

  const openDelete = (user: User) => {
    setSelectedUser(user);
    setModal('delete');
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createUser(formData);
    setModal(null);
    fetchUsers(data?.page || 1);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    await updateUser(selectedUser.id, formData);
    setModal(null);
    fetchUsers(data?.page || 1);
  };

  const handleCredits = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    await adjustCredits(selectedUser.id, creditAmount, creditReason || 'Admin adjustment');
    setModal(null);
    fetchUsers(data?.page || 1);
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    await deleteUser(selectedUser.id);
    setModal(null);
    fetchUsers(data?.page || 1);
  };

  if (loading && !data) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Users</h1>
        <button style={styles.button} onClick={openCreate}>
          Add User
        </button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Email</th>
            <th style={styles.th}>Credits</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Usage</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((user) => (
            <tr key={user.id}>
              <td style={styles.td}>{user.email}</td>
              <td style={styles.td}>{user.credits}</td>
              <td style={styles.td}>
                <span
                  style={{
                    ...styles.badge,
                    ...(user.is_approved ? styles.approved : styles.pending),
                  }}
                >
                  {user.is_approved ? 'Approved' : 'Pending'}
                </span>
              </td>
              <td style={styles.td}>
                <span style={styles.stats}>
                  {user.total_tasks || 0} tasks / {user.total_spent || 0} spent
                </span>
              </td>
              <td style={styles.td}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{ ...styles.button, padding: '6px 10px', fontSize: '12px' }}
                    onClick={() => openEdit(user)}
                  >
                    Edit
                  </button>
                  <button
                    style={{
                      ...styles.button,
                      ...styles.buttonSecondary,
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                    onClick={() => openCredits(user)}
                  >
                    Credits
                  </button>
                  <button
                    style={{
                      ...styles.button,
                      ...styles.buttonDanger,
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                    onClick={() => openDelete(user)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data && data.totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            style={styles.pageButton}
            disabled={data.page <= 1}
            onClick={() => fetchUsers(data.page - 1)}
          >
            Previous
          </button>
          <span style={{ padding: '8px' }}>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            style={styles.pageButton}
            disabled={data.page >= data.totalPages}
            onClick={() => fetchUsers(data.page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={styles.modal} onClick={() => setModal(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{modal === 'create' ? 'Add User' : 'Edit User'}</h2>
            <form style={styles.form} onSubmit={modal === 'create' ? handleCreate : handleEdit}>
              <input
                style={styles.input}
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <input
                style={styles.input}
                type="number"
                placeholder="Credits"
                value={formData.credits}
                onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
              />
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={formData.is_approved}
                  onChange={(e) => setFormData({ ...formData, is_approved: e.target.checked })}
                />
                Approved
              </label>
              <div style={styles.actions}>
                <button type="submit" style={styles.button}>
                  {modal === 'create' ? 'Create' : 'Save'}
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonSecondary }}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credits Modal */}
      {modal === 'credits' && selectedUser && (
        <div style={styles.modal} onClick={() => setModal(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Adjust Credits</h2>
            <p style={{ marginBottom: '16px', color: '#666' }}>
              {selectedUser.email} - Current: {selectedUser.credits} credits
            </p>
            <form style={styles.form} onSubmit={handleCredits}>
              <input
                style={styles.input}
                type="number"
                placeholder="Amount (positive to add, negative to deduct)"
                value={creditAmount}
                onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                required
              />
              <input
                style={styles.input}
                type="text"
                placeholder="Reason (optional)"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
              />
              <div style={styles.actions}>
                <button type="submit" style={styles.button}>
                  Adjust
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.buttonSecondary }}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && selectedUser && (
        <div style={styles.modal} onClick={() => setModal(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Delete User</h2>
            <p style={{ marginBottom: '16px' }}>
              Are you sure you want to delete <strong>{selectedUser.email}</strong>?
            </p>
            <div style={styles.actions}>
              <button style={{ ...styles.button, ...styles.buttonDanger }} onClick={handleDelete}>
                Delete
              </button>
              <button
                style={{ ...styles.button, ...styles.buttonSecondary }}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
