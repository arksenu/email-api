import { Workflow } from '../lib/api';
import TypeBadge from './TypeBadge';

const styles = {
  card: {
    background: '#fff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  } as React.CSSProperties,
  name: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a1a2e',
  } as React.CSSProperties,
  email: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '8px',
    fontFamily: 'monospace',
    background: '#f5f5f5',
    padding: '4px 8px',
    borderRadius: '4px',
    display: 'inline-block',
  } as React.CSSProperties,
  description: {
    fontSize: '14px',
    color: '#555',
    marginBottom: '12px',
    lineHeight: 1.5,
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #eee',
    paddingTop: '12px',
    marginTop: '12px',
  } as React.CSSProperties,
  credits: {
    fontSize: '14px',
    color: '#666',
  } as React.CSSProperties,
  publicBadge: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '4px',
    background: '#d4edda',
    color: '#155724',
  } as React.CSSProperties,
  privateBadge: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '4px',
    background: '#fff3cd',
    color: '#856404',
  } as React.CSSProperties,
};

interface Props {
  workflow: Workflow;
  onClick?: () => void;
}

export default function WorkflowCard({ workflow, onClick }: Props) {
  return (
    <div style={{ ...styles.card, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={styles.header}>
        <span style={styles.name}>{workflow.name}</span>
        <TypeBadge type={workflow.type} />
        <span style={workflow.is_public ? styles.publicBadge : styles.privateBadge}>
          {workflow.is_public ? 'Public' : 'Private'}
        </span>
      </div>
      <div style={styles.email}>{workflow.name}@mail.fly-bot.net</div>
      <div style={styles.description}>
        {workflow.description || 'No description provided.'}
      </div>
      <div style={styles.footer}>
        <span style={styles.credits}>{workflow.credits_per_task} credits per task</span>
        {workflow.total_tasks !== undefined && (
          <span style={{ fontSize: '13px', color: '#999' }}>
            {workflow.total_tasks} tasks ({workflow.completed_tasks || 0} completed)
          </span>
        )}
      </div>
    </div>
  );
}
