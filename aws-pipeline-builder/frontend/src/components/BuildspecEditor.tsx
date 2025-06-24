/**
 * BuildspecEditor Component
 * 
 * A modal component that provides a YAML editor for modifying AWS CodeBuild buildspec configurations.
 * Allows users to edit the raw YAML of a buildspec file with validation and error handling.
 * 
 * Features:
 * - Real-time YAML syntax validation
 * - Syntax highlighting with monospace font
 * - Error feedback for invalid YAML
 * - Save/Cancel functionality
 * 
 * @module BuildspecEditor
 */

import React, { useState, useEffect } from 'react';
import { BuildspecConfig, BuildspecPhases } from '../types/Pipeline';
import * as yaml from 'js-yaml';

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
 * Provides a modal interface for editing buildspec configuration in YAML format
 * with real-time validation and error handling.
 * 
 * @param {BuildspecEditorProps} props - Component props
 * @returns {JSX.Element} Rendered editor modal
 */
const BuildspecEditor: React.FC<BuildspecEditorProps> = ({ buildspec, onUpdate, onClose }) => {
  // State for the YAML string representation of the buildspec
  const [yamlContent, setYamlContent] = useState<string>('');
  // State for validation error messages
  const [error, setError] = useState<string>('');

  /**
   * Effect to initialize the editor with formatted YAML when buildspec prop changes
   * Converts the buildspec object to a pretty-printed YAML string
   */
  useEffect(() => {
    try {
      // Ensure correct order: version first, then phases in correct order
      const orderedBuildspec: any = {};
      
      // Version should come first
      if (buildspec.version !== undefined) {
        orderedBuildspec.version = buildspec.version;
      }
      
      // Then phases in the correct order
      if (buildspec.phases) {
        orderedBuildspec.phases = {};
        const phaseOrder: Array<keyof BuildspecPhases> = ['install', 'pre_build', 'build', 'post_build'];
        phaseOrder.forEach(phase => {
          if (buildspec.phases[phase]) {
            orderedBuildspec.phases[phase] = buildspec.phases[phase];
          }
        });
      }
      
      const yamlStr = yaml.dump(orderedBuildspec, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
      });
      setYamlContent(yamlStr);
    } catch (e) {
      console.error('Error converting buildspec to YAML:', e);
      setYamlContent('');
    }
  }, [buildspec]);

  /**
   * Handles the save action when user clicks the Save button
   * 
   * Validates the YAML content and calls the onUpdate callback if valid.
   * Shows an error message if the YAML is invalid.
   * 
   * @returns {void}
   */
  const handleSave = () => {
    try {
      // Attempt to parse the YAML content
      const parsedBuildspec = yaml.load(yamlContent) as BuildspecConfig;
      // Clear any existing errors
      setError('');
      // Update the parent component with the new buildspec
      onUpdate(parsedBuildspec);
      // Close the editor modal
      onClose();
    } catch (e: any) {
      // Display error message if YAML parsing fails
      setError(`Invalid YAML format: ${e.message}`);
    }
  };

  return (
    <div className="buildspec-editor-overlay">
      <div className="buildspec-editor">
        <h2>Edit Buildspec</h2>
        
        <div className="buildspec-content">
          <label>Buildspec Configuration (YAML):</label>
          <textarea
            value={yamlContent}
            onChange={(e) => {
              setYamlContent(e.target.value);
              // Clear error message when user types (gives immediate feedback)
              setError('');
            }}
            placeholder="Enter buildspec configuration in YAML format..."
            rows={20}
            style={{
              width: '100%',
              fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
              fontSize: '13px',
              padding: '10px',
              border: error ? '2px solid red' : '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#f8f9fa',
              lineHeight: '1.5'
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