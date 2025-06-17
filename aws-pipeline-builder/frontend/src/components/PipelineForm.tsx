import React, { useState } from 'react';
import { PipelineConfig, EnvironmentVariable, DefaultValues, BuildspecConfig } from '../types/Pipeline';
import axios from 'axios';
import BuildspecEditor from './BuildspecEditor';
import EnvVarInput from './EnvVarInput';
import { getDefaultBuildspec } from '../utils/buildspecTemplate';

// Default configuration values for AWS services and IAM roles
const defaultDefaults: DefaultValues = {
  source_action_name: 'Source',
  source_category: 'Source',
  source_action_owner: 'AWS',
  source_provider: 'CodeStarSourceConnection',
  source_version: 1,
  codestar_connection_name: 'github-connections',
  build_action_name: 'BuildAction',
  build_category: 'Build',
  build_owner: 'AWS',
  build_provider: 'CodeBuild',
  build_version: 1,
  codepipeline_role: 'service-role/AWSCodePipelineServiceRole-ap-south-1-staging-mention',
  build_env_image: 'aws/codebuild/amazonlinux-x86_64-standard:5.0',
  build_env_type: 'LINUX_CONTAINER',
  build_privileged_mode: true,
  image_pull_credentials_type: 'CODEBUILD',
  codebuild_role: 'service-role/codebuild-prod-api-build-service-role',
  codebuild_sg: '',
};

/**
 * Main form component for creating AWS CodePipeline pipelines.
 * Allows users to configure multiple pipelines with their build settings,
 * environment variables, and AWS resource configurations.
 */
