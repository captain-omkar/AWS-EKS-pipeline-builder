import React, { useState, useEffect } from 'react';
import { DeploymentConfig as DeploymentConfigType } from '../types/Pipeline';
import { generateK8sManifest, getDefaultDeploymentConfig } from '../utils/manifestTemplate';

interface DeploymentConfigProps {
  pipelineName: string;
  ecrUri: string;
  config?: DeploymentConfigType;
  onSave: (config: DeploymentConfigType) => void;
  onClose: () => void;
}

const DeploymentConfig: React.FC<DeploymentConfigProps> = ({
  pipelineName,
  ecrUri,
  config,
  onSave,
  onClose
}) => {
  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfigType>(
    config || getDefaultDeploymentConfig()
  );
  const [showPreview, setShowPreview] = useState(false);
  const [generatedManifest, setGeneratedManifest] = useState<string>('');
  const [loadingManifest, setLoadingManifest] = useState(false);

  const handleInputChange = (field: keyof DeploymentConfigType, value: string) => {
    setDeploymentConfig({
      ...deploymentConfig,
      [field]: value
    });
  };

  useEffect(() => {
    const loadManifest = async () => {
      setLoadingManifest(true);
      try {
        const manifest = await generateK8sManifest(pipelineName, ecrUri, deploymentConfig);
        setGeneratedManifest(manifest);
      } catch (error) {
        console.error('Failed to generate manifest:', error);
        setGeneratedManifest('Failed to generate manifest');
      } finally {
        setLoadingManifest(false);
      }
    };

    loadManifest();
  }, [pipelineName, ecrUri, deploymentConfig]);

  const handleSave = () => {
    onSave(deploymentConfig);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content deployment-config-modal">
        <div className="modal-header">
          <h2>Deployment Configuration</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="deployment-config-content">
          {!showPreview ? (
            <div className="config-form">
              <div className="config-info">
                <p><strong>Pipeline Name:</strong> {pipelineName}</p>
                <p><strong>ECR Image:</strong> {ecrUri}:latest</p>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Namespace:</label>
                  <select
                    value={deploymentConfig.namespace}
                    onChange={(e) => handleInputChange('namespace', e.target.value)}
                  >
                    <option value="staging-locobuzz">staging-locobuzz</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>App Type:</label>
                  <select
                    value={deploymentConfig.appType}
                    onChange={(e) => handleInputChange('appType', e.target.value)}
                  >
                    <option value="csharp">C#</option>
                    <option value="python">Python</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Product:</label>
                  <select
                    value={deploymentConfig.product}
                    onChange={(e) => handleInputChange('product', e.target.value)}
                  >
                    <option value="cmo">CMO</option>
                    <option value="modernization">Modernization</option>
                    <option value="newsverse">Newsverse</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Node Group:</label>
                  <input
                    type="text"
                    value={deploymentConfig.nodeGroup}
                    onChange={(e) => handleInputChange('nodeGroup', e.target.value)}
                  />
                </div>
              </div>

              <h3>Resource Limits</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Memory Limit:</label>
                  <input
                    type="text"
                    value={deploymentConfig.memoryLimit}
                    onChange={(e) => handleInputChange('memoryLimit', e.target.value)}
                    placeholder="e.g., 300Mi"
                  />
                </div>

                <div className="form-group">
                  <label>CPU Limit:</label>
                  <input
                    type="text"
                    value={deploymentConfig.cpuLimit}
                    onChange={(e) => handleInputChange('cpuLimit', e.target.value)}
                    placeholder="e.g., 300m"
                  />
                </div>
              </div>

              <h3>Resource Requests</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Memory Request:</label>
                  <input
                    type="text"
                    value={deploymentConfig.memoryRequest}
                    onChange={(e) => handleInputChange('memoryRequest', e.target.value)}
                    placeholder="e.g., 150Mi"
                  />
                </div>

                <div className="form-group">
                  <label>CPU Request:</label>
                  <input
                    type="text"
                    value={deploymentConfig.cpuRequest}
                    onChange={(e) => handleInputChange('cpuRequest', e.target.value)}
                    placeholder="e.g., 150m"
                  />
                </div>
              </div>

              <div className="button-group">
                <button className="preview-button" onClick={() => setShowPreview(true)}>
                  Preview Manifest
                </button>
                <button className="save-button" onClick={handleSave}>
                  Save Configuration
                </button>
                <button className="cancel-button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="manifest-preview">
              <h3>Generated Kubernetes Manifest</h3>
              <p className="preview-info">
                This manifest will be saved as <strong>{pipelineName}.yml</strong> in the root of MANIFEST_REPO repository
              </p>
              <pre className="manifest-code">
                {loadingManifest ? 'Loading manifest...' : generatedManifest}
              </pre>
              <div className="button-group">
                <button className="back-button" onClick={() => setShowPreview(false)}>
                  Back to Configuration
                </button>
                <button className="save-button" onClick={handleSave}>
                  Save & Upload
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeploymentConfig;