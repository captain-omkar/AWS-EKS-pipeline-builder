import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiUrl } from '../config';

interface ManifestTemplateEditorProps {
  onClose: () => void;
}

const ManifestTemplateEditor: React.FC<ManifestTemplateEditorProps> = ({ onClose }) => {
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchTemplate();
  }, []);

  const fetchTemplate = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/manifest-template'));
      setTemplate(response.data.template);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch manifest template:', error);
      setError('Failed to load manifest template');
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await axios.post(getApiUrl('/api/manifest-template'), {
        template: template
      });
      setSuccess('Manifest template saved successfully!');
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (error) {
      console.error('Failed to save manifest template:', error);
      setError('Failed to save manifest template');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset to the default template? This will discard your changes.')) {
      fetchTemplate();
      setSuccess('Template reset to default');
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content manifest-editor-modal">
        <div className="modal-header">
          <h2>Edit Manifest Template</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <div className="loading">Loading template...</div>
        ) : (
          <>
            <div className="editor-info">
              <p>This is the master Kubernetes manifest template used for all deployments.</p>
              <p>Available placeholders: {`{{ pipeline_name }}, {{ namespace }}, {{ app_type }}, {{ product }}, {{ image }}, {{ memory_limit }}, {{ cpu_limit }}, {{ memory_request }}, {{ cpu_request }}, {{ node_group }}`}</p>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <div className="editor-container">
              <textarea
                className="manifest-editor"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Enter your Kubernetes manifest template here..."
                rows={25}
                spellCheck={false}
              />
            </div>

            <div className="button-group">
              <button 
                className="reset-button" 
                onClick={handleReset}
                disabled={saving}
              >
                Reset to Default
              </button>
              <button 
                className="save-button" 
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
              <button 
                className="cancel-button" 
                onClick={onClose}
                disabled={saving}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ManifestTemplateEditor;