const PipelineForm: React.FC = () => {
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([{
    pipelineName: '',
    repositoryName: '',
    branchName: '',
    buildspecPath: 'buildspec.yml',
    useBuildspecFile: false,
    buildspec: getDefaultBuildspec(),
    computeType: 'BUILD_GENERAL1_SMALL',
    environmentVariables: []
  }]);
  
  const [defaults, setDefaults] = useState<DefaultValues>(defaultDefaults);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editingBuildspecIndex, setEditingBuildspecIndex] = useState<number | null>(null);
  const [expandedEnvVars, setExpandedEnvVars] = useState<number[]>([]);

  /**
   * Add a new pipeline configuration to the form with default values
   */
  const addPipeline = () => {
    setPipelines([...pipelines, {
      pipelineName: '',
      repositoryName: '',
      branchName: '',
      buildspecPath: 'buildspec.yml',
      useBuildspecFile: false,
      buildspec: getDefaultBuildspec(),
      computeType: 'BUILD_GENERAL1_SMALL',
      environmentVariables: []
    }]);
  };

  /**
   * Remove a pipeline configuration from the form by index
   */
  const removePipeline = (index: number) => {
    setPipelines(pipelines.filter((_, i) => i !== index));
  };

  /**
   * Update a specific field in a pipeline configuration
   */
  const updatePipeline = (index: number, field: keyof PipelineConfig, value: any) => {
    const updated = [...pipelines];
    updated[index] = { ...updated[index], [field]: value };
    setPipelines(updated);
  };

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
   * Update default AWS configuration values (currently unused in the form)
   */
  const updateDefault = (field: keyof DefaultValues, value: any) => {
    setDefaults({ ...defaults, [field]: value });
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
   * Handle form submission - sends pipeline configurations to backend API
   * Creates AWS resources including CodePipeline, CodeBuild, ECR, and S3
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/api/pipelines', {
        pipelines: pipelines.map(p => ({ ...p, defaults }))
      });

      if (response.data.success) {
        const createdPipelines = response.data.pipelines.map((p: any) => 
          `${p.pipelineName} (${p.status || 'created'})`
        ).join(', ');
        setMessage(`Successfully processed ${response.data.pipelines.length} pipeline(s): ${createdPipelines}`);
        setPipelines([{
          pipelineName: '',
          repositoryName: '',
          branchName: '',
          buildspecPath: 'buildspec.yml',
          useBuildspecFile: false,
          buildspec: getDefaultBuildspec(),
          computeType: 'BUILD_GENERAL1_SMALL',
          environmentVariables: []
        }]);
      } else {
        setMessage(`Error: ${response.data.error}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pipeline-form">
      <h1>AWS Pipeline Builder</h1>
      
      <form onSubmit={handleSubmit}>
        <div className="section">
          <h2>Pipelines</h2>
          {pipelines.map((pipeline, pIndex) => (
            <div key={pIndex} className="pipeline-config">
              <h3>Pipeline {pIndex + 1}</h3>
              
              <div className="form-group">
                <label>Pipeline Name:</label>
                <input
                  type="text"
                  value={pipeline.pipelineName}
                  onChange={(e) => updatePipeline(pIndex, 'pipelineName', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Repository Name:</label>
                <input
                  type="text"
                  value={pipeline.repositoryName}
                  onChange={(e) => updatePipeline(pIndex, 'repositoryName', e.target.value)}
                  placeholder="owner/repository"
                  required
                />
              </div>

              <div className="form-group">
                <label>Branch Name:</label>
                <input
                  type="text"
                  value={pipeline.branchName}
                  onChange={(e) => updatePipeline(pIndex, 'branchName', e.target.value)}
                  placeholder="main"
                  required
                />
              </div>

              <div className="form-group">
                <label>Buildspec Configuration:</label>
                <div className="buildspec-options">
                  <label className="radio-label">
                    <input
                      type="radio"
                      checked={pipeline.useBuildspecFile}
                      onChange={() => updatePipeline(pIndex, 'useBuildspecFile', true)}
                    />
                    Use buildspec file
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      checked={!pipeline.useBuildspecFile}
                      onChange={() => updatePipeline(pIndex, 'useBuildspecFile', false)}
                    />
                    Use inline buildspec commands
                  </label>
                </div>
                
                {pipeline.useBuildspecFile ? (
                  <input
                    type="text"
                    value={pipeline.buildspecPath}
                    onChange={(e) => updatePipeline(pIndex, 'buildspecPath', e.target.value)}
                    placeholder="buildspec.yml"
                    required
                  />
                ) : (
                  <button 
                    type="button" 
                    onClick={() => setEditingBuildspecIndex(pIndex)}
                    className="edit-buildspec-btn"
                  >
                    View/Edit Buildspec
                  </button>
                )}
              </div>

              <div className="form-group">
                <label>Compute Type:</label>
                <select
                  value={pipeline.computeType}
                  onChange={(e) => updatePipeline(pIndex, 'computeType', e.target.value)}
                >
                  <option value="BUILD_GENERAL1_SMALL">Small</option>
                  <option value="BUILD_GENERAL1_MEDIUM">Medium</option>
                  <option value="BUILD_GENERAL1_LARGE">Large</option>
                  <option value="BUILD_GENERAL1_2XLARGE">2X Large</option>
                </select>
              </div>

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
                        />
                        <EnvVarInput
                          name={envVar.name}
                          value={envVar.value}
                          onChange={(value) => updateEnvironmentVariable(pIndex, vIndex, 'value', value)}
                          placeholder="Value"
                        />
                        <button type="button" onClick={() => removeEnvironmentVariable(pIndex, vIndex)}>Remove</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addEnvironmentVariable(pIndex)}>Add Environment Variable</button>
                    <button 
                      type="button" 
                      onClick={() => {
                        const commonVars = [
                          { name: 'DOCKER_REPO_DIR', value: '' },
                          { name: 'SMCREDS', value: '' },
                          { name: 'APPSETTINGS_REPO', value: '' },
                          { name: 'MANIFEST_REPO', value: '' },
                          { name: 'CLUSTER_ROLE_ARN', value: '' }
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

              {pipelines.length > 1 && (
                <button type="button" onClick={() => removePipeline(pIndex)} className="remove-pipeline">
                  Remove Pipeline
                </button>
              )}
            </div>
          ))}
          
          <button type="button" onClick={addPipeline} className="add-pipeline">
            Add Another Pipeline
          </button>
        </div>

        <div className="section">
          <h2>Default Configuration (Editable)</h2>
          
          <div className="defaults-grid">
            <div className="form-group">
              <label>Source Action Name:</label>
              <input
                type="text"
                value={defaults.source_action_name}
                onChange={(e) => updateDefault('source_action_name', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>CodeStar Connection Name:</label>
              <input
                type="text"
                value={defaults.codestar_connection_name}
                onChange={(e) => updateDefault('codestar_connection_name', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>CodePipeline Role:</label>
              <input
                type="text"
                value={defaults.codepipeline_role}
                onChange={(e) => updateDefault('codepipeline_role', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>CodeBuild Role:</label>
              <input
                type="text"
                value={defaults.codebuild_role}
                onChange={(e) => updateDefault('codebuild_role', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Build Environment Image:</label>
              <input
                type="text"
                value={defaults.build_env_image}
                onChange={(e) => updateDefault('build_env_image', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>CodeBuild Security Group:</label>
              <input
                type="text"
                value={defaults.codebuild_sg}
                onChange={(e) => updateDefault('codebuild_sg', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Privileged Mode:</label>
              <input
                type="checkbox"
                checked={defaults.build_privileged_mode}
                onChange={(e) => updateDefault('build_privileged_mode', e.target.checked)}
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? 'Creating Pipelines...' : 'Create Pipelines'}
        </button>
      </form>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

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