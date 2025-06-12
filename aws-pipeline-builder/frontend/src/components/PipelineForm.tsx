import React, { useState } from 'react';
import { PipelineConfig, EnvironmentVariable, DefaultValues } from '../types/Pipeline';
import axios from 'axios';

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
  codepipeline_role: 'staging-codepipeline-role',
  build_env_image: 'aws/codebuild/amazonlinux-x86_64-standard:5.0',
  build_env_type: 'LINUX_CONTAINER',
  build_privileged_mode: true,
  image_pull_credentials_type: 'CODEBUILD',
  codebuild_role: 'staging-codebuild-role',
  codebuild_sg: 'staging_codebuild_sg',
};

const PipelineForm: React.FC = () => {
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([{
    pipelineName: '',
    repositoryName: '',
    branchName: '',
    buildspecPath: '',
    computeType: 'BUILD_GENERAL1_SMALL',
    environmentVariables: []
  }]);
  
  const [defaults, setDefaults] = useState<DefaultValues>(defaultDefaults);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const addPipeline = () => {
    setPipelines([...pipelines, {
      pipelineName: '',
      repositoryName: '',
      branchName: '',
      buildspecPath: '',
      computeType: 'BUILD_GENERAL1_SMALL',
      environmentVariables: []
    }]);
  };

  const removePipeline = (index: number) => {
    setPipelines(pipelines.filter((_, i) => i !== index));
  };

  const updatePipeline = (index: number, field: keyof PipelineConfig, value: any) => {
    const updated = [...pipelines];
    updated[index] = { ...updated[index], [field]: value };
    setPipelines(updated);
  };

  const addEnvironmentVariable = (pipelineIndex: number) => {
    const updated = [...pipelines];
    updated[pipelineIndex].environmentVariables.push({ name: '', value: '' });
    setPipelines(updated);
  };

  const updateEnvironmentVariable = (pipelineIndex: number, varIndex: number, field: keyof EnvironmentVariable, value: string) => {
    const updated = [...pipelines];
    updated[pipelineIndex].environmentVariables[varIndex][field] = value;
    setPipelines(updated);
  };

  const removeEnvironmentVariable = (pipelineIndex: number, varIndex: number) => {
    const updated = [...pipelines];
    updated[pipelineIndex].environmentVariables.splice(varIndex, 1);
    setPipelines(updated);
  };

  const updateDefault = (field: keyof DefaultValues, value: any) => {
    setDefaults({ ...defaults, [field]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('http://localhost:5000/api/pipelines', {
        pipelines: pipelines.map(p => ({ ...p, defaults }))
      });

      if (response.data.success) {
        setMessage(`Successfully created ${response.data.pipelines.length} pipeline(s)!`);
        setPipelines([{
          pipelineName: '',
          repositoryName: '',
          branchName: '',
          buildspecPath: '',
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
                <label>Buildspec File Path:</label>
                <input
                  type="text"
                  value={pipeline.buildspecPath}
                  onChange={(e) => updatePipeline(pIndex, 'buildspecPath', e.target.value)}
                  placeholder="buildspec.yml"
                  required
                />
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
                <h4>Environment Variables</h4>
                {pipeline.environmentVariables.map((envVar, vIndex) => (
                  <div key={vIndex} className="env-var">
                    <input
                      type="text"
                      placeholder="Name"
                      value={envVar.name}
                      onChange={(e) => updateEnvironmentVariable(pIndex, vIndex, 'name', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={envVar.value}
                      onChange={(e) => updateEnvironmentVariable(pIndex, vIndex, 'value', e.target.value)}
                    />
                    <button type="button" onClick={() => removeEnvironmentVariable(pIndex, vIndex)}>Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => addEnvironmentVariable(pIndex)}>Add Environment Variable</button>
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
    </div>
  );
};

export default PipelineForm;