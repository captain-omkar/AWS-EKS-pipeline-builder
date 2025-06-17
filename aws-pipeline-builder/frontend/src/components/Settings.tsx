/**
 * Settings Component
 * 
 * A modal component for managing environment variable suggestions used throughout the application.
 * Allows users to add, remove, and view suggestions for different environment variables
 * that appear in autocomplete dropdowns.
 * 
 * Features:
 * - View and manage suggestions for multiple environment variables
 * - Add new suggestions for selected environment variables
 * - Remove existing suggestions
 * - Persist changes to backend
 * - Loading states for async operations
 * 
 * @module Settings
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Type definition for environment suggestions object
 * Maps environment variable names to arrays of suggestion strings
 */
interface EnvSuggestions {
  [key: string]: string[];
}

/**
 * Props interface for the Settings component
 * @interface SettingsProps
 * @property {boolean} isOpen - Controls the visibility of the settings modal
 * @property {Function} onClose - Callback function called when user closes the modal
 */
interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Settings functional component
 * 
 * Provides a modal interface for managing environment variable suggestions
 * with full CRUD functionality.
 * 
 * @param {SettingsProps} props - Component props
 * @returns {JSX.Element | null} Rendered settings modal or null if closed
 */
const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  // State for all environment variable suggestions with default values
  const [suggestions, setSuggestions] = useState<EnvSuggestions>({
    SMCREDS: ['Database', 'cmo-secrets', 'newzverse-secrets'],
    APPSETTINGS_REPO: ['modernization-appsettings-repo'],
    MANIFEST_REPO: [],
    CLUSTER_ROLE_ARN: [],
    DOCKER_REPO_DIR: []
  });
  // Currently selected environment variable for editing
  const [selectedEnv, setSelectedEnv] = useState<string>('SMCREDS');
  // Input value for new suggestion
  const [newSuggestion, setNewSuggestion] = useState<string>('');
  // Loading state for async operations
  const [loading, setLoading] = useState(false);

  /**
   * Effect to fetch latest suggestions when modal opens
   * Only fetches when modal becomes visible to avoid unnecessary API calls
   */
  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen]);

  /**
   * Fetches the current environment variable suggestions from the backend
   * 
   * Retrieves the latest suggestions and updates the local state.
   * Handles errors silently by logging to console.
   * 
   * @returns {Promise<void>}
   */
  const fetchSuggestions = async () => {
    try {
      const response = await axios.get('/api/env-suggestions');
      if (response.data.success) {
        setSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  /**
   * Adds a new suggestion to the currently selected environment variable
   * 
   * Validates input, updates local state, and persists to backend.
   * Clears input field on successful save.
   * 
   * @returns {Promise<void>}
   */
  const addSuggestion = async () => {
    // Validate input is not empty
    if (!newSuggestion.trim()) return;

    // Create updated suggestions object with new suggestion
    const updatedSuggestions = {
      ...suggestions,
      [selectedEnv]: [...(suggestions[selectedEnv] || []), newSuggestion.trim()]
    };

    try {
      setLoading(true);
      // Save updated suggestions to backend
      const response = await axios.post('/api/env-suggestions', {
        suggestions: updatedSuggestions
      });
      
      if (response.data.success) {
        // Update local state on success
        setSuggestions(updatedSuggestions);
        // Clear input field
        setNewSuggestion('');
      }
    } catch (error) {
      console.error('Error saving suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Removes a suggestion from the specified environment variable
   * 
   * Deletes the suggestion at the given index and persists the change to backend.
   * 
   * @param {string} env - The environment variable name
   * @param {number} index - The index of the suggestion to remove
   * @returns {Promise<void>}
   */
  const removeSuggestion = async (env: string, index: number) => {
    // Create updated suggestions with the item removed
    const updatedSuggestions = {
      ...suggestions,
      [env]: suggestions[env].filter((_, i) => i !== index)
    };

    try {
      setLoading(true);
      // Save updated suggestions to backend
      const response = await axios.post('/api/env-suggestions', {
        suggestions: updatedSuggestions
      });
      
      if (response.data.success) {
        // Update local state on success
        setSuggestions(updatedSuggestions);
      }
    } catch (error) {
      console.error('Error saving suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't render anything if modal is closed
  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Environment Variable Suggestions</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-content">
          <div className="env-selector">
            <label>Select Environment Variable:</label>
            <select 
              value={selectedEnv} 
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="env-select"
            >
              {Object.keys(suggestions).map(env => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>

          <div className="suggestions-section">
            <h3>Current Suggestions for {selectedEnv}:</h3>
            <div className="suggestions-list">
              {(suggestions[selectedEnv] || []).length === 0 ? (
                <p className="no-suggestions">No suggestions yet</p>
              ) : (
                suggestions[selectedEnv].map((suggestion, index) => (
                  <div key={index} className="suggestion-item">
                    <span>{suggestion}</span>
                    <button 
                      onClick={() => removeSuggestion(selectedEnv, index)}
                      className="remove-btn"
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="add-suggestion">
            <input
              type="text"
              value={newSuggestion}
              onChange={(e) => setNewSuggestion(e.target.value)}
              placeholder={`Add new suggestion for ${selectedEnv}`}
              // Allow adding suggestion by pressing Enter key
              onKeyPress={(e) => e.key === 'Enter' && addSuggestion()}
            />
            <button 
              onClick={addSuggestion} 
              disabled={loading || !newSuggestion.trim()}
              className="add-btn"
            >
              Add Suggestion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;