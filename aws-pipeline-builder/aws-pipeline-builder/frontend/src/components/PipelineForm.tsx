import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PipelineConfig, EnvironmentVariable, BuildspecConfig, DeploymentConfig as DeploymentConfigType, ScalingConfig } from '../types/Pipeline';
import axios from 'axios';
import BuildspecEditor from './BuildspecEditor';
import EnvVarInput from './EnvVarInput';
import DeploymentConfigInline from './DeploymentConfigInline';
import ScalingConfigComponent from './ScalingConfig';
import { getDefaultBuildspec } from '../utils/buildspecTemplate';
import { getApiUrl } from '../config';

/**
 * MAIN PIPELINE FORM COMPONENT
 * ============================
 * 
 * This is the core component for AWS Pipeline Builder that handles:
 * 
 * FEATURES:
 * --------
 * 1. Creating new AWS CodePipeline pipelines with full configuration
 * 2. Editing existing pipelines (branch, deployment config, appsettings, scaling)
 * 3. Managing environment variables with autocomplete suggestions
 * 4. Configuring deployment settings (namespace, resources, service accounts)
 * 5. Setting up scaling configuration (HPA or KEDA Kafka-based)
 * 6. Handling appsettings.json file management (upload or edit existing)
 * 7. Buildspec configuration (file path or inline YAML content)
 * 
 * MODES:
 * ------
 * - CREATE MODE: New pipeline creation with default values
 * - EDIT MODE: Existing pipeline modification with pre-loaded data
 * 
 * AWS RESOURCES CREATED:
 * ---------------------
 * - CodePipeline: {pipeline-name}
 * - CodeBuild Project: {pipeline-name}-build
 * - ECR Repository: {pipeline-name}
 * - S3 Bucket: {pipeline-name}-artifacts-{timestamp}
 * - CodeCommit Files: appsettings.json and Kubernetes manifests
 * 
 * KEY FIXES IMPLEMENTED:
 * ---------------------
 * - Fixed appsettings "blinking" by preventing repeated API calls
 * - Improved deployment config saving with proper backend metadata updates
 * - Enhanced useEffect dependencies to prevent unnecessary re-renders
 * - Added comprehensive error handling and validation
 * 
 * TECHNICAL NOTES:
 * ---------------
 * - Uses React Router for navigation and state management
 * - Integrates with Flask backend API for all AWS operations
 * - Supports pagination and search for 200+ pipelines
 * - Implements collapsible sections for better UX
 * - Handles both file uploads and direct content editing
 */
