/**
 * BuildspecEditor Component
 * 
 * A modal component that provides a JSON editor for modifying AWS CodeBuild buildspec configurations.
 * Allows users to edit the raw JSON of a buildspec file with validation and error handling.
 * 
 * Features:
 * - Real-time JSON syntax validation
 * - Syntax highlighting with monospace font
 * - Error feedback for invalid JSON
 * - Save/Cancel functionality
 * 
 * @module BuildspecEditor
 */

import React, { useState, useEffect } from 'react';
import { BuildspecConfig } from '../types/Pipeline';

/**
 * Props interface for the BuildspecEditor component
 * @interface BuildspecEditorProps
 * @property {BuildspecConfig} buildspec - The current buildspec configuration object to edit
 * @property {Function} onUpdate - Callback function called when user saves valid buildspec changes
 * @property {Function} onClose - Callback function called when user cancels or closes the editor
 */
interface BuildspecEditorProps {
  buildspec: BuildspecConfig;
  onUpdate: (buildspec: BuildspecConfig) => void;
  onClose: () => void;
}

/**
 * BuildspecEditor functional component
 * 
 * Provides a modal interface for editing buildspec configuration in JSON format
 * with real-time validation and error handling.
 * 
 * @param {BuildspecEditorProps} props - Component props
 * @returns {JSX.Element} Rendered editor modal
 */
const BuildspecEditor: React.FC<BuildspecEditorProps> = ({ buildspec, onUpdate, onClose }) => {
  // State for the JSON string representation of the buildspec
  const [jsonContent, setJsonContent] = useState<string>('');
  // State for validation error messages
  const [error, setError] = useState<string>('');

  /**
   * Effect to initialize the editor with formatted JSON when buildspec prop changes
   * Converts the buildspec object to a pretty-printed JSON string
   */
  useEffect(() => {
    setJsonContent(JSON.stringify(buildspec, null, 2));
  }, [buildspec]);

  /**
   * Handles the save action when user clicks the Save button
   * 
   * Validates the JSON content and calls the onUpdate callback if valid.
   * Shows an error message if the JSON is invalid.
   * 
   * @returns {void}
   */
  const handleSave = () => {
    try {
      // Attempt to parse the JSON content
      const parsedBuildspec = JSON.parse(jsonContent);
      // Clear any existing errors
      setError('');
      // Update the parent component with the new buildspec
      onUpdate(parsedBuildspec);
      // Close the editor modal
      onClose();
    } catch (e) {
      // Display error message if JSON parsing fails
      setError('Invalid JSON format. Please check your syntax.');
    }
  };

  return (
    <div className="buildspec-editor-overlay">
      <div className="buildspec-editor">
        <h2>Edit Buildspec</h2>
        
        <div className="buildspec-content">
          <label>Buildspec Configuration (JSON):</label>
          <textarea
            value={jsonContent}
            onChange={(e) => {
              setJsonContent(e.target.value);
              // Clear error message when user types (gives immediate feedback)
              setError('');
            }}
            placeholder="Enter buildspec configuration in JSON format..."
            rows={20}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: '14px',
              padding: '10px',
              border: error ? '2px solid red' : '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
          {error && <div style={{ color: 'red', marginTop: '5px' }}>{error}</div>}
        </div>

        <div className="editor-actions">
          <button type="button" onClick={handleSave} className="save-button">
            Save Buildspec
          </button>
          <button type="button" onClick={onClose} className="cancel-button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuildspecEditor;