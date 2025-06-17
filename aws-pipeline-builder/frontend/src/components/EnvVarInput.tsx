/**
 * EnvVarInput Component
 * 
 * An intelligent input component for environment variables that provides autocomplete
 * suggestions based on predefined values. This component enhances user experience by
 * offering context-aware suggestions for common environment variable values.
 * 
 * Features:
 * - Autocomplete dropdown with suggestions
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Click-outside detection to close dropdown
 * - Filtered suggestions based on user input
 * - Async loading of suggestions from backend
 * 
 * @module EnvVarInput
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * Props interface for the EnvVarInput component
 * @interface EnvVarInputProps
 * @property {string} name - The name of the environment variable (used to fetch relevant suggestions)
 * @property {string} value - The current value of the input
 * @property {Function} onChange - Callback function called when the input value changes
 * @property {string} [placeholder] - Optional placeholder text for the input
 */
interface EnvVarInputProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * EnvVarInput functional component
 * 
 * Provides an enhanced input field with autocomplete suggestions for environment variables.
 * Manages dropdown state, keyboard navigation, and suggestion filtering.
 * 
 * @param {EnvVarInputProps} props - Component props
 * @returns {JSX.Element} Rendered input with dropdown suggestions
 */
const EnvVarInput: React.FC<EnvVarInputProps> = ({ name, value, onChange, placeholder }) => {
  // Array of suggestions for the current environment variable
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Controls visibility of the suggestions dropdown
  const [showDropdown, setShowDropdown] = useState(false);
  // Tracks the currently selected suggestion index for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Reference to the input element for focus management
  const inputRef = useRef<HTMLInputElement>(null);
  // Reference to the dropdown element for click-outside detection
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Effect to fetch suggestions when the environment variable name changes
   * Loads appropriate suggestions from the backend based on the variable name
   */
  useEffect(() => {
    fetchSuggestions();
  }, [name]);

  /**
   * Effect to handle click-outside behavior for closing the dropdown
   * Sets up and cleans up event listeners for detecting clicks outside the component
   */
  useEffect(() => {
    /**
     * Event handler for detecting clicks outside the input and dropdown
     * @param {MouseEvent} event - The mouse event object
     */
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside both the dropdown and input elements
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    // Add event listener on mount
    document.addEventListener('mousedown', handleClickOutside);
    // Remove event listener on unmount
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Fetches suggestions for the current environment variable from the backend
   * 
   * Makes an API call to retrieve predefined suggestions based on the variable name.
   * Handles errors gracefully by logging them to console.
   * 
   * @returns {Promise<void>}
   */
  const fetchSuggestions = async () => {
    try {
      const response = await axios.get('/api/env-suggestions');
      // Check if response contains suggestions for this specific env var
      if (response.data.success && response.data.suggestions[name]) {
        setSuggestions(response.data.suggestions[name]);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  /**
   * Handles input value changes
   * 
   * Updates the parent component with new value and shows dropdown with suggestions.
   * Resets the selected index for keyboard navigation.
   * 
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowDropdown(true);
    setSelectedIndex(-1);
  };

  /**
   * Handles input focus event
   * 
   * Shows the dropdown when input gains focus, but only if suggestions are available.
   */
  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowDropdown(true);
    }
  };

  /**
   * Handles suggestion selection via mouse click
   * 
   * Updates the input value with the selected suggestion and closes the dropdown.
   * 
   * @param {string} suggestion - The selected suggestion value
   */
  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowDropdown(false);
  };

  /**
   * Handles keyboard navigation for the suggestions dropdown
   * 
   * Supports:
   * - ArrowDown: Navigate to next suggestion
   * - ArrowUp: Navigate to previous suggestion
   * - Enter: Select the currently highlighted suggestion
   * - Escape: Close the dropdown
   * 
   * @param {React.KeyboardEvent<HTMLInputElement>} e - The keyboard event
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Only handle keyboard navigation when dropdown is visible and has suggestions
    if (!showDropdown || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        // Move selection down, but don't go past the last item
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Move selection up, -1 means no selection
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        // Select the highlighted suggestion if one is selected
        if (selectedIndex >= 0) {
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        // Close dropdown on escape key
        setShowDropdown(false);
        break;
    }
  };

  /**
   * Filters suggestions based on current input value
   * 
   * Performs case-insensitive filtering to show only relevant suggestions
   * that contain the current input value.
   */
  const filteredSuggestions = suggestions.filter(s => 
    s.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="env-var-wrapper">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      
      {showDropdown && filteredSuggestions.length > 0 && (
        <div ref={dropdownRef} className="env-suggestions-dropdown">
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`env-suggestion-option ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EnvVarInput;