const PipelineForm: React.FC = () => {
  // ============================================================================
  // COMPONENT STATE AND ROUTING SETUP
  // ============================================================================
  
  const location = useLocation();
  const navigate = useNavigate();
  // Get pipeline data from router state or session storage (for page refresh)
  const editPipeline = location.state?.pipeline || JSON.parse(sessionStorage.getItem('editPipeline') || 'null');
  const isEditMode = location.state?.editMode || !!editPipeline;
  
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Default buildspec template loaded from utils
  const [defaultBuildspec, setDefaultBuildspec] = useState<BuildspecConfig>({ version: 0.2, phases: {} });
  
  // Main pipeline configurations array (supports multiple pipelines in create mode)
  // In edit mode, initialize with edit pipeline data if available
  const [pipelines, setPipelines] = useState<PipelineConfig[]>(() => {
    if (isEditMode && editPipeline) {
      return [{
        pipelineName: editPipeline.name || '',
        repositoryName: editPipeline.repositoryName || '',
        branchName: editPipeline.branchName || editPipeline.branch || '',
        buildspecPath: editPipeline.buildspecPath || 'buildspec.yml',
        useBuildspecFile: editPipeline.useBuildspecFile || false,
        buildspec: editPipeline.buildspec || { version: 0.2, phases: {} },
        computeType: editPipeline.computeType || 'BUILD_GENERAL1_SMALL',
        environmentVariables: editPipeline.environmentVariables || [
          { name: 'MANIFEST_REPO', value: '' },
          { name: 'APPSETTINGS_REPO', value: '' }
        ],
        appsettingsFile: undefined,
        appsettingsContent: undefined,
        deploymentConfig: editPipeline.deploymentConfig
      }];
    }
    return [{
      pipelineName: '',
      repositoryName: '',
      branchName: '',
      buildspecPath: 'buildspec.yml',
      useBuildspecFile: false, // Default to inline buildspec
      buildspec: { version: 0.2, phases: {} },
      computeType: 'BUILD_GENERAL1_SMALL',
      environmentVariables: [
        { name: 'MANIFEST_REPO', value: '' },
        { name: 'APPSETTINGS_REPO', value: '' }
      ],
      appsettingsFile: undefined,
      appsettingsContent: undefined,
      deploymentConfig: undefined
    }];
  });
  
  // UI State Management
  const [loading, setLoading] = useState(false); // Form submission loading state
  const [message, setMessage] = useState(''); // Success/error messages
  const [editingBuildspecIndex, setEditingBuildspecIndex] = useState<number | null>(null); // Which pipeline's buildspec is being edited
  
  // Collapsible Section State (tracks which pipeline sections are expanded)
  const [expandedEnvVars, setExpandedEnvVars] = useState<number[]>([]);
  const [expandedDeploymentConfig, setExpandedDeploymentConfig] = useState<number[]>([]);
  const [expandedScalingConfig, setExpandedScalingConfig] = useState<number[]>([]);
  const [expandedBuildConfig, setExpandedBuildConfig] = useState<number[]>([]);
  
  // Appsettings Management State (CRITICAL: Fixed to prevent "blinking")
  const [existingAppsettings, setExistingAppsettings] = useState<string>(''); // Content from CodeCommit
  const [editingAppsettings, setEditingAppsettings] = useState<boolean>(false); // Edit mode toggle
  const [appsettingsError, setAppsettingsError] = useState<string>(''); // Error messages
  const [appsettingsFetched, setAppsettingsFetched] = useState<boolean>(false); // Prevent repeated API calls
  const [appsettingsInputMode, setAppsettingsInputMode] = useState<'upload' | 'paste'>('upload'); // Input mode for create mode
  
  // Manifest Content State (for edit mode only)
  const [showManifestContent, setShowManifestContent] = useState<boolean>(false); // Show/hide manifest content
  const [manifestContent, setManifestContent] = useState<string>(''); // Manifest content from CodeCommit
  const [loadingManifest, setLoadingManifest] = useState<boolean>(false); // Loading state for manifest fetch
  
  // Lock Management State
  const [userId] = useState(() => {
    // Generate or retrieve user ID for lock management
    let id = localStorage.getItem('userId');
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('userId', id);
    }
    return id;
  });
  const [lockRefreshInterval, setLockRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Pipeline Name Validation State
  const [pipelineNameErrors, setPipelineNameErrors] = useState<{ [key: number]: string[] }>({});
  const [validatingPipelineName, setValidatingPipelineName] = useState<{ [key: number]: boolean }>({});

  // ============================================================================
  // COMPONENT INITIALIZATION EFFECTS
  // ============================================================================
  
  /**
   * EFFECT 1: Load Default Buildspec Template
   * -----------------------------------------
   * Loads the default buildspec configuration from utils on component mount.
   * CRITICAL FIX: Removed dependencies to prevent repeated loading and UI flickering.
   * Only runs once when component mounts.
   */
  useEffect(() => {
    const loadDefaultBuildspec = async () => {
      const buildspec = await getDefaultBuildspec();
      setDefaultBuildspec(buildspec);
      // Update the first pipeline with the loaded buildspec only on initial load
      if (!isEditMode) {
        setPipelines(prev => [{
          ...prev[0],
          buildspec: buildspec
        }, ...prev.slice(1)]);
      }
    };
    loadDefaultBuildspec();
  }, []); // EMPTY DEPENDENCIES - Critical fix to prevent re-running

  // ============================================================================
  // LOCK MANAGEMENT FUNCTIONS
  // ============================================================================
  
  /**
   * ACQUIRE LOCK FOR PIPELINE EDITING
   * ---------------------------------
   * Acquires a lock to prevent concurrent editing of the same pipeline
   */
  const acquireLock = async (pipelineName: string) => {
    try {
      const response = await axios.post(getApiUrl(`/api/pipelines/${pipelineName}/lock`), {
        userId: userId
      });
      
      if (response.data.success) {
        // Set up refresh interval to keep lock active
        const interval = setInterval(() => {
          refreshLock(pipelineName);
        }, 5 * 60 * 1000); // Refresh every 5 minutes
        setLockRefreshInterval(interval);
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        const errorMessage = error.response.data.message || 'Pipeline is locked by another user';
        setMessage(`Error: ${errorMessage}`);
        // Prevent editing by redirecting back to pipeline list
        setTimeout(() => {
          navigate('/pipelines');
        }, 3000);
      }
    }
  };
  
  /**
   * REFRESH LOCK TO PREVENT TIMEOUT
   * -------------------------------
   * Refreshes the lock periodically to maintain editing session
   */
  const refreshLock = async (pipelineName: string) => {
    try {
      await axios.put(getApiUrl(`/api/pipelines/${pipelineName}/lock`), {
        userId: userId
      });
    } catch (error) {
      console.error('Failed to refresh lock:', error);
    }
  };
  
  /**
   * RELEASE LOCK WHEN DONE EDITING
   * ------------------------------
   * Releases the lock on the pipeline
   */
  const releaseLock = async (pipelineName: string) => {
    try {
      await axios.delete(getApiUrl(`/api/pipelines/${pipelineName}/lock`), {
        data: { userId: userId }
      });
    } catch (error) {
      console.error('Failed to release lock:', error);
    }
  };

  // ============================================================================
  // APPSETTINGS MANAGEMENT FUNCTIONS
  // ============================================================================
  
  /**
   * FETCH EXISTING APPSETTINGS FROM CODECOMMIT
   * ------------------------------------------
   * Retrieves appsettings.json content from CodeCommit repository for editing.
   * 
   * CRITICAL FIX: Added appsettingsFetched flag to prevent repeated API calls
   * that were causing the "blinking" issue in edit mode.
   * 
   * @param pipelineName - Name of the pipeline to fetch appsettings for
   */
  const fetchExistingAppsettings = async (pipelineName: string) => {
    if (appsettingsFetched) return; // CRITICAL: Prevent multiple fetches
    
    try {
      setAppsettingsError('');
      const response = await axios.get(getApiUrl(`/api/pipelines/${pipelineName}/appsettings`));
      
      if (response.data.success) {
        setExistingAppsettings(response.data.content);
        // Auto-populate the form with existing content
        updatePipeline(0, 'appsettingsContent', response.data.content);
        setAppsettingsFetched(true);
      } else {
        setAppsettingsError(response.data.error || 'Failed to fetch appsettings');
        console.warn('No existing appsettings found:', response.data.error);
        setAppsettingsFetched(true);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to fetch appsettings';
      setAppsettingsError(errorMsg);
      console.error('Error fetching appsettings:', error);
      setAppsettingsFetched(true);
    }
  };

  /**
   * EFFECT 2: Load Pipeline Data in Edit Mode
   * -----------------------------------------
   * Initializes the form with existing pipeline data when editing.
   * Expands relevant sections and fetches existing appsettings content.
   * 
   * DEPENDENCIES: isEditMode, editPipeline, defaultBuildspec
   * - Only runs when switching to edit mode or when pipeline data changes
   */
  useEffect(() => {
    if (isEditMode && editPipeline) {
      console.log('📝 Edit mode: Loading pipeline data and acquiring lock for:', editPipeline.name);
      console.log('📝 Full editPipeline object:', editPipeline);
      
      // Convert metadata format to form format
      const pipelineConfig: PipelineConfig = {
        pipelineName: editPipeline.name,
        repositoryName: editPipeline.repositoryName,
        branchName: editPipeline.branchName || editPipeline.branch || '',
        buildspecPath: editPipeline.buildspecPath || 'buildspec.yml',
        useBuildspecFile: editPipeline.useBuildspecFile || false,
        buildspec: editPipeline.buildspec || defaultBuildspec,
        computeType: editPipeline.computeType || 'BUILD_GENERAL1_SMALL',
        environmentVariables: editPipeline.environmentVariables || [],
        deploymentConfig: editPipeline.deploymentConfig,
        scalingConfig: editPipeline.scalingConfig
      };
      setPipelines([pipelineConfig]);
      
      // Auto-expand sections that have existing data for better UX
      if (editPipeline.environmentVariables?.length > 0) {
        setExpandedEnvVars([0]);
      }
      if (editPipeline.deploymentConfig) {
        setExpandedDeploymentConfig([0]);
      }
      if (editPipeline.scalingConfig) {
        setExpandedScalingConfig([0]);
      }
      
      // Fetch existing appsettings content from CodeCommit
      fetchExistingAppsettings(editPipeline.name);
      
      // Acquire lock for editing (only once)
      acquireLock(editPipeline.name);
      
      // Clear session storage to prevent stale data
      sessionStorage.removeItem('editPipeline');
    }
  }, [isEditMode, editPipeline?.name]); // Simplified dependencies

  /**
   * EFFECT: Cleanup lock on component unmount and browser close
   * ---------------------------------------------------------
   * Ensures lock is released when user navigates away or closes browser
   */
  useEffect(() => {
    // Handle browser close/refresh events
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (isEditMode && editPipeline) {
        console.log('🔓 Browser closing, releasing lock for:', editPipeline.name);
        try {
          // Try async first
          await axios.delete(getApiUrl(`/api/pipelines/${editPipeline.name}/lock`), {
            data: { userId }
          });
        } catch (error) {
          // Fallback to beacon for unreliable network
          navigator.sendBeacon(
            getApiUrl(`/api/pipelines/${editPipeline.name}/lock-beacon`),
            JSON.stringify({ userId })
          );
        }
      }
    };

    // Add event listener for browser close
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Cleanup on unmount
    return () => {
      // Remove event listener
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      if (isEditMode && editPipeline) {
        console.log('🔓 Component unmounting, releasing lock for:', editPipeline.name);
        releaseLock(editPipeline.name);
        if (lockRefreshInterval) {
          clearInterval(lockRefreshInterval);
        }
      }
    };
  }, [isEditMode, editPipeline?.name, userId]); // Include dependencies for beforeunload

  /**
   * EFFECT 3: Debounced Pipeline Name Validation
   * -------------------------------------------
   * Validates pipeline names with a 500ms debounce to avoid excessive API calls
   */
  useEffect(() => {
    const timers: { [key: number]: NodeJS.Timeout } = {};
    
    pipelines.forEach((pipeline, index) => {
      if (pipeline.pipelineName && !isEditMode) {
        timers[index] = setTimeout(() => {
          validatePipelineName(pipeline.pipelineName, index);
        }, 500);
      }
    });
    
    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer));
    };
  }, [pipelines.map(p => p.pipelineName).join(','), isEditMode]);

  /**
   * ADD NEW PIPELINE CONFIGURATION
   * ------------------------------
   * Creates a new pipeline form entry with default values.
   * Only available in CREATE MODE - disabled in edit mode.
   * Supports multi-pipeline batch creation.
   */
  const addPipeline = () => {
    setPipelines([...pipelines, {
      pipelineName: '',
      repositoryName: '',
      branchName: '',
      buildspecPath: 'buildspec.yml',
      useBuildspecFile: false,
      buildspec: defaultBuildspec,
      computeType: 'BUILD_GENERAL1_SMALL',
      environmentVariables: [
        { name: 'MANIFEST_REPO', value: '' },
        { name: 'APPSETTINGS_REPO', value: '' }
      ],
      appsettingsFile: undefined,
      appsettingsContent: undefined
    }]);
  };

  /**
   * REMOVE PIPELINE CONFIGURATION
   * -----------------------------
   * Removes a pipeline form entry by index.
   * Only available in CREATE MODE for multi-pipeline forms.
   * Prevents removal if only one pipeline remains.
   */
  const removePipeline = (index: number) => {
    setPipelines(pipelines.filter((_, i) => i !== index));
  };

  /**
   * UPDATE PIPELINE CONFIGURATION FIELD
   * -----------------------------------
   * Updates a specific field in a pipeline configuration by index.
   * Handles all pipeline properties including nested objects.
   * Used by all form inputs and configuration components.
   * 
   * @param index - Pipeline index in the pipelines array
   * @param field - Field name from PipelineConfig interface
   * @param value - New value for the field
   */
  const updatePipeline = (index: number, field: keyof PipelineConfig, value: any) => {
    const updated = [...pipelines];
    updated[index] = { ...updated[index], [field]: value };
    setPipelines(updated);
  };

  /**
   * HANDLE APPSETTINGS FILE UPLOAD
   * ------------------------------
   * Processes appsettings.json file upload for a specific pipeline.
   * Reads file content and stores both file object and content string.
   * Supports both new file uploads and replacing existing content.
   * 
   * @param index - Pipeline index in the pipelines array
   * @param file - File object from input or null to clear
   */
  const handleAppsettingsUpload = (index: number, file: File | null) => {
    console.log('handleAppsettingsUpload called:', { index, file, fileName: file?.name, fileSize: file?.size });
    
    if (!file) {
      updatePipeline(index, 'appsettingsFile', undefined);
      updatePipeline(index, 'appsettingsContent', undefined);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      console.log('File read successfully:', { fileName: file.name, contentLength: content?.length });
      updatePipeline(index, 'appsettingsFile', file);
      updatePipeline(index, 'appsettingsContent', content);
    };
    reader.onerror = (e) => {
      console.error('Error reading file:', e);
    };
    reader.readAsText(file);
  };

  /**
   * ENVIRONMENT VARIABLE MANAGEMENT FUNCTIONS
   * =========================================
   * Functions for managing environment variables within pipeline configurations.
   * Supports dynamic addition, updating, and removal of env vars.
   */

  /**
   * Add a new empty environment variable to a specific pipeline
   */
  const addEnvironmentVariable = (pipelineIndex: number) => {
    const updated = [...pipelines];
    updated[pipelineIndex].environmentVariables.push({ name: '', value: '' });
    setPipelines(updated);
  };

  /**
   * Update an environment variable's name or value in a specific pipeline
   */
  const updateEnvironmentVariable = (pipelineIndex: number, varIndex: number, field: keyof EnvironmentVariable, value: string) => {
    const updated = [...pipelines];
    updated[pipelineIndex].environmentVariables[varIndex][field] = value;
    setPipelines(updated);
  };

  /**
   * Remove an environment variable from a specific pipeline
   */
  const removeEnvironmentVariable = (pipelineIndex: number, varIndex: number) => {
    const updated = [...pipelines];
    updated[pipelineIndex].environmentVariables.splice(varIndex, 1);
    setPipelines(updated);
  };

  /**
   * Update the buildspec configuration for a specific pipeline
   */
  const updateBuildspec = (index: number, buildspec: BuildspecConfig) => {
    const updated = [...pipelines];
    updated[index].buildspec = buildspec;
    setPipelines(updated);
  };

  /**
   * Toggle the expansion state of environment variables section for a pipeline
   */
  const toggleEnvVars = (pipelineIndex: number) => {
    if (expandedEnvVars.includes(pipelineIndex)) {
      setExpandedEnvVars(expandedEnvVars.filter(i => i !== pipelineIndex));
    } else {
      setExpandedEnvVars([...expandedEnvVars, pipelineIndex]);
    }
  };

  /**
   * Validate pipeline name against AWS requirements and check for existing pipelines
   */
  const validatePipelineName = async (pipelineName: string, pipelineIndex: number) => {
    if (!pipelineName) {
      setPipelineNameErrors(prev => ({ ...prev, [pipelineIndex]: [] }));
      return;
    }

    setValidatingPipelineName(prev => ({ ...prev, [pipelineIndex]: true }));
    
    try {
      const response = await axios.post(getApiUrl('/api/validate-pipeline-name'), {
        pipelineName: pipelineName
      });
      
      if (response.data.success) {
        setPipelineNameErrors(prev => ({ 
          ...prev, 
          [pipelineIndex]: response.data.errors || [] 
        }));
      }
    } catch (error) {
      console.error('Pipeline name validation error:', error);
      setPipelineNameErrors(prev => ({ 
        ...prev, 
        [pipelineIndex]: ['Failed to validate pipeline name'] 
      }));
    } finally {
      setValidatingPipelineName(prev => ({ ...prev, [pipelineIndex]: false }));
    }
  };

  /**
   * CONFIGURATION SAVE FUNCTIONS
   * ============================
   * Functions for saving complex configuration objects to pipeline state.
   * These are called by child components when configurations are completed.
   */

  /**
   * Save deployment configuration for a pipeline.
   * Called by DeploymentConfigInline component when user completes config.
   */
  const saveDeploymentConfig = (index: number, config: DeploymentConfigType) => {
    updatePipeline(index, 'deploymentConfig', config);
  };

  /**
   * Save scaling configuration for a pipeline.
   * Called by ScalingConfigComponent when user completes scaling setup.
   */
  const saveScalingConfig = (index: number, config: ScalingConfig) => {
    updatePipeline(index, 'scalingConfig', config);
  };

  /**
   * MAIN FORM SUBMISSION HANDLER
   * ============================
   * Handles both CREATE and EDIT modes with different API endpoints and logic.
   * 
   * CREATE MODE:
   * -----------
   * - Sends multiple pipelines to POST /api/pipelines
   * - Creates all AWS resources (CodePipeline, CodeBuild, ECR, S3)
   * - Uploads appsettings and manifests to CodeCommit
   * - Saves metadata for each created pipeline
   * - Resets form on success
   * 
   * EDIT MODE:
   * ---------
   * - Sends single pipeline to POST /api/pipelines/{name}/update
   * - Updates only modifiable aspects (branch, appsettings, deployment config)
   * - Updates existing files in CodeCommit repositories
   * - Updates pipeline metadata with new configuration
   * - Redirects to pipeline list on success
   * 
   * Error Handling:
   * - Displays user-friendly error messages
   * - Logs detailed errors to console for debugging
   * - Maintains form state on errors for user correction
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const pipelineData = pipelines.map(p => ({ 
        ...p, 
        appsettingsContent: p.appsettingsContent,
        deploymentConfig: p.deploymentConfig,
        scalingConfig: p.scalingConfig
      }));
      
      // Log what we're sending
      console.log('Sending pipeline data:', pipelineData.map(p => ({
        pipelineName: p.pipelineName,
        hasAppsettingsContent: !!p.appsettingsContent,
        appsettingsContentLength: p.appsettingsContent?.length
      })));
      
      let response;
      
      if (isEditMode) {
        // Update existing pipeline
        // In edit mode, get pipeline name from editPipeline or pipelines state
        const pipelineName = pipelines[0].pipelineName?.trim() || editPipeline?.name?.trim();
        console.log('📝 Edit mode update - Pipeline name:', pipelineName);
        console.log('📝 Edit mode update - editPipeline.name:', editPipeline?.name);
        console.log('📝 Edit mode update - pipelines[0].pipelineName:', pipelines[0].pipelineName);
        if (!pipelineName) {
          setMessage('Error: Pipeline name is required for update. Please ensure the pipeline is properly loaded.');
          setLoading(false);
          return;
        }
        
        console.log('Updating pipeline with data:', pipelineData[0]);
        response = await axios.post(getApiUrl(`/api/pipelines/${encodeURIComponent(pipelineName)}/update`), {
          pipeline: pipelineData[0],
          userId: userId
        });
        console.log('Update response:', response.data);
      } else {
        // Create new pipeline(s)
        response = await axios.post(getApiUrl('/api/pipelines'), {
          pipelines: pipelineData
        });
      }

      if (response.data.success) {
        if (isEditMode) {
          setMessage(`Successfully updated pipeline: ${pipelines[0].pipelineName}`);
          // Release the lock after successful update
          await releaseLock(pipelines[0].pipelineName);
          if (lockRefreshInterval) {
            clearInterval(lockRefreshInterval);
            setLockRefreshInterval(null);
          }
          // Redirect back to pipeline list after successful update
          setTimeout(() => {
            navigate('/pipelines');
          }, 2000);
        } else {
          // Save metadata for each created pipeline
          for (let i = 0; i < pipelines.length; i++) {
            const pipeline = pipelines[i];
            const createdPipeline = response.data.pipelines[i];
            
            if (createdPipeline && createdPipeline.success !== false) {
              try {
                await axios.post(getApiUrl('/api/pipeline-metadata'), {
                  pipeline: {
                    name: pipeline.pipelineName,
                    repositoryName: pipeline.repositoryName,
                    branchName: pipeline.branchName,
                    buildspecPath: pipeline.buildspecPath,
                    useBuildspecFile: pipeline.useBuildspecFile,
                    computeType: pipeline.computeType,
                    environmentVariables: pipeline.environmentVariables,
                    deploymentConfig: pipeline.deploymentConfig,
                    scalingConfig: pipeline.scalingConfig,
                    pipelineArn: createdPipeline.pipelineArn,
                    resources: {
                      pipeline: createdPipeline.pipelineName,
                      codebuild: `${createdPipeline.pipelineName}-build`,
                      ecrRepository: pipeline.pipelineName,
                      appsettingsRepo: pipeline.environmentVariables.find(e => e.name === 'APPSETTINGS_REPO')?.value,
                      manifestRepo: pipeline.environmentVariables.find(e => e.name === 'MANIFEST_REPO')?.value
                    }
                  }
                });
              } catch (metadataError) {
                console.error('Failed to save pipeline metadata:', metadataError);
              }
            }
          }
          
          const successfulPipelines = response.data.pipelines.filter((p: any) => p.success !== false);
          const failedPipelines = response.data.pipelines.filter((p: any) => p.success === false);
          
          let message = '';
          if (successfulPipelines.length > 0) {
            message += `Successfully created ${successfulPipelines.length} pipeline(s): ${successfulPipelines.map((p: any) => p.pipelineName || p.name).join(', ')}. `;
          }
          if (failedPipelines.length > 0) {
            message += `Failed to create ${failedPipelines.length} pipeline(s): `;
            failedPipelines.forEach((p: any) => {
              message += `\n${p.name}: ${p.error}`;
            });
          }
          setMessage(message);
          setPipelines([{
            pipelineName: '',
            repositoryName: '',
            branchName: '',
            buildspecPath: 'buildspec.yml',
            useBuildspecFile: false,
            buildspec: defaultBuildspec,
            computeType: 'BUILD_GENERAL1_SMALL',
            environmentVariables: [],
            appsettingsFile: undefined,
            appsettingsContent: undefined
          }]);
        }
      } else {
        setMessage(`Error: ${response.data.error}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // COMPONENT RENDER
  // ============================================================================
  // 
  // UI STRUCTURE:
  // ------------
  // 1. Header with logo and mode indicator
  // 2. Edit mode info panel (only in edit mode)
  // 3. Main form with pipeline configurations
  // 4. Submit button with loading states
  // 5. Success/error message display
  // 6. BuildspecEditor modal (when editing buildspec)
  //
  // KEY UI FEATURES:
  // ---------------
  // - Responsive design with collapsible sections
  // - Visual indicators for edit mode (different colors, read-only fields)
  // - Real-time validation and feedback
  // - Progress indicators during form submission
  // - Conditional rendering based on mode and configuration state

  return (
    <div className="pipeline-form">
      {/* APPLICATION HEADER */}
      <div className="header">
        <img src="/locobuzz-logo.jpeg" alt="Locobuzz Logo" />
        <h1>Locobuzz Pipelines {isEditMode ? '- Edit Mode' : ''}</h1>
      </div>
      
      {/* EDIT MODE INFO PANEL - Only visible when editing existing pipeline */}
      {isEditMode && (
        <div className="section" style={{ backgroundColor: '#e3f2fd', border: '1px solid #1976d2' }}>
          <h3 style={{ color: '#1976d2' }}>Editing Pipeline: {editPipeline?.name}</h3>
          <p>You can modify the branch name, deployment configuration, and re-upload appsettings.json</p>
          <button 
            type="button" 
            onClick={async () => {
              // Release lock when canceling edit
              if (editPipeline) {
                await releaseLock(editPipeline.name);
                if (lockRefreshInterval) {
                  clearInterval(lockRefreshInterval);
                  setLockRefreshInterval(null);
                }
              }
              navigate('/pipelines');
            }}
            style={{ marginTop: '10px' }}
          >
            Cancel Edit
          </button>
        </div>
      )}
      
      {/* MAIN PIPELINE FORM */}
      <form onSubmit={handleSubmit}>
        <div className="section">
          <h2>{isEditMode ? 'Edit Pipeline' : 'Pipelines'}</h2>
          {/* PIPELINE CONFIGURATIONS LOOP - Supports multiple pipelines in create mode */}
          {pipelines.map((pipeline, pIndex) => (
            <div key={pIndex} className="pipeline-config">
              <h3>{isEditMode ? `Editing: ${pipeline.pipelineName}` : `Pipeline ${pIndex + 1}`}</h3>
              
              {/* BASIC PIPELINE INFORMATION - Some fields read-only in edit mode */}
              <div className="form-group">
                <label>
                  Pipeline Name: 
                  {isEditMode && <span style={{ color: '#666' }}>(Read-only)</span>}
                  {!isEditMode && (
                    <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '10px' }}>
                      (3-60 characters, lowercase, alphanumeric and hyphens only)
                    </span>
                  )}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={pipeline.pipelineName}
                    onChange={(e) => {
                      if (!isEditMode) {
                        const value = e.target.value.toLowerCase(); // Force lowercase
                        updatePipeline(pIndex, 'pipelineName', value);
                      }
                    }}
                    required
                    readOnly={isEditMode}
                    maxLength={60}
                    style={{
                      ...isEditMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {},
                      borderColor: pipelineNameErrors[pIndex]?.length > 0 ? '#f44336' : undefined,
                      paddingRight: '60px'
                    }}
                  />
                  {!isEditMode && (
                    <span style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.85em',
                      color: pipeline.pipelineName.length > 60 ? '#f44336' : '#666'
                    }}>
                      {pipeline.pipelineName.length}/60
                    </span>
                  )}
                </div>
                {validatingPipelineName[pIndex] && (
                  <div style={{ fontSize: '0.85em', color: '#ff9800', marginTop: '5px' }}>
                    Validating pipeline name...
                  </div>
                )}
                {pipelineNameErrors[pIndex]?.length > 0 && (
                  <div style={{ fontSize: '0.85em', color: '#f44336', marginTop: '5px' }}>
                    {pipelineNameErrors[pIndex].map((error, idx) => (
                      <div key={idx}>• {error}</div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Repository Name: {isEditMode && <span style={{ color: '#666' }}>(Read-only)</span>}</label>
                <input
                  type="text"
                  value={pipeline.repositoryName}
                  onChange={(e) => !isEditMode && updatePipeline(pIndex, 'repositoryName', e.target.value)}
                  placeholder="owner/repository"
                  required
                  readOnly={isEditMode}
                  style={isEditMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                />
              </div>

              <div className="form-group">
                <label>
                  Branch Name: 
                  {isEditMode && (
                    <span style={{ color: '#4caf50', fontWeight: 'bold' }}> (Editable - Current: {editPipeline?.branchName})</span>
                  )}
                </label>
                <input
                  type="text"
                  value={pipeline.branchName}
                  onChange={(e) => updatePipeline(pIndex, 'branchName', e.target.value)}
                  placeholder="main"
                  required
                  style={isEditMode ? { backgroundColor: '#e8f5e9', border: '2px solid #4caf50' } : {}}
                />
              </div>

              {/* APPSETTINGS FILE MANAGEMENT - Edit existing content or upload new file */}
              <div className="form-group">
                <label>
                  Appsettings.json File:
                  {isEditMode && (
                    <span style={{ color: '#ff9800', fontWeight: 'bold' }}> (Edit content or re-upload to replace)</span>
                  )}
                </label>
                <div className="file-upload-section">
                  {/* Input mode toggle for create mode */}
                  {!isEditMode && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setAppsettingsInputMode('upload');
                            // Clear pasted content when switching to upload mode
                            updatePipeline(pIndex, 'appsettingsContent', undefined);
                          }}
                          style={{
                            backgroundColor: appsettingsInputMode === 'upload' ? '#2196f3' : '#f5f5f5',
                            color: appsettingsInputMode === 'upload' ? 'white' : '#333',
                            border: '1px solid #ddd',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Upload File
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAppsettingsInputMode('paste');
                            // Clear uploaded file when switching to paste mode
                            updatePipeline(pIndex, 'appsettingsFile', undefined);
                          }}
                          style={{
                            backgroundColor: appsettingsInputMode === 'paste' ? '#2196f3' : '#f5f5f5',
                            color: appsettingsInputMode === 'paste' ? 'white' : '#333',
                            border: '1px solid #ddd',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Copy & Paste
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Paste mode for create mode */}
                  {!isEditMode && appsettingsInputMode === 'paste' && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Paste Appsettings Content:
                      </label>
                      <textarea
                        value={pipeline.appsettingsContent || ''}
                        onChange={(e) => updatePipeline(pIndex, 'appsettingsContent', e.target.value)}
                        rows={15}
                        style={{
                          width: '100%',
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          padding: '10px'
                        }}
                        placeholder="Paste your appsettings.json content here..."
                      />
                      <small style={{ color: '#666' }}>
                        Paste your appsettings.json content above. This will be stored in the CodeCommit repository.
                      </small>
                    </div>
                  )}
                  
                  {isEditMode && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setEditingAppsettings(!editingAppsettings)}
                          style={{
                            backgroundColor: editingAppsettings ? '#f44336' : '#4caf50',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {editingAppsettings ? 'Cancel Edit' : 'Edit Current Content'}
                        </button>
                        {existingAppsettings && (
                          <span style={{ color: '#4caf50', alignSelf: 'center' }}>
                            ✓ Existing content loaded from CodeCommit
                          </span>
                        )}
                      </div>
                      
                      {appsettingsError && (
                        <div style={{ 
                          color: '#f44336', 
                          backgroundColor: '#ffebee', 
                          padding: '8px', 
                          borderRadius: '4px',
                          marginBottom: '10px',
                          fontSize: '14px'
                        }}>
                          {appsettingsError}
                        </div>
                      )}
                      
                      {editingAppsettings && (
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Edit Appsettings Content:
                          </label>
                          <textarea
                            value={pipeline.appsettingsContent || ''}
                            onChange={(e) => updatePipeline(pIndex, 'appsettingsContent', e.target.value)}
                            rows={15}
                            style={{
                              width: '100%',
                              fontFamily: 'monospace',
                              fontSize: '14px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              padding: '10px'
                            }}
                            placeholder="Enter your appsettings.json content here..."
                          />
                          <small style={{ color: '#666' }}>
                            Make your changes above. This will update the appsettings.json in CodeCommit when you save the pipeline.
                          </small>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* File upload section - show in edit mode or when upload mode is selected in create mode */}
                  {(isEditMode || (!isEditMode && appsettingsInputMode === 'upload')) && (
                    <>
                      <input
                        key={`appsettings-${pIndex}-${pipeline.appsettingsFile?.name || 'empty'}`}
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => handleAppsettingsUpload(pIndex, e.target.files?.[0] || null)}
                        style={isEditMode ? { backgroundColor: '#fff3e0', border: '2px solid #ff9800' } : {}}
                      />
                      {pipeline.appsettingsFile && (
                        <span className="file-info">
                          Selected: {pipeline.appsettingsFile.name}
                        </span>
                      )}
                      <small className="help-text">
                        {isEditMode 
                          ? 'Or upload a new appsettings.json file to completely replace the existing one'
                          : 'Upload appsettings.json to be stored in CodeCommit repository specified in APPSETTINGS_REPO environment variable'
                        }
                      </small>
                    </>
                  )}
                </div>
              </div>

              {/* ENVIRONMENT VARIABLES SECTION - Collapsible with autocomplete */}

              <div className="env-vars">
                <h4 
                  onClick={() => toggleEnvVars(pIndex)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Environment Variables {expandedEnvVars.includes(pIndex) ? '▼' : '▶'}
                </h4>
                {expandedEnvVars.includes(pIndex) && (
                  <>
                    {pipeline.environmentVariables.map((envVar, vIndex) => (
                      <div key={vIndex} className="env-var">
                        <input
                          type="text"
                          placeholder="Name"
                          value={envVar.name}
                          onChange={(e) => updateEnvironmentVariable(pIndex, vIndex, 'name', e.target.value)}
                          readOnly={['MANIFEST_REPO', 'APPSETTINGS_REPO'].includes(envVar.name)}
                          style={['MANIFEST_REPO', 'APPSETTINGS_REPO'].includes(envVar.name) ? 
                            { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                        />
                        <EnvVarInput
                          name={envVar.name}
                          value={envVar.value}
                          onChange={(value) => updateEnvironmentVariable(pIndex, vIndex, 'value', value)}
                          placeholder="Value"
                        />
                        <button 
                          type="button" 
                          onClick={() => removeEnvironmentVariable(pIndex, vIndex)}
                          disabled={['MANIFEST_REPO', 'APPSETTINGS_REPO'].includes(envVar.name)}
                          style={['MANIFEST_REPO', 'APPSETTINGS_REPO'].includes(envVar.name) ? 
                            { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addEnvironmentVariable(pIndex)}>Add Environment Variable</button>
                    <button 
                      type="button" 
                      onClick={() => {
                        const commonVars = [
                          { name: 'DOCKER_REPO_DIR', value: '' },
                          { name: 'SECRET_CREDS', value: '' },
                          { name: 'CLUSTER_ROLE_ARN', value: '' },
                          { name: 'CLUSTER_NAME', value: '' },
                          { name: 'ECR_REGISTRY', value: '' }
                        ];
                        const updated = [...pipelines];
                        updated[pIndex].environmentVariables = [
                          ...updated[pIndex].environmentVariables,
                          ...commonVars.filter(cv => 
                            !updated[pIndex].environmentVariables.some(ev => ev.name === cv.name)
                          )
                        ];
                        setPipelines(updated);
                      }}
                      style={{ marginLeft: '10px' }}
                    >
                      Add Common Variables
                    </button>
                  </>
                )}
              </div>

              {/* DEPLOYMENT CONFIGURATION - Show only in create mode */}
              {!isEditMode && (
                <>
                  <div className="deployment-config-section">
                    <button 
                      type="button" 
                      onClick={() => {
                        if (expandedDeploymentConfig.includes(pIndex)) {
                          setExpandedDeploymentConfig(expandedDeploymentConfig.filter(i => i !== pIndex));
                        } else {
                          setExpandedDeploymentConfig([...expandedDeploymentConfig, pIndex]);
                        }
                      }}
                      className="deployment-config-btn"
                      disabled={!pipeline.pipelineName}
                      title={!pipeline.pipelineName ? 'Please enter a pipeline name first' : 'Configure deployment settings'}
                    >
                      Deployment Config {pipeline.deploymentConfig ? '✓' : ''}
                    </button>
                    {pipeline.deploymentConfig && !expandedDeploymentConfig.includes(pIndex) && (
                      <span className="config-info">
                        {pipeline.deploymentConfig.namespace} | {pipeline.deploymentConfig.appType} | {pipeline.deploymentConfig.product}
                      </span>
                    )}
                  </div>

                  {expandedDeploymentConfig.includes(pIndex) && (
                    <DeploymentConfigInline
                      pipelineName={pipeline.pipelineName}
                      ecrUri={`465105616690.dkr.ecr.ap-south-1.amazonaws.com/${pipeline.pipelineName}`}
                      config={pipeline.deploymentConfig}
                      onSave={(config) => saveDeploymentConfig(pIndex, config)}
                      onClose={() => setExpandedDeploymentConfig(expandedDeploymentConfig.filter(i => i !== pIndex))}
                      isEditMode={isEditMode}
                      scalingConfig={pipeline.scalingConfig}
                    />
                  )}
                </>
              )}
              
              {/* MANIFEST CONTENT - Show only in edit mode */}
              {isEditMode && (
                <div className="manifest-content-section">
                  <button 
                    type="button" 
                    onClick={async () => {
                      if (showManifestContent) {
                        setShowManifestContent(false);
                        return;
                      }
                      
                      if (!pipeline.pipelineName) {
                        setMessage('Please enter a pipeline name first');
                        return;
                      }
                      
                      setLoadingManifest(true);
                      try {
                        const response = await axios.get(getApiUrl(`/api/pipelines/${pipeline.pipelineName}/manifest`));
                        if (response.data.success && response.data.exists) {
                          setManifestContent(response.data.content);
                          setShowManifestContent(true);
                        } else {
                          setManifestContent('No manifest found in CodeCommit for this pipeline.');
                          setShowManifestContent(true);
                        }
                      } catch (error: any) {
                        setManifestContent(`Error fetching manifest: ${error.response?.data?.error || error.message}`);
                        setShowManifestContent(true);
                      } finally {
                        setLoadingManifest(false);
                      }
                    }}
                    className="manifest-content-btn"
                    disabled={!pipeline.pipelineName || loadingManifest}
                    title={!pipeline.pipelineName ? 'Please enter a pipeline name first' : 'View manifest content from CodeCommit'}
                    style={{ backgroundColor: '#2196f3', color: 'white', border: '2px solid #2196f3', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    {loadingManifest ? 'Loading...' : (showManifestContent ? 'Hide Manifest Content' : 'Show Manifest Content')}
                  </button>
                  
                  {showManifestContent && (
                    <div className="manifest-content-display" style={{ marginTop: '15px' }}>
                      <h4>Kubernetes Manifest Content (from CodeCommit)</h4>
                      <pre style={{
                        backgroundColor: '#f5f5f5',
                        border: '1px solid #ddd',
                        padding: '15px',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        overflow: 'auto',
                        maxHeight: '400px',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {manifestContent}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* SCALING CONFIGURATION - Show only in create mode */}
              {!isEditMode && (
                <>
                  {/* SCALING CONFIGURATION - HPA or KEDA Kafka-based autoscaling */}
                  <div className="scaling-config-section">
                    <button 
                      type="button" 
                      onClick={() => {
                        if (expandedScalingConfig.includes(pIndex)) {
                          setExpandedScalingConfig(expandedScalingConfig.filter(i => i !== pIndex));
                        } else {
                          setExpandedScalingConfig([...expandedScalingConfig, pIndex]);
                        }
                      }}
                      className="scaling-config-btn"
                      disabled={!pipeline.pipelineName || !pipeline.deploymentConfig}
                      title={!pipeline.deploymentConfig ? 'Please configure deployment first' : 'Configure scaling settings'}
                    >
                      Need Scaling {pipeline.scalingConfig ? '✓' : ''}
                    </button>
                    {pipeline.scalingConfig && !expandedScalingConfig.includes(pIndex) && (
                      <span className="config-info">
                        {pipeline.scalingConfig.type === 'hpa' 
                          ? `HPA | ${pipeline.scalingConfig.minPods}-${pipeline.scalingConfig.maxPods} pods | CPU: ${pipeline.scalingConfig.cpuThreshold}%`
                          : `Kafka | ${pipeline.scalingConfig.minPods}-${pipeline.scalingConfig.maxPods} pods | Topic: ${pipeline.scalingConfig.topicName}`
                        }
                      </span>
                    )}
                  </div>

                  {expandedScalingConfig.includes(pIndex) && pipeline.deploymentConfig && (
                    <ScalingConfigComponent
                      pipelineName={pipeline.pipelineName}
                      namespace={pipeline.deploymentConfig.namespace}
                      config={pipeline.scalingConfig}
                      onSave={(config) => saveScalingConfig(pIndex, config)}
                      onClose={() => setExpandedScalingConfig(expandedScalingConfig.filter(i => i !== pIndex))}
                    />
                  )}
                </>
              )}

              {/* BUILD CONFIGURATION - Buildspec file path or inline YAML content - Hide in edit mode */}
              {!isEditMode && (
                <>
                  <div className="build-config-section">
                    <button 
                      type="button" 
                      onClick={() => {
                        if (expandedBuildConfig.includes(pIndex)) {
                          setExpandedBuildConfig(expandedBuildConfig.filter(i => i !== pIndex));
                        } else {
                          setExpandedBuildConfig([...expandedBuildConfig, pIndex]);
                        }
                      }}
                      className="build-config-btn"
                    >
                      Build Configuration {expandedBuildConfig.includes(pIndex) ? '▼' : '▶'}
                    </button>
                    {!expandedBuildConfig.includes(pIndex) && (
                      <span className="config-info">
                        Buildspec: {pipeline.useBuildspecFile ? pipeline.buildspecPath : 'Inline'} | 
                        Compute: {pipeline.computeType.replace('BUILD_GENERAL1_', '')}
                      </span>
                    )}
                  </div>

                  {expandedBuildConfig.includes(pIndex) && (
                <div className="build-config-content">
                  <div className="compact-row">
                    <div className="compact-group">
                      <label>Buildspec: {isEditMode && <span style={{color: '#666', fontSize: '0.9em'}}>(Read-only for existing pipelines)</span>}</label>
                      <div className="buildspec-compact">
                        <label className="radio-label-compact" style={isEditMode ? {opacity: 0.6, cursor: 'not-allowed'} : {}}>
                          <input
                            type="radio"
                            checked={pipeline.useBuildspecFile}
                            onChange={() => !isEditMode && updatePipeline(pIndex, 'useBuildspecFile', true)}
                            disabled={isEditMode}
                          />
                          File
                        </label>
                        <label className="radio-label-compact" style={isEditMode ? {opacity: 0.6, cursor: 'not-allowed'} : {}}>
                          <input
                            type="radio"
                            checked={!pipeline.useBuildspecFile}
                            onChange={() => !isEditMode && updatePipeline(pIndex, 'useBuildspecFile', false)}
                            disabled={isEditMode}
                          />
                          Inline
                        </label>
                        {pipeline.useBuildspecFile ? (
                          <input
                            type="text"
                            className="compact-input"
                            value={pipeline.buildspecPath}
                            onChange={(e) => !isEditMode && updatePipeline(pIndex, 'buildspecPath', e.target.value)}
                            placeholder="buildspec.yml"
                            required
                            disabled={isEditMode}
                            style={isEditMode ? {backgroundColor: '#f5f5f5', cursor: 'not-allowed'} : {}}
                          />
                        ) : (
                          isEditMode ? (
                            <span style={{color: '#666', fontSize: '0.9em'}}>
                              Inline buildspec (cannot be edited)
                            </span>
                          ) : (
                            <button 
                              type="button" 
                              onClick={() => setEditingBuildspecIndex(pIndex)}
                              className="edit-buildspec-btn-compact"
                            >
                              Edit
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="compact-group">
                      <label>Compute Type:</label>
                      <select
                        className="compact-select"
                        value={pipeline.computeType}
                        onChange={(e) => updatePipeline(pIndex, 'computeType', e.target.value)}
                      >
                        <option value="BUILD_GENERAL1_SMALL">Small</option>
                        <option value="BUILD_GENERAL1_MEDIUM">Medium</option>
                        <option value="BUILD_GENERAL1_LARGE">Large</option>
                        <option value="BUILD_GENERAL1_2XLARGE">2X Large</option>
                      </select>
                    </div>
                  </div>
                </div>
                  )}
                </>
              )}

              {/* REMOVE PIPELINE BUTTON - Only visible in create mode with multiple pipelines */}
              {pipelines.length > 1 && (
                <button type="button" onClick={() => removePipeline(pIndex)} className="remove-pipeline">
                  Remove Pipeline
                </button>
              )}
            </div>
          ))}
          
          {/* ADD PIPELINE BUTTON - Only available in create mode */}
          {!isEditMode && (
            <button type="button" onClick={addPipeline} className="add-pipeline">
              Add Another Pipeline
            </button>
          )}
        </div>

        {/* SUBMIT BUTTON - Changes text and behavior based on mode */}
        <div className="form-buttons">
          {isEditMode && (
            <button 
              type="button" 
              onClick={() => {
                // Release lock and navigate back
                if (editPipeline) {
                  releaseLock(editPipeline.name);
                }
                navigate('/pipelines');
              }}
              className="cancel-button"
              style={{
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Cancel Edit
            </button>
          )}
          <button type="submit" disabled={loading} className="submit-button">
            {loading 
              ? (isEditMode ? 'Updating Pipeline...' : 'Creating Pipelines...') 
              : (isEditMode ? 'Update Pipeline' : 'Create Pipelines')
            }
          </button>
        </div>
      </form>

      {/* SUCCESS/ERROR MESSAGE DISPLAY */}
      {message && (
        <div className={`message ${message.includes('Error') || message.includes('Failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* BUILDSPEC EDITOR MODAL - Only visible when editing buildspec */}
      {editingBuildspecIndex !== null && pipelines[editingBuildspecIndex]?.buildspec && (
        <BuildspecEditor
          buildspec={pipelines[editingBuildspecIndex].buildspec!}
          onUpdate={(buildspec) => updateBuildspec(editingBuildspecIndex, buildspec)}
          onClose={() => setEditingBuildspecIndex(null)}
        />
      )}

    </div>
  );
};

export default PipelineForm;